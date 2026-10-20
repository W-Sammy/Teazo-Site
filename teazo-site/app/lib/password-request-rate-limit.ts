// This enforces a rate limit to the password emailer
import "server-only";

import { prepare } from "./d1";
import { rateLimitKey, type RateLimit } from "./queries/rate-limit";

export const PASSWORD_IP_LIMIT: RateLimit = {
  name: "password-request-ip",
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

export const PASSWORD_EMAIL_LIMIT: RateLimit = {
  name: "password-request-email",
  limit: 3,
  windowMs: 15 * 60 * 1000,
};

/**
 * Count an attempt using the existing rate-limit table.
 * Database failures propagate so the request cannot bypass the limit.
 */
export async function consumePasswordRequestLimit(
  rule: RateLimit,
  identifier: string | undefined,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - rule.windowMs).toISOString();

  const row = await prepare(
    `INSERT INTO analytics_rate_limit (
       identifier,
       window_started_at,
       event_count
     )
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
    .bind(rateLimitKey(rule, identifier), windowStart, now.toISOString())
    .first<{ event_count: number }>();

  if (!row) {
    throw new Error("Password request limit could not be checked.");
  }

  return row.event_count <= rule.limit;
}
