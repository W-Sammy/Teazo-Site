/**
 * Persistent checkout-attempt operations. Each state transition is a single
 * conditional D1 statement; races cannot grant two owners the same attempt.
 *
 * Never delete an unresolved attempt or issue Square requests with a new key
 * to recover it. The original serialized Square request is the source of truth.
 */
import { prepare } from "@/app/lib/d1";

export type CheckoutAttemptStatus =
  | "reserved"
  | "processing"
  | "uncertain"
  | "completed";

export interface CheckoutAttempt {
  attempt_id: string;
  request_hash: string;
  square_idempotency_key: string;
  square_request_json: string;
  status: CheckoutAttemptStatus;
  processing_owner: string | null;
  processing_started_at: string | null;
  checkout_url: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReserveCheckoutAttemptInput {
  attemptId: string;
  requestHash: string;
  squareIdempotencyKey: string;
  squareRequestJson: string;
}

export async function reserveCheckoutAttempt(
  input: ReserveCheckoutAttemptInput,
): Promise<CheckoutAttempt | null> {
  return prepare(
    `INSERT INTO checkout_attempt (
       attempt_id, request_hash, square_idempotency_key, square_request_json, status
     ) VALUES (?1, ?2, ?3, ?4, 'reserved')
     ON CONFLICT (attempt_id) DO NOTHING
     RETURNING *`,
  )
    .bind(
      input.attemptId,
      input.requestHash,
      input.squareIdempotencyKey,
      input.squareRequestJson,
    )
    .first<CheckoutAttempt>();
}

export async function getCheckoutAttempt(
  attemptId: string,
): Promise<CheckoutAttempt | null> {
  return prepare("SELECT * FROM checkout_attempt WHERE attempt_id = ?1")
    .bind(attemptId)
    .first<CheckoutAttempt>();
}

export async function beginCheckoutProcessing(
  attemptId: string,
  ownerId: string,
): Promise<CheckoutAttempt | null> {
  return prepare(
    `UPDATE checkout_attempt
        SET status = 'processing', processing_owner = ?2,
            processing_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE attempt_id = ?1 AND status = 'reserved'
     RETURNING *`,
  )
    .bind(attemptId, ownerId)
    .first<CheckoutAttempt>();
}

/** Only one request may reclaim an uncertain attempt. */
export async function resumeUncertainCheckoutAttempt(
  attemptId: string,
  ownerId: string,
): Promise<CheckoutAttempt | null> {
  return prepare(
    `UPDATE checkout_attempt
        SET status = 'processing', processing_owner = ?2,
            processing_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE attempt_id = ?1 AND status = 'uncertain'
     RETURNING *`,
  )
    .bind(attemptId, ownerId)
    .first<CheckoutAttempt>();
}

/**
 * Take over a stalled request only if its exact owner and start time are
 * unchanged. Its original Square key and request JSON are never changed.
 * Square idempotency protects against an earlier caller finishing late.
 */
export async function recoverStalledCheckoutAttempt(
  attempt: CheckoutAttempt,
  newOwnerId: string,
): Promise<CheckoutAttempt | null> {
  if (!attempt.processing_owner || !attempt.processing_started_at) return null;
  return prepare(
    `UPDATE checkout_attempt
        SET processing_owner = ?2,
            processing_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE attempt_id = ?1 AND status = 'processing'
        AND processing_owner = ?3 AND processing_started_at = ?4
     RETURNING *`,
  )
    .bind(
      attempt.attempt_id,
      newOwnerId,
      attempt.processing_owner,
      attempt.processing_started_at,
    )
    .first<CheckoutAttempt>();
}

export async function completeCheckoutAttempt(
  attemptId: string,
  ownerId: string,
  checkoutUrl: string,
  orderId: string,
): Promise<CheckoutAttempt | null> {
  return prepare(
    `UPDATE checkout_attempt
        SET status = 'completed', checkout_url = ?3, order_id = ?4,
            processing_owner = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE attempt_id = ?1 AND processing_owner = ?2
        AND status = 'processing'
     RETURNING *`,
  )
    .bind(attemptId, ownerId, checkoutUrl, orderId)
    .first<CheckoutAttempt>();
}

export async function markCheckoutUncertain(
  attemptId: string,
  ownerId: string,
): Promise<CheckoutAttempt | null> {
  return prepare(
    `UPDATE checkout_attempt
        SET status = 'uncertain', processing_owner = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE attempt_id = ?1 AND processing_owner = ?2
        AND status = 'processing'
     RETURNING *`,
  )
    .bind(attemptId, ownerId)
    .first<CheckoutAttempt>();
}
