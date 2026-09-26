/**
 * Cloudflare Turnstile, the bot check on the public contact form.
 *
 * The widget in the browser only produces a token. This server-side check is
 * what makes it mean anything. A token lasts 300 seconds and can be checked
 * once.
 *
 * Local development needs no setup: with no keys set, Cloudflare's published
 * test keys are used, which always pass on any hostname. Previews use the same
 * test keys (see docs/DEV-GUIDE.md section 8.1). Production needs its own
 * widget's keys and refuses the test secrets.
 *
 * SERVER ONLY. TURNSTILE_SECRET_KEY must never reach the browser.
 */
import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's always-pass test secret. Used only in local development when no key is set. */
const DEV_TEST_SECRET = "1x0000000000000000000000000000000AA";
const TEST_SECRETS = new Set([
  DEV_TEST_SECRET,
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

/** Cloudflare's test site keys all look like 1x, 2x or 3x followed by twenty zeros. */
const TEST_SITE_KEY = /^[123]x0{20}/;

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "rejected" | "unavailable" };

function secretKey(): string | undefined {
  const configured = process.env.TURNSTILE_SECRET_KEY;
  if (configured) {
    // A test secret passes everything, which in production means no bot check at all.
    if (process.env.VERCEL_ENV === "production" && TEST_SECRETS.has(configured)) {
      console.error(
        "TURNSTILE_SECRET_KEY is one of Cloudflare's test secrets. Production needs the real widget's secret.",
      );
      return undefined;
    }
    return configured;
  }
  return process.env.NODE_ENV === "development" ? DEV_TEST_SECRET : undefined;
}

/**
 * Check a token from the widget. Fails closed: if Cloudflare cannot be reached
 * or the keys are wrong, the submission is refused rather than let through.
 */
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<TurnstileResult> {
  // The browser never shows these errors to us, so a wrong public key on the
  // production deployment is reported here, where it reaches the server logs.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  if (process.env.VERCEL_ENV === "production" && (!siteKey || TEST_SITE_KEY.test(siteKey))) {
    console.error(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing or is a Cloudflare test key on production, so no visitor can pass the bot check.",
    );
  }

  const secret = secretKey();
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set, so the contact form cannot check for bots.");
    return { ok: false, reason: "unavailable" };
  }
  if (!token) return { ok: false, reason: "missing" };
  if (token.length > 2048) return { ok: false, reason: "rejected" };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let outcome: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    outcome = (await res.json()) as typeof outcome;
  } catch (error) {
    console.error("The Turnstile check could not be completed:", error);
    return { ok: false, reason: "unavailable" };
  }

  if (outcome.success === true) return { ok: true };

  const codes = outcome["error-codes"] ?? [];
  // A missing or wrong secret is our configuration, not the visitor.
  if (codes.some((code) => code.includes("secret") || code === "internal-error")) {
    console.error("Turnstile refused the check because of our configuration:", codes);
    return { ok: false, reason: "unavailable" };
  }
  // Rare for real visitors, so worth a log line: a run of these points to setup, not bots.
  console.warn("Turnstile rejected a contact form submission:", codes);
  return { ok: false, reason: "rejected" };
}
