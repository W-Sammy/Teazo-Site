import { afterEach, describe, expect, it, vi } from "vitest";
import { SquareError } from "square";

const mocks = vi.hoisted(() => ({ getOrder: vi.fn() }));
vi.mock("@/app/lib/square", () => ({ squareClient: { orders: { get: mocks.getOrder } } }));

const { GET } = await import("@/app/api/orders/[id]/route");

const ORDER_ID = "CVuxowTLMQkI9Yq9SFJ84oG6phYZY";

function lookup(id: string) {
  return GET(new Request(`http://localhost:3000/api/orders/${id}`), { params: Promise.resolve({ id }) });
}

function squareOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    state: "OPEN",
    locationId: "LOC",
    metadata: { teazo_source: "website_checkout" },
    tenders: [{ id: "T1" }],
    lineItems: [{ name: "Black Jade Tea", quantity: "2" }],
    fulfillments: [
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickupDetails: {
          scheduleType: "ASAP",
          recipient: { displayName: "Test Customer", phoneNumber: "+14155550100", emailAddress: "test@example.com" },
        },
      },
    ],
    totalMoney: { amount: 1650, currency: "USD" },
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/orders/[id] (TZ-444)", () => {
  it("returns a paid website order with the contact details masked", async () => {
    mocks.getOrder.mockResolvedValue({ order: squareOrder() });
    const res = await lookup(ORDER_ID);
    expect(res.status).toBe(200);
    const { order } = await res.json();
    expect(order).toMatchObject({ id: ORDER_ID, isPaid: true });
    expect(order.fulfillments[0].pickupDetails.recipient).toEqual({
      displayName: "Test Customer",
      phoneNumber: "***-***-0100",
      emailAddress: "t***@example.com",
    });
    expect(JSON.stringify(order)).not.toContain("test@example.com");
    expect(order.metadata).toBeUndefined();
    expect(order.tenders).toBeUndefined();
  });

  it("reports an order without a payment as unpaid", async () => {
    mocks.getOrder.mockResolvedValue({ order: squareOrder({ tenders: [] }) });
    const { order } = await (await lookup(ORDER_ID)).json();
    expect(order.isPaid).toBe(false);
  });

  it("answers 404 for an order not placed through the website, such as an in-store one", async () => {
    mocks.getOrder.mockResolvedValue({ order: squareOrder({ metadata: undefined }) });
    const res = await lookup(ORDER_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found." });
  });

  it("answers the same 404 when Square has no such order", async () => {
    mocks.getOrder.mockRejectedValue(new SquareError({ statusCode: 404, body: { errors: [{ code: "NOT_FOUND" }] } }));
    const res = await lookup(ORDER_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Order not found." });
  });

  it("answers 404 for a malformed ID without asking Square", async () => {
    for (const id of ["short", "has spaces in it", "../../admin", "x".repeat(65)]) {
      expect((await lookup(id)).status).toBe(404);
    }
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });

  it("keeps error details out of the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getOrder.mockRejectedValue(new Error("secret internal detail"));
    const res = await lookup(ORDER_ID);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret internal detail");
  });
});
