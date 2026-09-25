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
 *   GET    /usage        storage used, and the billing hard stops (token)
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
  R2_STORAGE_CAP_BYTES: string;    // wrangler.jsonc `vars`, see BILLING HARD STOPS
  R2_CLASS_A_DAILY_BUDGET: string; // wrangler.jsonc `vars`, see BILLING HARD STOPS
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

    // Billing hard stops, checked before any R2 operation happens. If they
    // cannot be checked, refuse: an unchecked upload is how a bill starts.
    try {
      const limits = r2Limits(env);
      if (!(await spendClassA(env, 1, limits.classADaily))) {
        return json({ error: "r2_daily_limit", budget: limits.classADaily }, 429);
      }
      if (!(await reserveStorage(env, key, size, limits.storageCap))) {
        return json(
          { error: "storage_full", capBytes: limits.storageCap, usedBytes: await storedBytes(env) },
          507,
        );
      }
    } catch (err) {
      return json({ error: "limits_unavailable", message: (err as Error).message }, 503);
    }

    let obj: R2Object;
    try {
      obj = await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
    } catch (err) {
      // The ledger already counts this upload. Make it match what R2 holds.
      await settleFailedPut(env, key).catch(() => undefined);
      return json({ error: "storage_error", message: (err as Error).message }, 502);
    }
    if (obj.size !== size) await recordSize(env, key, obj.size);

    // The bucket name comes back so the app records media_asset.r2_bucket from
    // one source of truth, rather than a second env var that could be scoped
    // wrong and leave the sweeper refusing to reap the object.
    return json({ key: obj.key, size: obj.size, bucket: env.MEDIA_BUCKET_NAME }, 201);
  }

  if (request.method === "DELETE") {
    await env.MEDIA.delete(key); // idempotent: deleting a missing key is not an error
    // Bytes first, ledger second. If this step fails the ledger over-counts,
    // which only makes the storage cap stricter.
    await forgetObject(env, key).catch((err) => console.error("ledger delete failed:", key, err));
    return new Response(null, { status: 204 });
  }

  return json({ error: "method_not_allowed" }, 405);
}

/**
 * BILLING HARD STOPS
 *
 * R2 is the only part of this stack that can produce a bill. On the free plans
 * D1 and Workers refuse requests past their limits; R2 bills anything past its
 * free allowance, and Cloudflare offers no spending cap. So this Worker keeps
 * each billable R2 dimension under its free amount itself:
 *
 *   Storage   10 GB free. Uploads are refused once stored files would pass
 *             R2_STORAGE_CAP_BYTES, checked against the r2_object ledger
 *             (migration 0004) rather than by listing the bucket.
 *   Class A   1M a month free (uploads, listings). At most
 *             R2_CLASS_A_DAILY_BUDGET a day, so no 31-day window can pass the
 *             free amount, whatever day the billing period starts on.
 *   Class B   10M a month free (reads). Not counted here: each Worker request
 *             makes at most one read, and the free Workers plan refuses
 *             requests past 100,000 a day across the account (Error 1027),
 *             which caps reads at 3.1M a month.
 *   Deletes   always free.
 *
 * The free amounts belong to the ACCOUNT and are shared by every bucket on it,
 * so production and preview each get a share through their vars in
 * wrangler.jsonc. Neither Worker can see the other's share. Each clamps its own
 * to the account totals below; keeping the two shares' sum within them is up
 * to whoever edits those vars.
 *
 * The guarantee holds while the account stays on the free Workers plan and
 * nothing reaches the buckets except these Workers. Serving a bucket from a
 * public custom domain, or uploading with wrangler or the dashboard, would
 * bypass these checks.
 *
 * Every check fails closed. If the limits are not configured, or D1 cannot be
 * reached to check them, uploads are refused.
 */
const R2_ACCOUNT_STORAGE_CAP = 9 * 1000 * 1000 * 1000; // 90% of the free 10 GB
const R2_ACCOUNT_CLASS_A_DAILY = 30_000; // x 31 days = 930,000, under the free 1,000,000

/** D1's own limit, shown on the dashboard. At it, writes fail; the free plan never bills. */
const D1_LIMIT_BYTES = 500 * 1000 * 1000;

/** Pages of 1,000 objects that ?verify=1 may list in one request (2 subrequests each). */
const R2_LIST_MAX_PAGES = 20;

const utcDay = () => new Date().toISOString().slice(0, 10);

const percent = (part: number, whole: number) =>
  Math.round((part / whole) * 10_000) / 100;

function r2Limits(env: Env) {
  const storageCap = Number(env.R2_STORAGE_CAP_BYTES);
  const classADaily = Math.floor(Number(env.R2_CLASS_A_DAILY_BUDGET));
  if (!(storageCap > 0) || !(classADaily > 0)) {
    throw new Error("R2_STORAGE_CAP_BYTES and R2_CLASS_A_DAILY_BUDGET must be set in wrangler.jsonc");
  }
  return {
    storageCap: Math.min(storageCap, R2_ACCOUNT_STORAGE_CAP),
    classADaily: Math.min(classADaily, R2_ACCOUNT_CLASS_A_DAILY),
  };
}

/** Spend n Class A operations from today's budget. False, and nothing spent, if that would exceed it. */
async function spendClassA(env: Env, n: number, budget: number): Promise<boolean> {
  if (n > budget) return false;
  const result = await env.DB.prepare(
    `INSERT INTO r2_class_a_day (r2_bucket, day, ops) VALUES (?1, ?2, ?3)
     ON CONFLICT (r2_bucket, day) DO UPDATE SET ops = ops + excluded.ops
      WHERE ops + excluded.ops <= ?4`,
  ).bind(env.MEDIA_BUCKET_NAME, utcDay(), n, budget).run();
  return result.meta.changes === 1;
}

/**
 * Count `key` in the ledger if the bucket stays within the cap. It is a single
 * statement, so two uploads racing for the last bytes cannot both get in. An
 * existing key (an overwrite) is counted at its new size, not twice.
 */
async function reserveStorage(env: Env, key: string, size: number, cap: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO r2_object (r2_bucket, r2_key, byte_size)
     SELECT ?1, ?2, ?3
      WHERE (SELECT coalesce(sum(byte_size), 0) FROM r2_object
              WHERE r2_bucket = ?1 AND r2_key <> ?2) + ?3 <= ?4
     ON CONFLICT (r2_bucket, r2_key) DO UPDATE
        SET byte_size = excluded.byte_size, stored_at = ${NOW}`,
  ).bind(env.MEDIA_BUCKET_NAME, key, size, cap).run();
  return result.meta.changes === 1;
}

function recordSize(env: Env, key: string, size: number) {
  return env.DB.prepare(
    "UPDATE r2_object SET byte_size = ?3 WHERE r2_bucket = ?1 AND r2_key = ?2",
  ).bind(env.MEDIA_BUCKET_NAME, key, size).run();
}

function forgetObject(env: Env, key: string) {
  return env.DB.prepare(
    "DELETE FROM r2_object WHERE r2_bucket = ?1 AND r2_key = ?2",
  ).bind(env.MEDIA_BUCKET_NAME, key).run();
}

async function storedBytes(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT coalesce(sum(byte_size), 0) AS bytes FROM r2_object WHERE r2_bucket = ?1",
  ).bind(env.MEDIA_BUCKET_NAME).first<{ bytes: number }>();
  return row?.bytes ?? 0;
}

/** After a failed put, make the ledger match what R2 actually holds for `key`. */
async function settleFailedPut(env: Env, key: string) {
  // A HEAD is a read, and this request has made no other.
  const existing = await env.MEDIA.head(key);
  if (existing) await recordSize(env, key, existing.size);
  else await forgetObject(env, key);
}

async function measureUsage(env: Env, verify: boolean) {
  const limits = r2Limits(env);

  // One D1 query reads the ledger and today's budget, and its result also
  // reports the database size. No R2 operation is involved.
  const result = await env.DB.prepare(
    `SELECT (SELECT coalesce(sum(byte_size), 0) FROM r2_object WHERE r2_bucket = ?1) AS bytes,
            (SELECT count(*) FROM r2_object WHERE r2_bucket = ?1) AS objects,
            (SELECT coalesce(max(ops), 0) FROM r2_class_a_day
              WHERE r2_bucket = ?1 AND day = ?2) AS class_a`,
  ).bind(env.MEDIA_BUCKET_NAME, utcDay()).all<{ bytes: number; objects: number; class_a: number }>();

  const { bytes, objects, class_a } = result.results[0];
  const d1Bytes = result.meta.size_after;
  const remainingBytes = Math.max(0, limits.storageCap - bytes);

  const usage = {
    measuredAt: new Date().toISOString(),
    d1: {
      bytes: d1Bytes,
      limitBytes: D1_LIMIT_BYTES,
      percentUsed: percent(d1Bytes, D1_LIMIT_BYTES),
    },
    r2: {
      bucket: env.MEDIA_BUCKET_NAME,
      bytes,
      objects,
      limitBytes: limits.storageCap,
      remainingBytes,
      percentUsed: percent(bytes, limits.storageCap),
      classAToday: { used: class_a, budget: limits.classADaily },
      uploadsBlocked: remainingBytes === 0 || class_a >= limits.classADaily,
    },
  };

  if (!verify) return usage;
  return { ...usage, verify: await listBucket(env, limits.classADaily, bytes, objects) };
}

/**
 * ?verify=1: list the bucket itself and compare with the ledger. Each page is a
 * Class A operation spent from the daily budget; if the budget runs out, or the
 * page limit is reached, the listing stops and is reported incomplete.
 */
async function listBucket(env: Env, budget: number, trackedBytes: number, trackedObjects: number) {
  let bytes = 0;
  let objects = 0;
  let pages = 0;
  let cursor: string | undefined;
  let budgetSpent = false;

  do {
    if (!(await spendClassA(env, 1, budget))) {
      budgetSpent = true;
      break;
    }
    const page = await env.MEDIA.list({ cursor, limit: 1000 });
    for (const object of page.objects) {
      bytes += object.size;
      objects++;
    }
    cursor = page.truncated ? page.cursor : undefined;
    pages++;
  } while (cursor && pages < R2_LIST_MAX_PAGES);

  const complete = !budgetSpent && cursor === undefined;
  return {
    bytes,
    objects,
    pages,
    complete,
    // Positive means R2 holds files the ledger does not know about, for
    // example files stored before migration 0004.
    driftBytes: complete ? bytes - trackedBytes : null,
    driftObjects: complete ? objects - trackedObjects : null,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) {
      return handleMedia(request, env, url.pathname.slice("/media/".length));
    }

    if (url.pathname === "/usage") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      if (!env.PROXY_TOKEN) return json({ error: "proxy_misconfigured" }, 500);
      if (!(await authorized(request, env.PROXY_TOKEN))) {
        return json({ error: "unauthorized" }, 401);
      }
      try {
        return json(await measureUsage(env, url.searchParams.get("verify") === "1"));
      } catch (err) {
        return json({ error: "usage_unavailable", message: (err as Error).message }, 503);
      }
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
