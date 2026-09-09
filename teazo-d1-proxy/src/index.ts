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
 * It exposes exactly two endpoints and one cron:
 *
 *   POST /query   { sql, params }              -> one statement
 *   POST /batch   { statements: [{sql,params}] } -> env.DB.batch(), all-or-nothing
 *   scheduled()                                 -> the sweeper (see §8.3)
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

/** Grace period before bytes are reaped. This gap is the only undo window
 *  the media pipeline has — see §8.6. Do not shorten it; queued rows cost
 *  nothing. */
const REAP_GRACE_HOURS = 24;
const REAP_CUTOFF = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${REAP_GRACE_HOURS} hours')`;
/**
 * Rows reaped per cron run. Each row costs TWO subrequests (one R2 delete,
 * one D1 update), and the free plan allows 50 subrequests per invocation.
 * 20 rows = 40, plus the initial SELECT and the three session/invitation
 * statements = 44. Under the cap with room to spare.
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.PROXY_TOKEN) return json({ error: "proxy_misconfigured" }, 500);
    if (!(await authorized(request, env.PROXY_TOKEN))) {
      return json({ error: "unauthorized" }, 401);
    }
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return json({ error: "payload_too_large" }, 413);
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
      // can recognise e.g. "media_asset is still referenced" (§4.5).
      return json({ error: "d1_error", message: (err as Error).message }, 400);
    }
  },

  /**
   * The sweeper. D1 has no TTL and no scheduled jobs of its own, so without
   * this: sessions never expire, lapsed invitations keep holding their unique
   * email slot, and deleted bytes accumulate in R2 forever.
   */
  async scheduled(_c: ScheduledController, env: Env, _ctx: ExecutionContext) {
    // allSettled, not all: one failing job must not cancel the other two.
    const outcomes = await Promise.allSettled([
      reapDeletedObjects(env),
      expireSessions(env),
      expireInvitations(env),
    ]);

    for (const o of outcomes) {
      if (o.status === "rejected") console.error("sweep job failed:", o.reason);
      else console.log("sweep job ok:", JSON.stringify(o.value));
    }
  },
} satisfies ExportedHandler<Env>;

async function reapDeletedObjects(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, r2_bucket, r2_key
       FROM pending_r2_deletion
      WHERE deleted_at IS NULL
        AND queued_at < ${REAP_CUTOFF}
      ORDER BY queued_at
      LIMIT ${REAP_LIMIT}`
  ).all<{ id: string; r2_bucket: string; r2_key: string }>();

  let reaped = 0;

  for (const row of results) {
    // A preview sweeper must never delete production bytes. This is why
    // pending_r2_deletion records the bucket and not only the key.
    if (row.r2_bucket !== env.MEDIA_BUCKET_NAME) {
      await note(env, row.id, `bucket mismatch: row=${row.r2_bucket} worker=${env.MEDIA_BUCKET_NAME}`);
      continue;
    }

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
      await note(env, row.id, String(err));
    }
  }

  return { reaped, scanned: results.length };
}

function note(env: Env, id: string, message: string) {
  return env.DB
    .prepare("UPDATE pending_r2_deletion SET last_error = ?2 WHERE id = ?1")
    .bind(id, message.slice(0, 500))
    .run();
}

async function expireSessions(env: Env) {
  // Hard delete is safe: session validation already refuses anything expired
  // or revoked, so a deleted row and a dead row are indistinguishable to auth.
  // DELETE ... LIMIT needs a compile-time SQLite option; the subquery does not.
  const res = await env.DB.prepare(
    `DELETE FROM admin_session
      WHERE id IN (
        SELECT id FROM admin_session
         WHERE expires_at < ${NOW} OR revoked_at IS NOT NULL
         LIMIT 500)`
  ).run();

  return { sessionsDeleted: res.meta.changes };
}

async function expireInvitations(env: Env) {
  // ux_invitation_pending is UNIQUE(email_normalized) WHERE accepted_at IS NULL
  // AND revoked_at IS NULL — the predicate ignores expires_at. So a lapsed
  // invite still holds the slot, and re-inviting that address fails with a
  // constraint error until this stamps revoked_at.
  const revoked = await env.DB.prepare(
    `UPDATE admin_invitation
        SET revoked_at = ${NOW}
      WHERE accepted_at IS NULL
        AND revoked_at IS NULL
        AND expires_at < ${NOW}`
  ).run();

  // Then purge settled rows so the table does not grow without bound.
  const purged = await env.DB.prepare(
    `DELETE FROM admin_invitation
      WHERE id IN (
        SELECT id FROM admin_invitation
         WHERE (accepted_at IS NOT NULL OR revoked_at IS NOT NULL)
           AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')
         LIMIT 500)`
  ).run();

  return { invitesRevoked: revoked.meta.changes, invitesPurged: purged.meta.changes };
}
