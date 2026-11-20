/**
 * Tests persistent checkout-attempt SQL construction and conditional ownership.
 * D1 is mocked. No production or local database writes occur in this suite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), first: vi.fn(), bind: vi.fn() }));
vi.mock("@/app/lib/d1", () => ({ prepare: mocks.prepare }));

import {
  beginCheckoutProcessing,
  completeCheckoutAttempt,
  getCheckoutAttempt,
  markCheckoutUncertain,
  recoverStalledCheckoutAttempt,
  reserveCheckoutAttempt,
  resumeUncertainCheckoutAttempt,
  type CheckoutAttempt,
  type ReserveCheckoutAttemptInput,
} from "./checkout-attempts";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_OWNER_ID = "33333333-3333-4333-8333-333333333333";

const reservation: ReserveCheckoutAttemptInput = {
  attemptId: ATTEMPT_ID,
  requestHash: "test-request-hash",
  squareIdempotencyKey: ATTEMPT_ID,
  squareRequestJson: JSON.stringify({ idempotencyKey: ATTEMPT_ID, order: { locationId: "LOCATION_1", lineItems: [] } }),
};

function makeAttempt(overrides: Partial<CheckoutAttempt> = {}): CheckoutAttempt {
  return {
    attempt_id: ATTEMPT_ID,
    request_hash: reservation.requestHash,
    square_idempotency_key: reservation.squareIdempotencyKey,
    square_request_json: reservation.squareRequestJson,
    status: "reserved",
    processing_owner: null,
    processing_started_at: null,
    checkout_url: null,
    order_id: null,
    created_at: "2026-11-18T18:00:00.000Z",
    updated_at: "2026-11-18T18:00:00.000Z",
    ...overrides,
  };
}

function lastSql(): string {
  return mocks.prepare.mock.lastCall?.[0] as string;
}

describe("Checkout attempt D1 queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.bind.mockReturnValue({ first: mocks.first });
    mocks.prepare.mockReturnValue({ bind: mocks.bind });
  });

  it("atomically reserves a new checkout attempt", async () => {
    const attempt = makeAttempt();
    mocks.first.mockResolvedValueOnce(attempt);
    expect(await reserveCheckoutAttempt(reservation)).toEqual(attempt);
    expect(lastSql()).toMatch(/INSERT INTO checkout_attempt/i);
    expect(lastSql()).toMatch(/ON CONFLICT\s*\(attempt_id\)\s*DO NOTHING/i);
    expect(lastSql()).toMatch(/RETURNING\s+\*/i);
    expect(mocks.bind).toHaveBeenCalledWith(
      reservation.attemptId, reservation.requestHash,
      reservation.squareIdempotencyKey, reservation.squareRequestJson,
    );
  });

  it("returns null when another request reserved the attempt", async () => {
    mocks.first.mockResolvedValueOnce(null);
    expect(await reserveCheckoutAttempt(reservation)).toBeNull();
  });

  it("reads an existing attempt by its identifier", async () => {
    const attempt = makeAttempt({ status: "completed", checkout_url: "https://square.link/example", order_id: "ORDER_1" });
    mocks.first.mockResolvedValueOnce(attempt);
    expect(await getCheckoutAttempt(ATTEMPT_ID)).toEqual(attempt);
    expect(lastSql()).toMatch(/SELECT\s+\*/i);
    expect(lastSql()).toMatch(/FROM checkout_attempt/i);
    expect(lastSql()).toMatch(/WHERE attempt_id = \?1/i);
    expect(mocks.bind).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it("allows only a reserved attempt to enter processing", async () => {
    const processing = makeAttempt({ status: "processing", processing_owner: OWNER_ID });
    mocks.first.mockResolvedValueOnce(processing);
    expect(await beginCheckoutProcessing(ATTEMPT_ID, OWNER_ID)).toEqual(processing);
    expect(lastSql()).toMatch(/status = 'processing'/i);
    expect(lastSql()).toMatch(/status = 'reserved'/i);
    expect(mocks.bind).toHaveBeenCalledWith(ATTEMPT_ID, OWNER_ID);
  });

  it("rejects a competing processing claim", async () => {
    mocks.first.mockResolvedValueOnce(null);
    expect(await beginCheckoutProcessing(ATTEMPT_ID, OTHER_OWNER_ID)).toBeNull();
    expect(lastSql()).toMatch(/status = 'reserved'/i);
  });

  it("atomically reclaims an uncertain attempt without changing its Square request", async () => {
    const processing = makeAttempt({ status: "processing", processing_owner: OWNER_ID });
    mocks.first.mockResolvedValueOnce(processing);
    expect(await resumeUncertainCheckoutAttempt(ATTEMPT_ID, OWNER_ID)).toEqual(processing);
    expect(lastSql()).toMatch(/status = 'uncertain'/i);
    expect(lastSql()).toMatch(/status = 'processing'/i);
    expect(lastSql()).not.toMatch(/square_request_json\s*=/i);
    expect(lastSql()).not.toMatch(/square_idempotency_key\s*=/i);
    expect(mocks.bind).toHaveBeenCalledWith(ATTEMPT_ID, OWNER_ID);
  });

  it("reclaims stalled processing only if the original owner and timestamp still match", async () => {
    const original = makeAttempt({
      status: "processing", processing_owner: OWNER_ID,
      processing_started_at: "2026-11-18T18:01:00.000Z",
    });
    mocks.first.mockResolvedValueOnce({ ...original, processing_owner: OTHER_OWNER_ID });
    const result = await recoverStalledCheckoutAttempt(original, OTHER_OWNER_ID);
    expect(result?.processing_owner).toBe(OTHER_OWNER_ID);
    expect(lastSql()).toMatch(/status = 'processing'/i);
    expect(lastSql()).toMatch(/processing_owner = \?3/i);
    expect(lastSql()).toMatch(/processing_started_at = \?4/i);
    expect(mocks.bind).toHaveBeenCalledWith(
      ATTEMPT_ID, OTHER_OWNER_ID, OWNER_ID, original.processing_started_at,
    );
  });

  it("rejects recovery if the original claim has no owner or timestamp", async () => {
    expect(await recoverStalledCheckoutAttempt(makeAttempt(), OTHER_OWNER_ID)).toBeNull();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("records a completed checkout for the processing owner", async () => {
    const url = "https://sandbox.square.link/u/ORDER_1";
    const completed = makeAttempt({ status: "completed", checkout_url: url, order_id: "ORDER_1" });
    mocks.first.mockResolvedValueOnce(completed);
    expect(await completeCheckoutAttempt(ATTEMPT_ID, OWNER_ID, url, "ORDER_1")).toEqual(completed);
    expect(lastSql()).toMatch(/status = 'completed'/i);
    expect(lastSql()).toMatch(/processing_owner = \?2/i);
    expect(lastSql()).toMatch(/status = 'processing'/i);
    expect(mocks.bind).toHaveBeenCalledWith(ATTEMPT_ID, OWNER_ID, url, "ORDER_1");
  });

  it("does not complete an attempt owned by another request", async () => {
    mocks.first.mockResolvedValueOnce(null);
    expect(await completeCheckoutAttempt(ATTEMPT_ID, OTHER_OWNER_ID, "url", "order")).toBeNull();
    expect(lastSql()).toMatch(/processing_owner = \?2/i);
  });

  it("preserves uncertain Square outcomes without releasing the attempt", async () => {
    const uncertain = makeAttempt({ status: "uncertain" });
    mocks.first.mockResolvedValueOnce(uncertain);
    const result = await markCheckoutUncertain(ATTEMPT_ID, OWNER_ID);
    expect(result).toEqual(uncertain);
    expect(result?.square_request_json).toBe(reservation.squareRequestJson);
    expect(lastSql()).toMatch(/status = 'uncertain'/i);
    expect(lastSql()).toMatch(/processing_owner = \?2/i);
    expect(lastSql()).not.toMatch(/DELETE FROM/i);
    expect(mocks.bind).toHaveBeenCalledWith(ATTEMPT_ID, OWNER_ID);
  });

  it("does not let a different owner mark an attempt uncertain", async () => {
    mocks.first.mockResolvedValueOnce(null);
    expect(await markCheckoutUncertain(ATTEMPT_ID, OTHER_OWNER_ID)).toBeNull();
    expect(lastSql()).toMatch(/processing_owner = \?2/i);
  });

  it("propagates D1 reservation failures rather than claiming success", async () => {
    mocks.first.mockRejectedValueOnce(new Error("D1 proxy unavailable"));
    await expect(reserveCheckoutAttempt(reservation)).rejects.toThrow("D1 proxy unavailable");
  });

  it("propagates failures during processing transitions", async () => {
    mocks.first.mockRejectedValueOnce(new Error("Database write failed"));
    await expect(beginCheckoutProcessing(ATTEMPT_ID, OWNER_ID)).rejects.toThrow("Database write failed");
  });
});
