
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const CRON_SECRET = "test-cron-secret";
const BREVO_API_KEY = "test-brevo-api-key";

function makeRequest(secret?: string): Request {
  return new Request("http://localhost:3000/api/cron/brevo-health", {
    method: "GET",
    headers: secret
      ? { authorization: `Bearer ${secret}` }
      : {},
  });
}

describe("GET /api/cron/brevo-health", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("BREVO_API_KEY", BREVO_API_KEY);
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects requests without authorization", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests with an incorrect secret", async () => {
    const response = await GET(makeRequest("wrong-secret"));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests when BREVO_API_KEY is missing", async () => {
    vi.stubEnv("BREVO_API_KEY", "");

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("successfully checks the Brevo API key", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ email: "test@example.com" }), {
        status: 200,
      })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/account",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: {
          "api-key": BREVO_API_KEY,
          accept: "application/json",
        },
      })
    );

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("handles Brevo rejecting the API key", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 401 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Brevo health check failed.",
    });
  });

  it("handles Brevo service errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 500 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
  });

  it("handles network failures", async () => {
    vi.mocked(fetch).mockRejectedValue(
      new Error("Network unavailable")
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Brevo health check failed.",
    });
  });

  it("does not expose credentials in error responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 403 })
    );

    const response = await GET(makeRequest(CRON_SECRET));
    const body = await response.text();

    expect(body).not.toContain(BREVO_API_KEY);
    expect(body).not.toContain(CRON_SECRET);
  });
});
