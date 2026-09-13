/**
 * TEAZO D1 proxy Worker.
 *
 * The Next.js app runs on Vercel and therefore has no Cloudflare bindings.
 * D1 is only reachable from a Worker — Cloudflare's own docs say so:
 *
 *   "To access a D1 database outside of a Worker project, you need to create
 *    an API using a Worker."
 *   https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/
 *
 * The D1 REST API is not an alternative for the request path: Cloudflare
 * describes it as "best suited for administrative use as the global Cloudflare
 * API rate limit applies".
 *
 * So this file is the ONE place in the repo that holds Cloudflare bindings.
 * It exposes:
 *
 *   POST   /query        { sql, params }                -> one statement
 *   POST   /batch        { statements: [{sql,params}] } -> env.DB.batch(), all-or-nothing
 *   GET    /media/<key>  public read of an R2 object
 *   PUT    /media/<key>  write an R2 object (token)
 *   DELETE /media/<key>  delete an R2 object (token)
 *   scheduled()          the sweeper: deletes the R2 bytes of files that
 *                        were queued for deletion more than 24 hours ago
 *
 * TRUST BOUNDARY: this accepts arbitrary SQL from whoever holds the bearer
 * token. That is the same trust level as the Next.js server itself, which is
 * the only intended caller. The token is a server-side Vercel environment
 * variable and MUST NEVER be exposed to the browser (never NEXT_PUBLIC_*).
 * If the token leaks, the database is fully compromised — rotate it with
 * `wrangler secret put PROXY_TOKEN` and update Vercel in the same sitting.
 */

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  MEDIA_BUCKET_NAME: string; // wrangler.jsonc `vars`
  PROXY_TOKEN: string;       // wrangler secret put PROXY_TOKEN
}

type Stmt = { sql: string; params?: unknown[] };

/**
 * Sized for the FREE plan, which is what this project runs on.
 *
 *   D1:      50 queries per Worker invocation   (1000 on Workers Paid)
 *   Workers: 50 subrequests per request         (1000 on Workers Paid)
 *
 * A /batch of N statements costs N D1 queries, so 40 leaves headroom under
 * the 50 cap. Raising this above 50 silently breaks on free — the request
 * fails partway, and because batch() is all-or-nothing you get a confusing
 * "nothing happened" rather than an obvious limit error.
 *
 * On Workers Paid this can go to ~500.
 */
const MAX_STATEMENTS = 40;
const MAX_BODY_BYTES = 1_000_000;

/**
 * Every timestamp column in 0001_init.sql is written with exactly this
 * expression. Never compare one against datetime('now', ...) — that yields
 * "2026-09-07 08:05:53" (a space where the T is, no fraction, no Z). These are
 * compared as strings, and 'T' (0x54) sorts above ' ' (0x20), so the
 * comparison is silently wrong for same-day rows rather than failing loudly.
 */
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Grace period before bytes are reaped. This gap is the only undo window the
 *  media pipeline has: while it lasts, a deletion is reversed by clearing
 *  deleted_at on the media row and its owner and removing the pending row.
 *  Once the bytes are gone they are gone — R2 has no versioning here. Do not
 *  shorten it; queued rows cost nothing. */
const REAP_GRACE_HOURS = 24;
const REAP_CUTOFF = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${REAP_GRACE_HOURS} hours')`;
/**
 * Rows reaped per cron run. Each row costs TWO subrequests (one R2 delete,
 * one D1 update), and the free plan allows 50 subrequests per invocation.
 * 20 rows = 40, plus the initial SELECT and the stray-row count = 42. Under
 * the cap with room to spare.
 *
 * At hourly, this drains 480 objects/day — far more than this shop will ever
 * delete. Raise it only alongside Workers Paid.
 */
const REAP_LIMIT = 20;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Constant-time bearer check. Both sides are hashed first so the comparison is
 * always over two 32-byte digests and never branches on length, which would
 * otherwise leak the token's length through timing.
 */
async function authorized(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;

  const enc = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(header.slice(7))),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  return crypto.subtle.timingSafeEqual(given, expected);
}

function prepare(env: Env, s: Stmt): D1PreparedStatement {
  if (typeof s?.sql !== "string" || !s.sql.trim()) throw new Error("sql required");
  const stmt = env.DB.prepare(s.sql);
  const params = s.params ?? [];
  return params.length ? stmt.bind(...params) : stmt;
}

/**
 * Media. The app writes files to R2 through here rather than through R2's S3
 * API, for two reasons:
 *
 *   1. Local development needs no Cloudflare credentials at all. `wrangler dev`
 *      simulates R2 behind this binding exactly as it simulates D1, so a fresh
 *      clone gets a working bucket with nothing to configure.
 *   2. Vercel needs one secret (PROXY_TOKEN) instead of a second set of R2
 *      access keys.
 *
 *   GET    /media/<key>   public — the site's images are public anyway
 *   PUT    /media/<key>   token required; body is the file, Content-Type set
 *   DELETE /media/<key>   token required; idempotent
 */
const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // backstop — the app resizes before upload
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
/** Keys the app mints look like gallery/2026/09/<uuid>.webp. */
const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,511}$/i;

async function handleMedia(request: Request, env: Env, rawKey: string): Promise<Response> {
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    return json({ error: "bad_key" }, 400);
  }
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    return json({ error: "bad_key" }, 400);
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const obj = await env.MEDIA.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    // Keys are UUIDs and never reused, so a cached copy can never go stale.
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(request.method === "HEAD" ? null : obj.body, { headers });
  }

  if (!env.PROXY_TOKEN) return json({ error: "proxy_misconfigured" }, 500);
  if (!(await authorized(request, env.PROXY_TOKEN))) return json({ error: "unauthorized" }, 401);

  if (request.method === "PUT") {
    const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!MEDIA_TYPES.has(type)) return json({ error: "unsupported_type" }, 415);
    const size = Number(request.headers.get("content-length"));
    if (!Number.isFinite(size) || size <= 0) return json({ error: "length_required" }, 411);
    if (size > MAX_MEDIA_BYTES) return json({ error: "payload_too_large", max: MAX_MEDIA_BYTES }, 413);
    if (!request.body) return json({ error: "empty_body" }, 400);
    const obj = await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
    // The bucket name comes back so the app records media_asset.r2_bucket from
    // one source of truth, rather than a second env var that could be scoped
    // wrong and leave the sweeper refusing to reap the object.
    return json({ key: obj.key, size: obj.size, bucket: env.MEDIA_BUCKET_NAME }, 201);
  }

  if (request.method === "DELETE") {
    await env.MEDIA.delete(key); // idempotent: deleting a missing key is not an error
    return new Response(null, { status: 204 });
  }

  return json({ error: "method_not_allowed" }, 405);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) {
      return handleMedia(request, env, url.pathname.slice("/media/".length));
    }

    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.PROXY_TOKEN) return json({ error: "proxy_misconfigured" }, 500);
    if (!(await authorized(request, env.PROXY_TOKEN))) {
      return json({ error: "unauthorized" }, 401);
    }
    // Require the length rather than defaulting it to 0: a request that omits
    // content-length would otherwise sail past this check and be buffered whole
    // by request.json() below. The /media PUT path takes the same line.
    const declared = Number(request.headers.get("content-length"));
    if (!Number.isFinite(declared) || declared <= 0) {
      return json({ error: "length_required" }, 411);
    }
    if (declared > MAX_BODY_BYTES) {
      return json({ error: "payload_too_large", max: MAX_BODY_BYTES }, 413);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }

    const path = new URL(request.url).pathname;

    try {
      // One statement. D1's prepare() rejects a string containing more than
      // one, so "one request, one statement" is enforced by D1, not by us.
      if (path === "/query") {
        return json(await prepare(env, body as Stmt).all());
      }

      // Many statements, all-or-nothing. The whole array arrives in THIS
      // request and goes into ONE batch() call. This is the only place in the
      // system where a transaction exists, so anything that must be atomic
      // has to be sent as a single /batch request.
      if (path === "/batch") {
        const { statements } = body as { statements?: Stmt[] };
        if (!Array.isArray(statements) || statements.length === 0) {
          return json({ error: "statements_required" }, 400);
        }
        if (statements.length > MAX_STATEMENTS) {
          return json({ error: "too_many_statements", max: MAX_STATEMENTS }, 400);
        }
        const results = await env.DB.batch(statements.map((s) => prepare(env, s)));
        return json({ results });
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      // D1 constraint failures land here. Pass the message through so the app
      // can recognise e.g. "media_asset is still referenced" — raised by the
      // guard trigger when something still points at the file — and turn it
      // into a 409 rather than a generic 500.
      return json({ error: "d1_error", message: (err as Error).message }, 400);
    }
  },

  /**
   * The sweeper. Deleting a file only queues it in pending_r2_deletion; this
   * removes the bytes from R2 once the grace period has passed. D1 has no
   * scheduled jobs of its own, so without this the bytes would stay forever.
   */
  async scheduled(_c: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const swept = await reapDeletedObjects(env);
    if (swept.otherBucket > 0) {
      console.warn(
        `sweep: ${swept.otherBucket} row(s) are queued against a bucket other than ` +
        `${env.MEDIA_BUCKET_NAME}; this Worker will never reap them`
      );
    }
    console.log("sweep ok:", JSON.stringify(swept));
  },
} satisfies ExportedHandler<Env>;

async function reapDeletedObjects(env: Env) {
  // A preview sweeper must never delete production bytes, which is why
  // pending_r2_deletion records the bucket and not only the key. That filter
  // belongs in the SQL, not only in the loop below: a row this Worker cannot
  // retire would otherwise sit at the head of the queue forever, so once
  // REAP_LIMIT of them accumulated every run would select the same rows, reap
  // nothing, and still log "sweep ok" while R2 grew without bound. Filtered
  // here, they never enter the window and a real backlog keeps draining.
  const { results } = await env.DB.prepare(
    `SELECT id, r2_bucket, r2_key
       FROM pending_r2_deletion
      WHERE deleted_at IS NULL
        AND r2_bucket = ?1
        AND queued_at < ${REAP_CUTOFF}
      ORDER BY queued_at
      LIMIT ${REAP_LIMIT}`
  ).bind(env.MEDIA_BUCKET_NAME).all<{ id: string; r2_bucket: string; r2_key: string }>();

  let reaped = 0;

  for (const row of results) {
    try {
      // Bytes first, mark second — the mirror image of the upload rule.
      // R2 deletes are idempotent, so crashing here just retries next hour.
      // Marking D1 first and then failing in R2 would leak the bytes forever,
      // with no row left to say they exist.
      await env.MEDIA.delete(row.r2_key);
      await env.DB.prepare(
        `UPDATE pending_r2_deletion SET deleted_at = ${NOW}, last_error = NULL WHERE id = ?1`
      ).bind(row.id).run();
      reaped++;
    } catch (err) {
      // Recording the failure is itself a D1 write, and D1 is the most likely
      // thing to be failing at this point. Unguarded, it would throw straight
      // out of the loop and abandon every row after this one.
      try {
        await note(env, row.id, String(err));
      } catch (noteErr) {
        console.error("sweep: could not record error for", row.id, err, noteErr);
      }
    }
  }

  // Rows that are due but belong to another bucket are not something the
  // sweeper can fix — they mean MEDIA_BUCKET_NAME changed or a bucket was
  // renamed. Count them so the condition is visible rather than silent.
  const { results: strays } = await env.DB.prepare(
    `SELECT count(*) AS n
       FROM pending_r2_deletion
      WHERE deleted_at IS NULL
        AND r2_bucket <> ?1
        AND queued_at < ${REAP_CUTOFF}`
  ).bind(env.MEDIA_BUCKET_NAME).all<{ n: number }>();

  return { reaped, scanned: results.length, otherBucket: strays[0]?.n ?? 0 };
}

function note(env: Env, id: string, message: string) {
  return env.DB
    .prepare("UPDATE pending_r2_deletion SET last_error = ?2 WHERE id = ?1")
    .bind(id, message.slice(0, 500))
    .run();
}
