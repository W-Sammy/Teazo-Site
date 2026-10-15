import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsiteContent } from "@/app/types/website-content";
import { pacificToUtc } from "@/app/lib/store-hours";

const mocks = vi.hoisted(() => ({
  createPaymentLink: vi.fn(),
  getWebsiteContent: vi.fn(),
  verifyTurnstile: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/app/lib/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/app/lib/queries/rate-limit", () => ({
  CHECKOUT_RATE_LIMIT: { name: "checkout", limit: 10, windowMs: 600_000 },
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock("@/app/lib/square", () => ({
  squareClient: { checkout: { paymentLinks: { create: mocks.createPaymentLink } } },
}));
vi.mock("@/app/lib/square-location", () => ({
  resolveSquareLocationId: async () => "LOCATION_1",
}));
vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: mocks.getWebsiteContent,
}));

const { POST } = await import("@/app/api/checkout/route");

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function content(overrides: Partial<WebsiteContent> = {}): WebsiteContent {
  return {
    logo: "",
    story: "",
    socialLinks: [],
    address: { businessName: "TEAZO", streetAddress: "", locality: "", phone: "", email: "" },
    hours: DAYS.map((day) => ({ day, start: 11, end: 20, closed: day === "Mon" })),
    holidays: [],
    contactFormEnabled: true,
    onlineOrderingEnabled: true,
    ...overrides,
  };
}

const customer = { displayName: "Test Customer", email: "test@example.com", phone: "(415) 555-0100" };
const items = [{ variationId: "VAR1", quantity: 2, modifierOptionIds: ["MOD1"] }];

function checkout(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      body: JSON.stringify({ turnstileToken: "token-1", ...body }),
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Wednesday October 14, 2026 at 3:00 PM in San Francisco: the store is open
  vi.setSystemTime(pacificToUtc(2026, 10, 14, 15, 0));
  mocks.getWebsiteContent.mockResolvedValue(content());
  mocks.verifyTurnstile.mockResolvedValue({ ok: true });
  mocks.consumeRateLimit.mockResolvedValue(true);
  mocks.createPaymentLink.mockResolvedValue({
    paymentLink: { url: "https://sandbox.square.link/u/test", orderId: "ORDER_1" },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST /api/checkout", () => {
  it("creates a Square pickup order and returns the payment link", async () => {
    const res = await checkout({ customer, pickupTiming: { type: "ASAP" }, items });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkoutUrl: "https://sandbox.square.link/u/test", orderId: "ORDER_1" });

    const request = mocks.createPaymentLink.mock.calls[0][0];
    expect(request.order.locationId).toBe("LOCATION_1");
    // Tagged so the receipt lookup will show it (TZ-444)
    expect(request.order.metadata).toEqual({ teazo_source: "website_checkout" });
    expect(request.order.lineItems).toEqual([
      { catalogObjectId: "VAR1", quantity: "2", note: undefined, modifiers: [{ catalogObjectId: "MOD1" }] },
    ]);
    expect(request.order.fulfillments[0]).toMatchObject({
      type: "PICKUP",
      pickupDetails: {
        scheduleType: "ASAP",
        prepTimeDuration: "PT25M",
        recipient: { displayName: "Test Customer", phoneNumber: "+14155550100" },
      },
    });
  });

  it("refuses orders while online ordering is paused, without contacting Square (TZ-446)", async () => {
    mocks.getWebsiteContent.mockResolvedValue(content({ onlineOrderingEnabled: false }));
    const res = await checkout({ customer, pickupTiming: { type: "ASAP" }, items });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "ORDERING_PAUSED" });
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("accepts a pickup scheduled days ahead (TZ-435)", async () => {
    const pickupAt = pacificToUtc(2026, 10, 17, 12, 30).toISOString();
    const res = await checkout({ customer, pickupTiming: { type: "SCHEDULED", pickupAt }, items });
    expect(res.status).toBe(200);
    const fulfillment = mocks.createPaymentLink.mock.calls[0][0].order.fulfillments[0];
    expect(fulfillment.pickupDetails).toMatchObject({ scheduleType: "SCHEDULED", pickupAt });
  });

  it("refuses a pickup on a closed day without contacting Square", async () => {
    const pickupAt = pacificToUtc(2026, 10, 19, 12, 0).toISOString();
    const res = await checkout({ customer, pickupTiming: { type: "SCHEDULED", pickupAt }, items });
    expect(res.status).toBe(400);
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("checks the bot token with the visitor's IP (TZ-445)", async () => {
    await checkout({ customer, pickupTiming: { type: "ASAP" }, items });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("token-1", "203.0.113.7");
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "checkout" }), "203.0.113.7");
  });

  it("refuses a missing or failed bot check without contacting Square (TZ-445)", async () => {
    mocks.verifyTurnstile.mockResolvedValue({ ok: false, reason: "rejected" });
    const res = await checkout({ customer, pickupTiming: { type: "ASAP" }, items, turnstileToken: undefined });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BOT_CHECK_FAILED" });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith("", "203.0.113.7");
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("answers 503 when the bot check itself can't run", async () => {
    mocks.verifyTurnstile.mockResolvedValue({ ok: false, reason: "unavailable" });
    const res = await checkout({ customer, pickupTiming: { type: "ASAP" }, items });
    expect(res.status).toBe(503);
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("answers 429 past the rate limit, without contacting Square (TZ-445)", async () => {
    mocks.consumeRateLimit.mockResolvedValue(false);
    const res = await checkout({ customer, pickupTiming: { type: "ASAP" }, items });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("600");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("doesn't count requests that fail the bot check against the rate limit", async () => {
    mocks.verifyTurnstile.mockResolvedValue({ ok: false, reason: "missing" });
    await checkout({ customer, pickupTiming: { type: "ASAP" }, items, turnstileToken: undefined });
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("refuses a malformed body without contacting Square", async () => {
    const res = await checkout({ customer: { ...customer, phone: "555" }, pickupTiming: { type: "ASAP" }, items });
    expect(res.status).toBe(400);
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });
});
