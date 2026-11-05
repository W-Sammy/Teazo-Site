/**
 * Backend tests for Teazo menu-item view analytics.
 *
 * Exercises the real POST route with synthetic Square item identifiers,
 * mocked anonymous session cookies, rate limiting, and persistence.
 *
 * Verifies request validation, tracking, cookie security, SHA-256
 * rate identifiers, rejected events, and safe failure responses.
 *
 * No real database writes, Square requests, or external calls occur.
 */

import { createHash } from "node:crypto";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Hoist dependencies before loading the actual endpoint.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  consumeAnalyticsRateLimit: vi.fn(),
  getShopMetricDate: vi.fn(),
  recordMenuItemView: vi.fn(),
}));

// Replace Next.js cookie access with synthetic session records.
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

// The analytics query functions must never contact D1.
vi.mock("@/app/lib/queries/analytics", () => ({
  consumeAnalyticsRateLimit: mocks.consumeAnalyticsRateLimit,
  getShopMetricDate: mocks.getShopMetricDate,
}));

// Prevent menu-item tracking from writing analytics records.
vi.mock(
  "@/app/admin/menu/handlers/record-menu-item-view",
  () => ({
    recordMenuItemView: mocks.recordMenuItemView,
  }),
);

// Supply a compatible D1Error for testing the endpoint's
// distinction between database and unexpected failures.
vi.mock("@/app/lib/d1", () => {
  class D1Error extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = "D1Error";
      this.status = status;
    }
  }

  return { D1Error };
});

import { D1Error } from "@/app/lib/d1";
import { POST } from "./route";

const HTTP_URL =
  "http://localhost:3000/api/analytics/menu-item-view";

const HTTPS_URL =
  "https://teazo.example.invalid/api/analytics/menu-item-view";

const SESSION_COOKIE = "teazo_analytics_session";

const ITEM_ID = "SYNTHETIC-SQUARE-ITEM-1";
const ITEM_NAME = "Synthetic Milk Tea";
const METRIC_DATE = "2026-11-04";
const EXISTING_SESSION = "synthetic-analytics-session";

// All requests remain in process; no actual HTTP server is contacted.
function requestWithBody(
  body: unknown,
  url = HTTP_URL,
): Request {
  const payload =
    typeof body === "string"
      ? body
      : JSON.stringify(body);

  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: payload,
  });
}

// Generate a valid synthetic tracking request.
function validRequest(url = HTTP_URL): Request {
  return requestWithBody(
    {
      itemId: ITEM_ID,
      itemName: ITEM_NAME,
    },
    url,
  );
}

// Set an existing anonymous analytics session in the cookie mock.
// Passing undefined simulates a first-time visitor.
function setSession(value?: string) {
  mocks.cookies.mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE && value !== undefined
        ? { name, value }
        : undefined,
  });
}

// Calculate the expected hash independently of the route's response.
function expectedRateKey(session: string) {
  return createHash("sha256")
    .update(session)
    .digest("hex");
}

// Extract the anonymous session created by the endpoint.
function sessionFromSetCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";

  const match = header.match(
    /^teazo_analytics_session=([^;]+);/,
  );

  expect(match).not.toBeNull();

  return match?.[1] ?? "";
}

// Check that a failed request returns a safe JSON response.
async function expectError(
  response: Response,
  status: number,
  message: string,
) {
  expect(response.status).toBe(status);

  expect(await response.json()).toEqual({
    error: message,
  });
}

describe("Backend menu-item view analytics POST", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Use an existing synthetic session by default.
    setSession(EXISTING_SESSION);

    mocks.consumeAnalyticsRateLimit.mockResolvedValue(true);
    mocks.getShopMetricDate.mockReturnValue(METRIC_DATE);
    mocks.recordMenuItemView.mockResolvedValue(undefined);
  });

  describe("Request validation", () => {
    it.each([
      ["null", null],
      ["empty object", {}],
      ["array", []],
      ["missing ID", { itemName: ITEM_NAME }],
      ["missing name", { itemId: ITEM_ID }],
      ["null ID", { itemId: null, itemName: ITEM_NAME }],
      ["numeric ID", { itemId: 123, itemName: ITEM_NAME }],
      ["boolean ID", { itemId: false, itemName: ITEM_NAME }],
      ["blank ID", { itemId: "", itemName: ITEM_NAME }],
      ["whitespace ID", { itemId: "  ", itemName: ITEM_NAME }],
      ["null name", { itemId: ITEM_ID, itemName: null }],
      ["numeric name", { itemId: ITEM_ID, itemName: 123 }],
      ["blank name", { itemId: ITEM_ID, itemName: "" }],
      ["whitespace name", { itemId: ITEM_ID, itemName: "   " }],
      [
        "oversized ID",
        { itemId: "x".repeat(201), itemName: ITEM_NAME },
      ],
      [
        "oversized name",
        { itemId: ITEM_ID, itemName: "x".repeat(301) },
      ],
    ])("rejects invalid item data: %s", async (_label, body) => {
      const response = await POST(
        requestWithBody(body),
      );

      await expectError(
        response,
        400,
        "Invalid menu item.",
      );

      // Invalid requests must not consume the analytics
      // rate limit or create a session or tracking record.
      expect(mocks.cookies).not.toHaveBeenCalled();

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).not.toHaveBeenCalled();

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();

      expect(
        response.headers.get("cache-control"),
      ).toBe("no-store");
    });

    it.each([
      ["malformed JSON", '{"itemId":'],
      ["empty request data", ""],
      ["JSON string", '"not-an-object"'],
    ])("rejects %s", async (_label, payload) => {
      const response = await POST(
        requestWithBody(payload),
      );

      await expectError(
        response,
        400,
        "Invalid menu item.",
      );

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();
    });

    it("accepts ID and name values at their maximum lengths", async () => {
      const itemId = "I".repeat(200);
      const itemName = "N".repeat(300);

      const response = await POST(
        requestWithBody({
          itemId,
          itemName,
        }),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.recordMenuItemView,
      ).toHaveBeenCalledWith(
        METRIC_DATE,
        itemId,
        itemName,
      );
    });

    it("passes valid text to the persistence handler without modifying unrelated fields", async () => {
      const response = await POST(
        requestWithBody({
          itemId: `  ${ITEM_ID}  `,
          itemName: `  ${ITEM_NAME}  `,
          ignored: "synthetic-extra-field",
        }),
      );

      expect(response.status).toBe(200);

      // The endpoint forwards accepted text. The existing
      // analytics query layer handles whitespace normalization.
      expect(
        mocks.recordMenuItemView,
      ).toHaveBeenCalledWith(
        METRIC_DATE,
        `  ${ITEM_ID}  `,
        `  ${ITEM_NAME}  `,
      );
    });
  });

  describe("Successful item tracking", () => {
    it("records a menu-item view with the shop-local metric date", async () => {
      const response = await POST(validRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
      });

      expect(
        mocks.getShopMetricDate,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.recordMenuItemView,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.recordMenuItemView,
      ).toHaveBeenCalledWith(
        METRIC_DATE,
        ITEM_ID,
        ITEM_NAME,
      );
    });

    it("applies rate limiting before recording the view", async () => {
      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.recordMenuItemView,
      ).toHaveBeenCalledOnce();

      // The rate-limit request must begin before persistence.
      expect(
        mocks.consumeAnalyticsRateLimit.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mocks.recordMenuItemView.mock
          .invocationCallOrder[0],
      );
    });

    it("returns a non-cacheable successful response", async () => {
      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      expect(
        response.headers.get("cache-control"),
      ).toBe("no-store");

      expect(
        response.headers.get("content-type"),
      ).toContain("application/json");
    });
  });

  describe("Anonymous session cookies", () => {
    it("reuses an existing session without issuing a new cookie", async () => {
      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      expect(
        response.headers.get("set-cookie"),
      ).toBeNull();

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).toHaveBeenCalledWith(
        expectedRateKey(EXISTING_SESSION),
      );
    });

    it("uses a SHA-256 session identifier rather than the raw cookie value", async () => {
      await POST(validRequest());

      const rateKey =
        mocks.consumeAnalyticsRateLimit.mock.calls[0][0];

      expect(rateKey).toBe(
        expectedRateKey(EXISTING_SESSION),
      );

      expect(rateKey).toMatch(/^[0-9a-f]{64}$/);

      expect(rateKey).not.toBe(
        EXISTING_SESSION,
      );
    });

    it("creates an anonymous session for a first-time HTTP visitor", async () => {
      setSession(undefined);

      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      const session = sessionFromSetCookie(response);

      expect(session).toBeTruthy();

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).toHaveBeenCalledWith(
        expectedRateKey(session),
      );

      const cookie =
        response.headers.get("set-cookie") ?? "";

      expect(cookie).toContain("Max-Age=86400");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("; Secure");
    });

    it("sets the Secure attribute for HTTPS visitors", async () => {
      setSession(undefined);

      const response = await POST(
        validRequest(HTTPS_URL),
      );

      expect(response.status).toBe(200);

      expect(
        response.headers.get("set-cookie"),
      ).toContain("; Secure");
    });

    it("replaces an oversized anonymous session cookie", async () => {
      const oversized = "x".repeat(101);

      setSession(oversized);

      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      const session = sessionFromSetCookie(response);

      expect(session).not.toBe(oversized);

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).toHaveBeenCalledWith(
        expectedRateKey(session),
      );
    });

    it("replaces an empty session cookie", async () => {
      setSession("");

      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      const session = sessionFromSetCookie(response);

      expect(session).toBeTruthy();

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).toHaveBeenCalledWith(
        expectedRateKey(session),
      );
    });

    it("accepts an existing session at the 100-character limit", async () => {
      const session = "S".repeat(100);

      setSession(session);

      const response = await POST(validRequest());

      expect(response.status).toBe(200);

      expect(
        response.headers.get("set-cookie"),
      ).toBeNull();

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).toHaveBeenCalledWith(
        expectedRateKey(session),
      );
    });
  });

  describe("Rate limiting", () => {
    it("returns HTTP 429 without persisting an over-limit event", async () => {
      mocks.consumeAnalyticsRateLimit.mockResolvedValue(false);

      const response = await POST(validRequest());

      await expectError(
        response,
        429,
        "Analytics rate limit exceeded.",
      );

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();

      expect(
        mocks.getShopMetricDate,
      ).not.toHaveBeenCalled();
    });

    it("includes the anonymous session cookie when a new visitor is rate limited", async () => {
      setSession(undefined);

      mocks.consumeAnalyticsRateLimit.mockResolvedValue(false);

      const response = await POST(validRequest());

      expect(response.status).toBe(429);

      const session = sessionFromSetCookie(response);

      expect(session).toBeTruthy();

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();
    });

    it("does not issue a replacement cookie when an existing session is rate limited", async () => {
      mocks.consumeAnalyticsRateLimit.mockResolvedValue(false);

      const response = await POST(validRequest());

      expect(response.status).toBe(429);

      expect(
        response.headers.get("set-cookie"),
      ).toBeNull();

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Database and unexpected failures", () => {
    it("returns HTTP 503 when the rate-limit database operation fails", async () => {
      mocks.consumeAnalyticsRateLimit.mockRejectedValue(
        new D1Error("Synthetic database failure.", 503),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(validRequest());

      await expectError(
        response,
        503,
        "Analytics is temporarily unavailable.",
      );

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();

      expect(errorSpy).toHaveBeenCalledWith(
        "Could not record menu item view:",
        expect.any(D1Error),
      );

      errorSpy.mockRestore();
    });

    it("returns HTTP 503 when analytics persistence fails in D1", async () => {
      mocks.recordMenuItemView.mockRejectedValue(
        new D1Error("Synthetic write failure.", 503),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(validRequest());

      await expectError(
        response,
        503,
        "Analytics is temporarily unavailable.",
      );

      expect(
        mocks.recordMenuItemView,
      ).toHaveBeenCalledOnce();

      errorSpy.mockRestore();
    });

    it("returns HTTP 500 for unexpected persistence failures", async () => {
      mocks.recordMenuItemView.mockRejectedValue(
        new Error("Synthetic unexpected exception."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(validRequest());

      await expectError(
        response,
        500,
        "Analytics is temporarily unavailable.",
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "Could not record menu item view:",
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    it("does not expose internal error messages to the client", async () => {
      mocks.recordMenuItemView.mockRejectedValue(
        new Error("Synthetic internal database credentials."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(validRequest());

      // Read the body exactly once.
      const body = await response.json();

      expect(response.status).toBe(500);

      expect(body).toEqual({
        error: "Analytics is temporarily unavailable.",
      });

      expect(JSON.stringify(body)).not.toContain(
        "Synthetic internal database credentials.",
      );

      errorSpy.mockRestore();
    });

    it("returns HTTP 500 when session cookie access fails", async () => {
      mocks.cookies.mockRejectedValue(
        new Error("Synthetic cookie service failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(validRequest());

      await expectError(
        response,
        500,
        "Analytics is temporarily unavailable.",
      );

      expect(
        mocks.consumeAnalyticsRateLimit,
      ).not.toHaveBeenCalled();

      expect(
        mocks.recordMenuItemView,
      ).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
