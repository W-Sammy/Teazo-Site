import "server-only";

import { createHash } from "node:crypto";
import { prepare } from "@/app/lib/d1";

/**
 * A fixed-window request limit kept in D1, so it holds across Vercel's
 * serverless instances. Rows live in analytics_rate_limit next to the page
 * analytics limits, and the nightly analytics cleanup deletes old ones. Each
 * use namespaces its keys (e.g. "checkout:") so the two never collide.
 */
export type RateLimit = { name: string; limit: number; windowMs: number };

/** Ten checkout attempts per visitor every ten minutes. Each attempt creates a Square order. */
export const CHECKOUT_RATE_LIMIT: RateLimit = { name: "checkout", limit: 10, windowMs: 10 * 60 * 1000 };

/**
 * The row key for a visitor. The IP is hashed, so no address is stored.
 * Visitors with no known IP (local development) share one key.
 */
export function rateLimitKey(rule: RateLimit, ip: string | undefined): string {
  const digest = createHash("sha256").update(ip ?? "unknown").digest("hex");
  return `${rule.name}:${digest}`;
}

/**
 * Counts one request for this visitor and says whether it is within the
 * limit. Fails open (allows the request, with a log line) when D1 is not
 * configured or cannot be reached: the limit backs up the bot check, it is not
 * the only protection.
 */
export async function consumeRateLimit(
  rule: RateLimit,
  ip: string | undefined,
  now = new Date(),
): Promise<boolean> {
  if (!process.env.D1_PROXY_URL || !process.env.PROXY_TOKEN) return true;

  const windowStart = new Date(now.getTime() - rule.windowMs).toISOString();
  try {
    const row = await prepare(
      `INSERT INTO analytics_rate_limit (identifier, window_started_at, event_count)
       VALUES (?1, ?3, 1)
       ON CONFLICT (identifier) DO UPDATE SET
         event_count = CASE
           WHEN analytics_rate_limit.window_started_at < ?2 THEN 1
           ELSE analytics_rate_limit.event_count + 1
         END,
         window_started_at = CASE
           WHEN analytics_rate_limit.window_started_at < ?2 THEN ?3
           ELSE analytics_rate_limit.window_started_at
         END
       RETURNING event_count`,
    )
      .bind(rateLimitKey(rule, ip), windowStart, now.toISOString())
      .first<{ event_count: number }>();
    return (row?.event_count ?? 0) <= rule.limit;
  } catch (error) {
    console.error(`The ${rule.name} rate limit could not be checked, so the request was allowed:`, error);
    return true;
  }
}
