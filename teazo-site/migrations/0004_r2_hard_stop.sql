-- 0004: hard stops so R2 can never produce a bill.
--
-- R2 is the only part of this stack that can charge money. On the free plans,
-- D1 and Workers refuse requests past their limits; R2 bills anything past its
-- free allowance, and Cloudflare offers no spending cap. So the proxy Worker
-- enforces its own limits, and these two tables are what it checks. Only the
-- Worker writes to them. See teazo-d1-proxy/src/index.ts.

-- Every object the Worker has stored, and its size. All bytes enter R2 through
-- PUT /media and leave through DELETE /media or the sweeper, so the storage cap
-- is checked against this ledger instead of listing the bucket on every upload.
-- When a step fails partway, the ledger ends up counting MORE than R2 holds,
-- never less, so the cap errs on the safe side.
CREATE TABLE r2_object (
  r2_bucket TEXT NOT NULL,
  r2_key    TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  stored_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (r2_bucket, r2_key)
);

-- Class A operations (uploads and bucket listings) per bucket per UTC day. A
-- daily budget keeps any 31-day window under the monthly free amount, whatever
-- day the account's billing period starts on.
CREATE TABLE r2_class_a_day (
  r2_bucket TEXT NOT NULL,
  day       TEXT NOT NULL CHECK (length(day) = 10),  -- YYYY-MM-DD, UTC
  ops       INTEGER NOT NULL DEFAULT 0 CHECK (ops >= 0),
  PRIMARY KEY (r2_bucket, day)
);

-- When the sweeper marks queued bytes as deleted, drop them from the ledger in
-- the same statement. Doing it here costs the sweeper no extra subrequests.
CREATE TRIGGER trg_r2_object_reaped
AFTER UPDATE OF deleted_at ON pending_r2_deletion
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  DELETE FROM r2_object
   WHERE r2_bucket = NEW.r2_bucket
     AND r2_key = NEW.r2_key;
END;
