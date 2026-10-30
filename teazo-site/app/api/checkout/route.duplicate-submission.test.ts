/**
 * Tests checkout submission, repeated requests, and
 * Square payment-link creation.
 *
 * The duplicate-request tests characterize current
 * production behavior. They do not claim that the API
 * prevents duplicate orders.
 *
 * All Square, catalog, security, and content services
 * are mocked. No real orders or payments are created.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  catalogFixture,
} from "@/test/catalog-fixtures";

import {
  pacificToUtc,
} from "@/app/lib/store-hours";

import type {
  WebsiteContent,
} from "@/app/types/website-content";

const mocks = vi.hoisted(() => ({
  readCatalogItems: vi.fn(),
  readCatalogModifierLists: vi.fn(),
  createPaymentLink: vi.fn(),
  getWebsiteContent: vi.fn(),
  verifyTurnstile: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/app/lib/square-catalog", () => ({
  readCatalogItems: mocks.readCatalogItems,
  readCatalogModifierLists:
    mocks.readCatalogModifierLists,
}));

vi.mock("@/app/lib/square", () => ({
  squareClient: {
    checkout: {
      paymentLinks: {
        create: mocks.createPaymentLink,
      },
    },
  },
}));

vi.mock("@/app/lib/square-location", () => ({
  resolveSquareLocationId: async () =>
    "LOCATION_1",
}));

vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: mocks.getWebsiteContent,
}));

vi.mock("@/app/lib/turnstile", () => ({
  verifyTurnstile: mocks.verifyTurnstile,
}));

vi.mock("@/app/lib/queries/rate-limit", () => ({
  CHECKOUT_RATE_LIMIT: {
    name: "checkout",
    limit: 10,
    windowMs: 600_000,
  },
  consumeRateLimit: mocks.consumeRateLimit,
}));

const { POST } = await import("./route");

const DAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function websiteContent(): WebsiteContent {
  return {
    logo: "",
    story: "",
    socialLinks: [],
    address: {
      businessName: "TEAZO",
      streetAddress: "",
      locality: "",
      phone: "",
      email: "",
    },
    hours: DAYS.map((day) => ({
      day,
      start: 11,
      end: 20,
      closed: day === "Mon",
    })),
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

const items = [
  {
    catalogObjectId: "ITEM1",
    variationId: "VAR1",
    quantity: 2,
    modifierOptionIds: ["MOD1"],
  },
];

function requestBody() {
  return {
    customer,
    pickupTiming: {
      type: "ASAP",
    },
    items,
    turnstileToken: "valid-test-token",
  };
}

function checkout(
  overrides: Record<string, unknown> = {},
) {
  return POST(
    new Request(
      "http://localhost:3000/api/checkout",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify({
          ...requestBody(),
          ...overrides,
        }),
      },
    ),
  );
}

function paymentLink(
  orderId: string,
) {
  return {
    paymentLink: {
      url: `https://sandbox.square.link/u/${orderId}`,
      orderId,
    },
  };
}

function submittedSquareRequests() {
  return mocks.createPaymentLink.mock.calls.map(
    (call) => call[0] as {
      idempotencyKey: string;
      order: {
        locationId: string;
        lineItems: unknown[];
      };
    },
  );
}

describe("Checkout duplicate submission and retry behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.useFakeTimers({
      toFake: ["Date"],
    });

    // Wednesday, October 14, 2026,
    // at 3:00 PM Pacific.
    vi.setSystemTime(
      pacificToUtc(2026, 10, 14, 15, 0),
    );

    const fixture = catalogFixture();

    mocks.readCatalogItems.mockResolvedValue([
      fixture.item,
    ]);

    mocks.readCatalogModifierLists.mockResolvedValue([
      fixture.list,
    ]);

    mocks.getWebsiteContent.mockResolvedValue(
      websiteContent(),
    );

    mocks.verifyTurnstile.mockResolvedValue({
      ok: true,
    });

    mocks.consumeRateLimit.mockResolvedValue(
      true,
    );

    mocks.createPaymentLink.mockResolvedValue(
      paymentLink("ORDER_1"),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates one payment link for one valid checkout request", async () => {
    const response = await checkout();

    expect(response.status).toBe(200);

    expect(
      await response.json(),
    ).toEqual({
      checkoutUrl:
        "https://sandbox.square.link/u/ORDER_1",
      orderId: "ORDER_1",
    });

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledOnce();

    const [squareRequest] =
      submittedSquareRequests();

    expect(
      squareRequest.idempotencyKey,
    ).toEqual(expect.any(String));

    expect(squareRequest.order.locationId).toBe(
      "LOCATION_1",
    );
  });

  it("documents payment-link creation for two sequential identical requests", async () => {
    mocks.createPaymentLink
      .mockResolvedValueOnce(
        paymentLink("ORDER_1"),
      )
      .mockResolvedValueOnce(
        paymentLink("ORDER_2"),
      );

    const first = await checkout();
    const second = await checkout();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledTimes(2);

    const requests =
      submittedSquareRequests();

    expect(
      requests[0].idempotencyKey,
    ).not.toBe(
      requests[1].idempotencyKey,
    );

    expect(
      requests[0].order.lineItems,
    ).toEqual(
      requests[1].order.lineItems,
    );

    // This test documents the existing gap:
    // identical requests can reach Square with
    // different idempotency keys.
  });

  it("documents two payment-link attempts from concurrent identical requests", async () => {
    mocks.createPaymentLink
      .mockResolvedValueOnce(
        paymentLink("ORDER_1"),
      )
      .mockResolvedValueOnce(
        paymentLink("ORDER_2"),
      );

    const [first, second] =
      await Promise.all([
        checkout(),
        checkout(),
      ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledTimes(2);

    const requests =
      submittedSquareRequests();

    expect(
      requests[0].idempotencyKey,
    ).not.toBe(
      requests[1].idempotencyKey,
    );

    // The mocked rate limiter permits both.
    // No server-side deduplication occurs.
  });

  it("prevents a second payment link when the rate limit rejects the request", async () => {
    mocks.consumeRateLimit
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const first = await checkout();
    const second = await checkout();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);

    expect(
      await second.json(),
    ).toMatchObject({
      code: "RATE_LIMITED",
    });

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledOnce();

    expect(
      mocks.consumeRateLimit,
    ).toHaveBeenCalledTimes(2);
  });

  it("does not create another payment link after a failed Turnstile check", async () => {
    mocks.verifyTurnstile
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: "rejected",
      });

    const first = await checkout();
    const second = await checkout();

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);

    expect(
      await second.json(),
    ).toMatchObject({
      code: "BOT_CHECK_FAILED",
    });

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledOnce();

    // Failed bot checks never reach the rate limiter.
    expect(
      mocks.consumeRateLimit,
    ).toHaveBeenCalledOnce();
  });

  it("allows another attempt after a Square API failure", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.createPaymentLink
      .mockRejectedValueOnce(
        new Error("Square unavailable"),
      )
      .mockResolvedValueOnce(
        paymentLink("ORDER_RETRY"),
      );

    const first = await checkout();
    const second = await checkout();

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);

    expect(
      await second.json(),
    ).toEqual({
      checkoutUrl:
        "https://sandbox.square.link/u/ORDER_RETRY",
      orderId: "ORDER_RETRY",
    });

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledTimes(2);

    const requests =
      submittedSquareRequests();

    expect(
      requests[0].idempotencyKey,
    ).not.toBe(
      requests[1].idempotencyKey,
    );

    // If Square created the first link but the
    // response was lost, this behavior could lead
    // to another link being created on retry.
  });

  it("rejects an incomplete Square response and permits a retry", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.createPaymentLink
      .mockResolvedValueOnce({
        paymentLink: {
          orderId: "ORDER_WITHOUT_URL",
        },
      })
      .mockResolvedValueOnce(
        paymentLink("ORDER_RETRY"),
      );

    const first = await checkout();
    const second = await checkout();

    expect(first.status).toBe(500);

    expect(
      await first.json(),
    ).toMatchObject({
      error:
        "Square did not return a valid checkout URL or order ID.",
    });

    expect(second.status).toBe(200);

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledTimes(2);
  });

  it("does not create another link when repeated checkout data becomes invalid", async () => {
    const first = await checkout();

    const second = await checkout({
      customer: {
        ...customer,
        phone: "invalid-phone",
      },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledOnce();
  });

  it("does not create another payment link when the cart becomes unavailable", async () => {
    const first = await checkout();

    expect(first.status).toBe(200);

    const fixture = catalogFixture();

    fixture.option.modifierData!.locationOverrides = [
      {
        locationId: "LOCATION_1",
        soldOut: true,
      },
    ];

    mocks.readCatalogItems.mockResolvedValue([
      fixture.item,
    ]);

    mocks.readCatalogModifierLists.mockResolvedValue([
      fixture.list,
    ]);

    const second = await checkout();

    expect(second.status).toBe(400);

    expect(
      await second.json(),
    ).toMatchObject({
      code: "ITEM_UNAVAILABLE",
    });

    expect(
      mocks.createPaymentLink,
    ).toHaveBeenCalledOnce();
  });
});
