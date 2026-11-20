/**
 * Regression coverage for checkout idempotency and safe recovery.
 * D1, Square, Turnstile, catalog, and content services are mocked;
 * no real orders, payments, or remote database writes occur.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogFixture } from "@/test/catalog-fixtures";
import { pacificToUtc } from "@/app/lib/store-hours";
import type { WebsiteContent } from "@/app/types/website-content";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";

type Attempt = {
  attempt_id: string;
  request_hash: string;
  square_idempotency_key: string;
  square_request_json: string;
  status: "reserved" | "processing" | "uncertain" | "completed";
  processing_owner: string | null;
  processing_started_at: string | null;
  checkout_url: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
};

const mocks = vi.hoisted(() => ({
  readCatalogItems: vi.fn(),
  readCatalogModifierLists: vi.fn(),
  createPaymentLink: vi.fn(),
  getWebsiteContent: vi.fn(),
  verifyTurnstile: vi.fn(),
  consumeRateLimit: vi.fn(),
  getCheckoutAttempt: vi.fn(),
  reserveCheckoutAttempt: vi.fn(),
  beginCheckoutProcessing: vi.fn(),
  resumeUncertainCheckoutAttempt: vi.fn(),
  recoverStalledCheckoutAttempt: vi.fn(),
  completeCheckoutAttempt: vi.fn(),
  markCheckoutUncertain: vi.fn(),
  attempts: new Map<string, unknown>(),
}));

vi.mock("@/app/lib/square-catalog", () => ({
  readCatalogItems: mocks.readCatalogItems,
  readCatalogModifierLists: mocks.readCatalogModifierLists,
}));
vi.mock("@/app/lib/square", () => ({
  squareClient: { checkout: { paymentLinks: { create: mocks.createPaymentLink } } },
}));
vi.mock("@/app/lib/square-location", () => ({
  resolveSquareLocationId: async () => "LOCATION_1",
}));
vi.mock("@/app/lib/website-content", () => ({ getWebsiteContent: mocks.getWebsiteContent }));
vi.mock("@/app/lib/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/app/lib/queries/rate-limit", () => ({
  CHECKOUT_RATE_LIMIT: { name: "checkout", limit: 10, windowMs: 600_000 },
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock("@/app/lib/queries/checkout-attempts", () => ({
  getCheckoutAttempt: mocks.getCheckoutAttempt,
  reserveCheckoutAttempt: mocks.reserveCheckoutAttempt,
  beginCheckoutProcessing: mocks.beginCheckoutProcessing,
  resumeUncertainCheckoutAttempt: mocks.resumeUncertainCheckoutAttempt,
  recoverStalledCheckoutAttempt: mocks.recoverStalledCheckoutAttempt,
  completeCheckoutAttempt: mocks.completeCheckoutAttempt,
  markCheckoutUncertain: mocks.markCheckoutUncertain,
}));

const { POST } = await import("./route");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function websiteContent(): WebsiteContent {
  return {
    logo: "",
    story: "",
    socialLinks: [],
    address: { businessName: "TEAZO", streetAddress: "", locality: "", phone: "", email: "" },
    hours: DAYS.map((day) => ({ day, start: 11, end: 20, closed: day === "Mon" })),
    holidays: [],
    contactFormEnabled: true,
    onlineOrderingEnabled: true,
  };
}

const customer = {
  displayName: "Test Customer",
  email: "customer@example.com",
  phone: "(415) 555-0100",
};
const items = [{ catalogObjectId: "ITEM1", variationId: "VAR1", quantity: 2, modifierOptionIds: ["MOD1"] }];

function checkout(overrides: Record<string, unknown> = {}) {
  return POST(new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({
      checkoutAttemptId: ATTEMPT_ID,
      customer,
      pickupTiming: { type: "ASAP" },
      items,
      turnstileToken: "valid-test-token",
      ...overrides,
    }),
  }));
}

function paymentLink(orderId: string) {
  return { paymentLink: { url: `https://sandbox.square.link/u/${orderId}`, orderId } };
}

function storedAttempt(id = ATTEMPT_ID): Attempt | undefined {
  return mocks.attempts.get(id) as Attempt | undefined;
}

function submittedSquareRequests() {
  return mocks.createPaymentLink.mock.calls.map((call) => call[0] as {
    idempotencyKey: string;
    order: { locationId: string; lineItems: unknown[] };
  });
}

// A small stateful D1 fake. It models unique INSERT, conditional UPDATE, and
// atomic owner claims; the actual SQL is tested separately in D1 integration.
function setupAttemptStore() {
  mocks.getCheckoutAttempt.mockImplementation(async (id: string) => storedAttempt(id) ?? null);
  mocks.reserveCheckoutAttempt.mockImplementation(async (input: {
    attemptId: string; requestHash: string; squareIdempotencyKey: string; squareRequestJson: string;
  }) => {
    if (storedAttempt(input.attemptId)) return null;
    const now = new Date().toISOString();
    const attempt: Attempt = {
      attempt_id: input.attemptId,
      request_hash: input.requestHash,
      square_idempotency_key: input.squareIdempotencyKey,
      square_request_json: input.squareRequestJson,
      status: "reserved",
      processing_owner: null,
      processing_started_at: null,
      checkout_url: null,
      order_id: null,
      created_at: now,
      updated_at: now,
    };
    mocks.attempts.set(input.attemptId, attempt);
    return { ...attempt };
  });
  mocks.beginCheckoutProcessing.mockImplementation(async (id: string, owner: string) => {
    const attempt = storedAttempt(id);
    if (!attempt || attempt.status !== "reserved") return null;
    attempt.status = "processing";
    attempt.processing_owner = owner;
    attempt.processing_started_at = new Date().toISOString();
    attempt.updated_at = attempt.processing_started_at;
    return { ...attempt };
  });
  mocks.resumeUncertainCheckoutAttempt.mockImplementation(async (id: string, owner: string) => {
    const attempt = storedAttempt(id);
    if (!attempt || attempt.status !== "uncertain") return null;
    attempt.status = "processing";
    attempt.processing_owner = owner;
    attempt.processing_started_at = new Date().toISOString();
    attempt.updated_at = attempt.processing_started_at;
    return { ...attempt };
  });
  mocks.recoverStalledCheckoutAttempt.mockImplementation(async (original: Attempt, owner: string) => {
    const attempt = storedAttempt(original.attempt_id);
    if (
      !attempt || attempt.status !== "processing" ||
      attempt.processing_owner !== original.processing_owner ||
      attempt.processing_started_at !== original.processing_started_at
    ) return null;
    attempt.processing_owner = owner;
    attempt.processing_started_at = new Date().toISOString();
    attempt.updated_at = attempt.processing_started_at;
    return { ...attempt };
  });
  mocks.completeCheckoutAttempt.mockImplementation(async (id: string, owner: string, url: string, orderId: string) => {
    const attempt = storedAttempt(id);
    if (!attempt || attempt.status !== "processing" || attempt.processing_owner !== owner) return null;
    attempt.status = "completed";
    attempt.processing_owner = null;
    attempt.checkout_url = url;
    attempt.order_id = orderId;
    attempt.updated_at = new Date().toISOString();
    return { ...attempt };
  });
  mocks.markCheckoutUncertain.mockImplementation(async (id: string, owner: string) => {
    const attempt = storedAttempt(id);
    if (!attempt || attempt.status !== "processing" || attempt.processing_owner !== owner) return null;
    attempt.status = "uncertain";
    attempt.processing_owner = null;
    attempt.updated_at = new Date().toISOString();
    return { ...attempt };
  });
}

describe("Checkout persistent idempotency and recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.attempts.clear();
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://teazo.test");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(pacificToUtc(2026, 10, 14, 15, 0));

    const fixture = catalogFixture();
    mocks.readCatalogItems.mockResolvedValue([fixture.item]);
    mocks.readCatalogModifierLists.mockResolvedValue([fixture.list]);
    mocks.getWebsiteContent.mockResolvedValue(websiteContent());
    mocks.verifyTurnstile.mockResolvedValue({ ok: true });
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.createPaymentLink.mockResolvedValue(paymentLink("ORDER_1"));
    setupAttemptStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates one payment link and persists its completed result", async () => {
    const response = await checkout();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkoutUrl: "https://sandbox.square.link/u/ORDER_1",
      orderId: "ORDER_1",
    });
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
    expect(submittedSquareRequests()[0].idempotencyKey).toBe(ATTEMPT_ID);
    expect(submittedSquareRequests()[0].order.locationId).toBe("LOCATION_1");
    expect(storedAttempt()?.status).toBe("completed");
  });

  it("returns a stored link for repeated identical requests without calling Square again", async () => {
    const first = await checkout();
    const second = await checkout({ turnstileToken: "fresh-test-token" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      checkoutUrl: "https://sandbox.square.link/u/ORDER_1",
      orderId: "ORDER_1",
    });
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
    expect(mocks.verifyTurnstile).toHaveBeenCalledTimes(2);
    expect(mocks.consumeRateLimit).toHaveBeenCalledTimes(2);
  });

  it("rejects attempt-ID reuse with different order data", async () => {
    await checkout();
    const response = await checkout({ items: [{ ...items[0], quantity: 3 }] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CHECKOUT_ATTEMPT_CONFLICT" });
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
  });

  it("permits a genuinely different checkout with a new attempt ID", async () => {
    mocks.createPaymentLink
      .mockResolvedValueOnce(paymentLink("ORDER_1"))
      .mockResolvedValueOnce(paymentLink("ORDER_2"));
    const first = await checkout();
    const second = await checkout({ checkoutAttemptId: SECOND_ATTEMPT_ID });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.createPaymentLink).toHaveBeenCalledTimes(2);
    expect(submittedSquareRequests().map((r) => r.idempotencyKey)).toEqual([
      ATTEMPT_ID,
      SECOND_ATTEMPT_ID,
    ]);
  });

  it("allows only one active Square call during concurrent requests", async () => {
    let settle!: (value: ReturnType<typeof paymentLink>) => void;
    mocks.createPaymentLink.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    const firstPromise = checkout();
    const secondPromise = checkout();
    // Both requests race through the D1 claim. Only the owner may call Square.
    const second = await secondPromise;
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
    settle(paymentLink("ORDER_1"));
    expect((await firstPromise).status).toBe(200);
    expect(storedAttempt()?.status).toBe("completed");
  });

  it("blocks Square when D1 cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getCheckoutAttempt.mockRejectedValueOnce(new Error("D1 offline"));
    const response = await checkout();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("blocks Square if the atomic insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.reserveCheckoutAttempt.mockRejectedValueOnce(new Error("D1 write failed"));
    const response = await checkout();
    expect(response.status).toBe(503);
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("retries an uncertain Square failure with the exact original key and payload", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createPaymentLink
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce(paymentLink("ORDER_RETRY"));
    const first = await checkout();
    expect(first.status).toBe(503);
    expect(storedAttempt()?.status).toBe("uncertain");
    const second = await checkout({ turnstileToken: "new-security-token" });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ orderId: "ORDER_RETRY" });
    expect(submittedSquareRequests()).toHaveLength(2);
    expect(submittedSquareRequests()[0]).toEqual(submittedSquareRequests()[1]);
    expect(storedAttempt()?.status).toBe("completed");
  });

  it("recovers an incomplete Square response with the same key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createPaymentLink
      .mockResolvedValueOnce({ paymentLink: { orderId: "INCOMPLETE" } })
      .mockResolvedValueOnce(paymentLink("ORDER_RECOVERED"));
    expect((await checkout()).status).toBe(503);
    expect((await checkout()).status).toBe(200);
    expect(submittedSquareRequests()[0]).toEqual(submittedSquareRequests()[1]);
  });

  it("does not lose the original payload when completing D1 fails after Square success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.completeCheckoutAttempt.mockRejectedValueOnce(new Error("D1 offline"));
    expect((await checkout()).status).toBe(503);
    expect(storedAttempt()?.status).toBe("uncertain");
    expect((await checkout()).status).toBe(200);
    expect(mocks.createPaymentLink).toHaveBeenCalledTimes(2);
    expect(submittedSquareRequests()[0]).toEqual(submittedSquareRequests()[1]);
  });

  it("does not automatically replay an old uncertain attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createPaymentLink.mockRejectedValueOnce(new Error("network lost"));
    expect((await checkout()).status).toBe(503);
    vi.setSystemTime(Date.now() + 11 * 60_000);
    const response = await checkout();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CHECKOUT_RECOVERY_REQUIRED" });
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
  });

  it("recovers a stale processing owner without changing Square request", async () => {
    let settle!: (value: ReturnType<typeof paymentLink>) => void;
    mocks.createPaymentLink.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    const firstPromise = checkout();
    // Allow the first call to claim its row and begin its unresolved Square request.
    await vi.waitFor(() => expect(mocks.createPaymentLink).toHaveBeenCalledOnce());
    vi.setSystemTime(Date.now() + 3 * 60_000);
    mocks.createPaymentLink.mockResolvedValueOnce(paymentLink("ORDER_1"));
    const recovered = await checkout();
    expect(recovered.status).toBe(200);
    expect(submittedSquareRequests()[0]).toEqual(submittedSquareRequests()[1]);
    settle(paymentLink("ORDER_1"));
    expect((await firstPromise).status).toBe(409);
    expect(storedAttempt()?.status).toBe("completed");
  });

  it("does not create a link if the rate limiter blocks a repeat request", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await checkout()).status).toBe(200);
    expect((await checkout()).status).toBe(429);
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
  });

  it("rejects a failed Turnstile token before consulting the attempt record", async () => {
    mocks.verifyTurnstile.mockResolvedValueOnce({ ok: false, reason: "rejected" });
    expect((await checkout()).status).toBe(400);
    expect(mocks.getCheckoutAttempt).not.toHaveBeenCalled();
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("rejects invalid customer and invalid catalog options without reserving", async () => {
    expect((await checkout({ customer: { ...customer, phone: "invalid-phone" } })).status).toBe(400);
    const fixture = catalogFixture();
    fixture.option.modifierData!.locationOverrides = [{ locationId: "LOCATION_1", soldOut: true }];
    mocks.readCatalogItems.mockResolvedValue([fixture.item]);
    mocks.readCatalogModifierLists.mockResolvedValue([fixture.list]);
    const unavailable = await checkout();
    expect(unavailable.status).toBe(400);
    expect(await unavailable.json()).toMatchObject({ code: "ITEM_UNAVAILABLE" });
    expect(mocks.reserveCheckoutAttempt).not.toHaveBeenCalled();
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("returns a completed link without revalidating modified store content", async () => {
    expect((await checkout()).status).toBe(200);
    mocks.getWebsiteContent.mockRejectedValue(new Error("content service down"));
    expect((await checkout({ turnstileToken: "fresh-token" })).status).toBe(200);
    expect(mocks.getWebsiteContent).toHaveBeenCalledOnce();
    expect(mocks.createPaymentLink).toHaveBeenCalledOnce();
  });
});
