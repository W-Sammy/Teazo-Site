
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const CRON_SECRET = "test-cron-secret";
const BREVO_API_KEY = "test-brevo-api-key";
const HEALTHCHECK_URL =
  "https://hc-ping.com/00000000-0000-4000-8000-000000000001";

function makeRequest(secret?: string): Request {
  return new Request("http://localhost:3000/api/cron/brevo-health", {
    method: "GET",
    headers: secret
      ? { authorization: `Bearer ${secret}` }
      : {},
  });
}

function mockBrevo(status: number): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(null, { status })
  );
}

describe("GET /api/cron/brevo-health", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("BREVO_API_KEY", BREVO_API_KEY);
    vi.stubEnv("BREVO_HEALTHCHECK_URL", HEALTHCHECK_URL);

    vi.stubGlobal("fetch", vi.fn());

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
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

  it("reports a missing Brevo key as a failure", async () => {
    vi.stubEnv("BREVO_API_KEY", "");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `${HEALTHCHECK_URL}/fail`,
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("successfully checks Brevo and reports success", async () => {
    mockBrevo(200);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(2);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
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

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      HEALTHCHECK_URL,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
      })
    );
  });

  it("reports an invalid Brevo key as a failure", async () => {
    mockBrevo(401);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Brevo health check failed.",
    });

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${HEALTHCHECK_URL}/fail`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reports Brevo server errors as failures", async () => {
    mockBrevo(500);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports Brevo network failures", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("Network unavailable")
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledWith(
      `${HEALTHCHECK_URL}/fail`,
      expect.any(Object)
    );
  });

  it("does not fail Brevo when monitoring is unavailable", async () => {
    mockBrevo(200);
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("Monitoring unavailable")
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("does not fail Brevo when monitoring returns HTTP 500", async () => {
    mockBrevo(200);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 500 })
    );

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "[brevo-health] Monitoring ping failed with HTTP 500."
    );
  });

  it("skips monitoring when the URL is not configured", async () => {
    vi.stubEnv("BREVO_HEALTHCHECK_URL", "");
    mockBrevo(200);

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsafe monitoring URL", async () => {
    vi.stubEnv(
      "BREVO_HEALTHCHECK_URL",
      "https://example.com/unsafe"
    );
    mockBrevo(200);

    const response = await GET(makeRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not expose credentials in error responses", async () => {
    mockBrevo(403);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const response = await GET(makeRequest(CRON_SECRET));
    const body = await response.text();

    expect(body).not.toContain(BREVO_API_KEY);
    expect(body).not.toContain(CRON_SECRET);
    expect(body).not.toContain(HEALTHCHECK_URL);
  });

  it("does not log the monitoring URL on failure", async () => {
    mockBrevo(200);
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error(`Failed to reach ${HEALTHCHECK_URL}`)
    );

    await GET(makeRequest(CRON_SECRET));

    const errorMessages = vi
      .mocked(console.error)
      .mock.calls.flat()
      .join(" ");

    expect(errorMessages).not.toContain(HEALTHCHECK_URL);
  });
});
