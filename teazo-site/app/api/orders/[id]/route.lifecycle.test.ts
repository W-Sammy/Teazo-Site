/**
 * Square order lifecycle status and receipt tests.
 *
 * Covers paid and unpaid order-status interpretation, consecutive
 * Square status snapshots, concurrent lookups, and pickup fulfillment
 * states independently of payment confirmation.
 *
 * Also verifies receipt field preservation, optional data handling,
 * and masking of customer contact information.
 *
 * Square Orders API responses are mocked. No production orders,
 * payments, fulfillment updates, or external services are accessed.
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
  getOrder: vi.fn(),
}));

vi.mock("@/app/lib/square", () => ({
  squareClient: {
    orders: {
      get: mocks.getOrder,
    },
  },
}));

const { GET } = await import("./route");

const ORDER_ID = "CVuxowTLMQkI9Yq9SFJ84oG6phYZY";

function squareOrder(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: ORDER_ID,
    state: "OPEN",
    locationId: "TEST-LOCATION",
    metadata: {
      teazo_source: "website_checkout",
    },
    tenders: [],
    lineItems: [
      {
        uid: "line-1",
        name: "Milk Tea",
        quantity: "2",
        totalMoney: {
          amount: 1150,
          currency: "USD",
        },
      },
    ],
    fulfillments: [
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickupDetails: {
          scheduleType: "ASAP",
          recipient: {
            displayName: "Test Customer",
            phoneNumber: "+14155550100",
            emailAddress: "test@example.com",
          },
        },
      },
    ],
    totalMoney: {
      amount: 1150,
      currency: "USD",
    },
    ...overrides,
  };
}

async function lookup(id = ORDER_ID) {
  const response = await GET(
    new Request(
      `http://localhost:3000/api/orders/${encodeURIComponent(id)}`,
    ),
    {
      params: Promise.resolve({ id }),
    },
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

function returnOrder(
  overrides: Record<string, unknown> = {},
) {
  mocks.getOrder.mockResolvedValueOnce({
    order: squareOrder(overrides),
  });
}

beforeEach(() => {
  mocks.getOrder.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Square order lifecycle status handling", () => {
  describe("Current payment-status interpretation", () => {
    const cases = [
      {
        label: "OPEN without tenders",
        state: "OPEN",
        tenders: [],
        expectedPaid: false,
      },
      {
        label: "OPEN with a tender",
        state: "OPEN",
        tenders: [{ id: "tender-1" }],
        expectedPaid: true,
      },
      {
        label: "COMPLETED without tenders",
        state: "COMPLETED",
        tenders: [],
        expectedPaid: true,
      },
      {
        label: "CANCELED without tenders",
        state: "CANCELED",
        tenders: [],
        expectedPaid: false,
      },
      {
        label: "CANCELED with an existing tender",
        state: "CANCELED",
        tenders: [{ id: "tender-1" }],
        expectedPaid: true,
      },
    ];

    it.each(cases)(
      "reports the existing payment heuristic for $label",
      async ({ state, tenders, expectedPaid }) => {
        returnOrder({ state, tenders });

        const result = await lookup();

        expect(result.status).toBe(200);
        expect(result.body.order.state).toBe(state);
        expect(result.body.order.isPaid).toBe(
          expectedPaid,
        );

        expect(mocks.getOrder).toHaveBeenCalledWith({
          orderId: ORDER_ID,
        });
      },
    );

    it("reflects a subsequent Square payment-status change", async () => {
      mocks.getOrder
        .mockResolvedValueOnce({
          order: squareOrder({
            state: "OPEN",
            tenders: [],
          }),
        })
        .mockResolvedValueOnce({
          order: squareOrder({
            state: "COMPLETED",
            tenders: [{ id: "paid-tender" }],
          }),
        });

      const first = await lookup();
      const second = await lookup();

      expect(first.status).toBe(200);
      expect(first.body.order.state).toBe("OPEN");
      expect(first.body.order.isPaid).toBe(false);

      expect(second.status).toBe(200);
      expect(second.body.order.state).toBe(
        "COMPLETED",
      );
      expect(second.body.order.isPaid).toBe(true);

      expect(mocks.getOrder).toHaveBeenCalledTimes(2);
    });

    it("does not reuse a prior paid snapshot when Square later returns an unpaid snapshot", async () => {
      mocks.getOrder
        .mockResolvedValueOnce({
          order: squareOrder({
            state: "COMPLETED",
            tenders: [{ id: "tender-1" }],
          }),
        })
        .mockResolvedValueOnce({
          order: squareOrder({
            state: "OPEN",
            tenders: [],
          }),
        });

      const first = await lookup();
      const second = await lookup();

      expect(first.body.order.isPaid).toBe(true);
      expect(second.body.order.isPaid).toBe(false);
      expect(second.body.order.state).toBe("OPEN");

      // The endpoint returns each Square snapshot as received.
      // It does not implement a state-transition validator.
      expect(mocks.getOrder).toHaveBeenCalledTimes(2);
    });

    it("handles concurrent order lookups without sharing a cached response", async () => {
      mocks.getOrder
        .mockResolvedValueOnce({
          order: squareOrder({
            state: "OPEN",
            tenders: [],
          }),
        })
        .mockResolvedValueOnce({
          order: squareOrder({
            state: "COMPLETED",
            tenders: [{ id: "tender-1" }],
          }),
        });

      const [first, second] = await Promise.all([
        lookup(),
        lookup(),
      ]);

      expect(first.body.order.isPaid).toBe(false);
      expect(second.body.order.isPaid).toBe(true);

      expect(mocks.getOrder).toHaveBeenCalledTimes(2);
    });
  });

  describe("Pickup fulfillment state reporting", () => {
    it.each([
      "PROPOSED",
      "RESERVED",
      "PREPARED",
      "COMPLETED",
      "CANCELED",
    ])(
      "preserves the Square pickup fulfillment state %s",
      async (fulfillmentState) => {
        returnOrder({
          state: "OPEN",
          tenders: [],
          fulfillments: [
            {
              type: "PICKUP",
              state: fulfillmentState,
              pickupDetails: {
                scheduleType: "ASAP",
                recipient: {
                  displayName: "Test Customer",
                },
              },
            },
          ],
        });

        const result = await lookup();

        expect(result.status).toBe(200);
        expect(
          result.body.order.fulfillments[0].state,
        ).toBe(fulfillmentState);

        // Fulfillment state and payment status are separate
        // fields in the public API response.
        expect(result.body.order.isPaid).toBe(false);
      },
    );
  });

  describe("Receipt information and privacy", () => {
    it("preserves line items, modifiers, scheduled pickup information, and totals", async () => {
      returnOrder({
        state: "COMPLETED",
        lineItems: [
          {
            uid: "line-1",
            name: "Milk Tea",
            variationName: "Large",
            quantity: "2",
            modifiers: [
              {
                name: "Boba",
                totalMoney: {
                  amount: 100,
                },
              },
            ],
            totalMoney: {
              amount: 1300,
              currency: "USD",
            },
          },
        ],
        fulfillments: [
          {
            type: "PICKUP",
            state: "RESERVED",
            pickupDetails: {
              scheduleType: "SCHEDULED",
              pickupAt: "2026-10-30T20:00:00Z",
              recipient: {
                displayName: "Test Customer",
                phoneNumber: "+14155550100",
                emailAddress: "test@example.com",
              },
              note: "Pickup at counter",
            },
          },
        ],
        totalMoney: {
          amount: 1500,
          currency: "USD",
        },
        totalTaxMoney: {
          amount: 100,
          currency: "USD",
        },
        totalTipMoney: {
          amount: 200,
          currency: "USD",
        },
        totalDiscountMoney: {
          amount: 100,
          currency: "USD",
        },
      });

      const result = await lookup();

      expect(result.status).toBe(200);

      const order = result.body.order;

      expect(order.isPaid).toBe(true);

      expect(order.lineItems[0]).toMatchObject({
        name: "Milk Tea",
        variationName: "Large",
        quantity: "2",
      });

      expect(
        order.lineItems[0].modifiers[0].name,
      ).toBe("Boba");

      expect(order.totalMoney.amount).toBe(1500);
      expect(order.totalTaxMoney.amount).toBe(100);
      expect(order.totalTipMoney.amount).toBe(200);
      expect(order.totalDiscountMoney.amount).toBe(
        100,
      );

      expect(
        order.fulfillments[0].pickupDetails,
      ).toMatchObject({
        scheduleType: "SCHEDULED",
        pickupAt: "2026-10-30T20:00:00Z",
        note: "Pickup at counter",
      });
    });

    it("handles orders without optional receipt fields", async () => {
      returnOrder({
        lineItems: undefined,
        fulfillments: undefined,
        totalTaxMoney: undefined,
        totalTipMoney: undefined,
        totalDiscountMoney: undefined,
      });

      const result = await lookup();

      expect(result.status).toBe(200);
      expect(result.body.order.id).toBe(ORDER_ID);

      expect(result.body.order.lineItems).toBeUndefined();
      expect(
        result.body.order.fulfillments,
      ).toBeUndefined();

      expect(
        result.body.order.totalTaxMoney,
      ).toBeUndefined();
    });

    it("excludes Square metadata, tender details, and unrelated internal fields", async () => {
      returnOrder({
        state: "COMPLETED",
        tenders: [
          {
            id: "sensitive-tender-id",
            paymentId: "sensitive-payment-id",
          },
        ],
        metadata: {
          teazo_source: "website_checkout",
          internal_note: "private-information",
        },
        customerId: "private-customer-id",
      });

      const result = await lookup();

      expect(result.status).toBe(200);

      const serialized = JSON.stringify(
        result.body.order,
      );

      expect(result.body.order.metadata).toBeUndefined();
      expect(result.body.order.tenders).toBeUndefined();
      expect(
        result.body.order.customerId,
      ).toBeUndefined();

      expect(serialized).not.toContain(
        "sensitive-payment-id",
      );
      expect(serialized).not.toContain(
        "private-customer-id",
      );
      expect(serialized).not.toContain(
        "private-information",
      );
    });

    it.each([
      {
        label: "standard customer contact",
        phone: "+14155550100",
        email: "test@example.com",
        expectedPhone: "***-***-0100",
        expectedEmail: "t***@example.com",
      },
      {
        label: "short phone and malformed email",
        phone: "123",
        email: "invalid-email",
        expectedPhone: "***",
        expectedEmail: "***@***",
      },
    ])(
      "masks $label in the public receipt",
      async ({
        phone,
        email,
        expectedPhone,
        expectedEmail,
      }) => {
        returnOrder({
          fulfillments: [
            {
              type: "PICKUP",
              state: "PROPOSED",
              pickupDetails: {
                scheduleType: "ASAP",
                recipient: {
                  displayName: "Test Customer",
                  phoneNumber: phone,
                  emailAddress: email,
                },
              },
            },
          ],
        });

        const result = await lookup();

        expect(result.status).toBe(200);

        const recipient =
          result.body.order.fulfillments[0]
            .pickupDetails.recipient;

        expect(recipient.displayName).toBe(
          "Test Customer",
        );

        expect(recipient.phoneNumber).toBe(
          expectedPhone,
        );

        expect(recipient.emailAddress).toBe(
          expectedEmail,
        );

        expect(
          JSON.stringify(result.body.order),
        ).not.toContain(phone);

        expect(
          JSON.stringify(result.body.order),
        ).not.toContain(email);
      },
    );
  });
});
