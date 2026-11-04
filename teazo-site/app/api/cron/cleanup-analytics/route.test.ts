/**
 * Tests GET /api/cron/cleanup-analytics.
 *
 * Verifies cron authorization, Los Angeles calendar
 * retention boundaries, cleanup results, and errors.
 *
 * Database operations are mocked. No real records
 * are deleted.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  deleteExpiredAnalytics: vi.fn(),
  getShopMetricDate: vi.fn(),
  shiftMetricDate: vi.fn(),
}));

vi.mock("@/app/lib/queries/analytics", () => ({
  deleteExpiredAnalytics: mocks.deleteExpiredAnalytics,
  getShopMetricDate: mocks.getShopMetricDate,
  shiftMetricDate: mocks.shiftMetricDate,
}));

import { GET } from "./route";

const CRON_SECRET = "test-cron-secret";

const deletionResults = {
  pages: { changes: 5 },
  menuItems: { changes: 3 },
  rateLimits: { changes: 2 },
};

function makeRequest(
  authorization?: string,
): Request {
  return new Request(
    "http://localhost:3000/api/cron/cleanup-analytics",
    {
      method: "GET",
      headers: authorization
        ? { Authorization: authorization }
        : {},
    },
  );
}

describe("GET /api/cron/cleanup-analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("CRON_SECRET", CRON_SECRET);

    mocks.getShopMetricDate.mockReturnValue(
      "2026-10-30",
    );

    mocks.shiftMetricDate.mockReturnValue(
      "2026-10-01",
    );

    mocks.deleteExpiredAnalytics.mockResolvedValue(
      deletionResults,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without authorization", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);

    expect(await response.json()).toEqual({
      error: "Unauthorized",
    });

    expect(
      mocks.deleteExpiredAnalytics,
    ).not.toHaveBeenCalled();
  });

  it("rejects incorrect authorization tokens", async () => {
    const response = await GET(
      makeRequest("Bearer incorrect-secret"),
    );

    expect(response.status).toBe(401);

    expect(
      mocks.deleteExpiredAnalytics,
    ).not.toHaveBeenCalled();
  });

  it("rejects authorization without the Bearer scheme", async () => {
    const response = await GET(
      makeRequest(CRON_SECRET),
    );

    expect(response.status).toBe(401);

    expect(
      mocks.deleteExpiredAnalytics,
    ).not.toHaveBeenCalled();
  });

  it("rejects requests when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(
      makeRequest(`Bearer ${CRON_SECRET}`),
    );

    expect(response.status).toBe(401);

    expect(
      mocks.deleteExpiredAnalytics,
    ).not.toHaveBeenCalled();
  });

  it("executes cleanup for an authorized request", async () => {
    const response = await GET(
      makeRequest(`Bearer ${CRON_SECRET}`),
    );

    expect(response.status).toBe(200);

    expect(
      mocks.deleteExpiredAnalytics,
    ).toHaveBeenCalledExactlyOnceWith(
      "2026-10-01",
    );
  });

  it("retains today and the previous 29 local calendar days", async () => {
    await GET(
      makeRequest(`Bearer ${CRON_SECRET}`),
    );

    expect(
      mocks.getShopMetricDate,
    ).toHaveBeenCalledOnce();

    expect(
      mocks.shiftMetricDate,
    ).toHaveBeenCalledExactlyOnceWith(
      "2026-10-30",
      -29,
    );
  });

  it("handles retention cutoffs crossing a year boundary", async () => {
    mocks.getShopMetricDate.mockReturnValueOnce(
      "2027-01-01",
    );

    mocks.shiftMetricDate.mockReturnValueOnce(
      "2026-12-03",
    );

    const response = await GET(
      makeRequest(`Bearer ${CRON_SECRET}`),
    );

    expect(response.status).toBe(200);

    expect(
      mocks.shiftMetricDate,
    ).toHaveBeenCalledWith(
      "2027-01-01",
      -29,
    );

    expect(
      mocks.deleteExpiredAnalytics,
    ).toHaveBeenCalledWith(
      "2026-12-03",
    );
  });

  it("returns the cutoff date and deletion metadata", async () => {
    const response = await GET(
      makeRequest(`Bearer ${CRON_SECRET}`),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      ok: true,
      cutoffDate: "2026-10-01",
      deleted: deletionResults,
    });

    expect(
      response.headers.get("Cache-Control"),
    ).toBe("no-store");
  });

  it("returns a service error when database cleanup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(
      () => {},
    );

    mocks.deleteExpiredAnalytics.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const response = await GET(
      makeRequest(`Bearer ${CRON_SECRET}`),
    );

    expect(response.status).toBe(503);

    // Read the response body only once.
    const body = await response.json();

    expect(body).toEqual({
      error: "Analytics cleanup failed.",
    });

    // Internal database details must not reach the client.
    expect(JSON.stringify(body)).not.toContain(
      "Database unavailable",
    );
  });
});
