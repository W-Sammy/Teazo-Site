/**
 * Tests server-side Cloudflare Turnstile verification.
 *
 * Coverage includes:
 * - Valid and missing tokens.
 * - Token length validation.
 * - Cloudflare rejection and configuration failures.
 * - Network errors and invalid responses.
 * - Development test-key behavior.
 * - Protection against production test secrets.
 *
 * Cloudflare's Siteverify API is mocked through fetch.
 * No external verification requests are made.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { verifyTurnstile } from "./turnstile";

vi.mock("server-only", () => ({}));

const mockFetch = vi.fn();

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

describe("Cloudflare Turnstile verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Explicit test configuration prevents accidental use
    // of local or production Turnstile credentials.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-fixture-secret");
    vi.stubEnv(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "test-fixture-site-key",
    );

    mockFetch.mockResolvedValue(
      Response.json({ success: true }),
    );

    vi.stubGlobal("fetch", mockFetch);

    // Negative cases intentionally trigger server logs.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ============================================================
  // Successful verification
  // ============================================================

  it("accepts a token approved by Cloudflare", async () => {
    const result = await verifyTurnstile("valid-token");

    expect(result).toEqual({ ok: true });

    expect(mockFetch).toHaveBeenCalledWith(
      SITEVERIFY_URL,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("sends the secret and token to Siteverify", async () => {
    await verifyTurnstile("valid-token");

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const body = options.body as URLSearchParams;

    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get("secret")).toBe("test-fixture-secret");
    expect(body.get("response")).toBe("valid-token");
  });

  it("includes the visitor IP when one is provided", async () => {
    await verifyTurnstile(
      "valid-token",
      "192.0.2.10",
    );

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const body = options.body as URLSearchParams;

    expect(body.get("remoteip")).toBe("192.0.2.10");
  });

  it("omits remoteip when no visitor IP is available", async () => {
    await verifyTurnstile("valid-token");

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const body = options.body as URLSearchParams;

    expect(body.has("remoteip")).toBe(false);
  });

  // ============================================================
  // Missing or malformed tokens
  // ============================================================

  it("rejects a missing token before making a request", async () => {
    const result = await verifyTurnstile("");

    expect(result).toEqual({
      ok: false,
      reason: "missing",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects tokens longer than 2048 characters", async () => {
    const result = await verifyTurnstile(
      "x".repeat(2049),
    );

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ============================================================
  // Cloudflare rejection responses
  // ============================================================

  it("rejects a token Cloudflare marks unsuccessful", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    );

    const result = await verifyTurnstile("invalid-token");

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  // Expired or previously used tokens must not be accepted.
  it("rejects expired or duplicate tokens", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    );

    const result = await verifyTurnstile("expired-token");

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  // Invalid secrets and internal failures indicate a service
  // problem rather than an error the visitor can fix.
  it("reports secret configuration failures as unavailable", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        success: false,
        "error-codes": ["invalid-input-secret"],
      }),
    );

    const result = await verifyTurnstile("valid-token");

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports Cloudflare internal errors as unavailable", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        success: false,
        "error-codes": ["internal-error"],
      }),
    );

    const result = await verifyTurnstile("valid-token");

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  // ============================================================
  // Network and response failures
  // ============================================================

  it("fails closed when Siteverify cannot be reached", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    const result = await verifyTurnstile("valid-token");

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("fails closed when Cloudflare returns invalid JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("not-json", { status: 200 }),
    );

    const result = await verifyTurnstile("valid-token");

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  // ============================================================
  // Environment configuration
  // ============================================================

  it("uses Cloudflare's development test secret when no secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    const result = await verifyTurnstile("dev-token");

    expect(result).toEqual({ ok: true });

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const body = options.body as URLSearchParams;

    expect(body.get("secret")).toBe(
      "1x0000000000000000000000000000000AA",
    );
  });

  it("fails closed without a secret outside development", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    const result = await verifyTurnstile("valid-token");

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Production must not use an always-pass Cloudflare test secret.
  it.each([
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
    "3x0000000000000000000000000000000AA",
  ])(
    "rejects Cloudflare test secret %s in production",
    async (secret) => {
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("TURNSTILE_SECRET_KEY", secret);

      const result = await verifyTurnstile("valid-token");

      expect(result).toEqual({
        ok: false,
        reason: "unavailable",
      });

      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  // The current implementation logs an invalid production
  // site key. Secret-key verification still runs separately.
  it("logs an invalid public site key in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "",
    );

    await verifyTurnstile("valid-token");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      ),
    );
  });
});
