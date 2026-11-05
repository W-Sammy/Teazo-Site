/**
 * Safety gates for Teazo external integration tests.
 *
 * These checks must run before any tests that could make
 * requests to Square, Cloudflare, or email services.
 *
 * External tests are disabled by default and never accept
 * production services as implicit targets.
 *
 * Do not log credentials or copy them into test output.
 */

import { resolveSquareEnvironment } from
  "@/app/lib/square-environment";

type ExternalTestEnvironment = Record<
  string,
  string | undefined
>;

/**
 * Require explicit opt-in before contacting external services.
 */
export function requireExternalTestOptIn(
  env: ExternalTestEnvironment = process.env,
): void {
  if (env.TEAZO_EXTERNAL_TESTS !== "1") {
    throw new Error(
      "External integration tests are disabled. " +
      "Set TEAZO_EXTERNAL_TESTS=1 explicitly.",
    );
  }
}

/**
 * Require Square sandbox mode and a configured test token.
 *
 * This checks configuration only. It does not prove that
 * the token belongs to a particular Square environment.
 */
export function requireSquareSandbox(
  env: ExternalTestEnvironment = process.env,
): void {
  requireExternalTestOptIn(env);

  if (
    resolveSquareEnvironment(
      env.SQUARE_ENVIRONMENT,
    ) !== "sandbox"
  ) {
    throw new Error(
      "External Square tests require sandbox mode.",
    );
  }

  if (!env.SQUARE_ACCESS_TOKEN?.trim()) {
    throw new Error(
      "A Square sandbox access token is required.",
    );
  }
}

/**
 * Restrict the default Cloudflare test target to the
 * local Wrangler Worker, not a remote deployment.
 */
export function requireLocalCloudflare(
  env: ExternalTestEnvironment = process.env,
): void {
  requireExternalTestOptIn(env);

  const rawUrl = env.D1_PROXY_URL;

  if (!rawUrl) {
    throw new Error(
      "A local D1 proxy URL is required.",
    );
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      "The D1 proxy URL is invalid.",
    );
  }

  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (
    !localHost ||
    url.protocol !== "http:" ||
    url.port !== "8787" ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "External D1/R2 tests require local Wrangler " +
      "at http://127.0.0.1:8787 or localhost:8787.",
    );
  }

  if (!env.PROXY_TOKEN?.trim()) {
    throw new Error(
      "A local D1 proxy token is required.",
    );
  }
}

/**
 * Require local Mailpit capture and prevent sending
 * actual email through Brevo.
 */
export function requireLocalMailpit(
  env: ExternalTestEnvironment = process.env,
): void {
  requireExternalTestOptIn(env);

  if (env.BREVO_API_KEY?.trim()) {
    throw new Error(
      "Mailpit tests cannot run with a Brevo API key.",
    );
  }

  const rawUrl = env.MAILPIT_URL;

  if (!rawUrl) {
    throw new Error(
      "A local Mailpit URL is required.",
    );
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      "The Mailpit URL is invalid.",
    );
  }

  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (
    !localHost ||
    url.protocol !== "http:" ||
    url.port !== "8025" ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Email integration tests require local Mailpit " +
      "on port 8025.",
    );
  }
}
