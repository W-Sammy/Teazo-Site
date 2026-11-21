-- Persistent checkout attempts for Square payment-link idempotency.
-- A unique attempt ID prevents independent claims for the same purchase.
-- Square request data and its idempotency key are retained for recovery.

CREATE TABLE IF NOT EXISTS checkout_attempt (
    attempt_id TEXT PRIMARY KEY NOT NULL,
    request_hash TEXT NOT NULL,
    square_idempotency_key TEXT NOT NULL UNIQUE,
    square_request_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'processing', 'uncertain', 'completed')),
    processing_owner TEXT,
    processing_started_at TEXT,
    checkout_url TEXT,
    order_id TEXT,
    created_at TEXT NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
        status != 'completed'
        OR (checkout_url IS NOT NULL AND order_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_checkout_attempt_status_created
    ON checkout_attempt (status, created_at);
