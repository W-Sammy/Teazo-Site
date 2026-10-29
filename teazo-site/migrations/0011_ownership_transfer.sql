-- TEAZO - Owner-initiated ownership transfers.
--
-- Only an existing Owner can initiate a transfer.
-- The receiving Admin must explicitly accept or decline.
-- Approval links expire after 24 hours.
--
-- Keep the existing ux_admin_user_single_owner index.
-- No ownership changes happen when a request is created.

CREATE TABLE ownership_transfer_request (
  id TEXT PRIMARY KEY NOT NULL,

  owner_admin_id TEXT NOT NULL
    REFERENCES admin_user(id) ON DELETE RESTRICT,

  recipient_admin_id TEXT NOT NULL
    REFERENCES admin_user(id) ON DELETE RESTRICT,

  -- Store only the SHA-256 hash, never the email token.
  token_hash TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'accepted',
        'declined',
        'canceled',
        'expired'
      )
    ),

  -- Unix timestamps in seconds.
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  resolved_at INTEGER,

  CHECK (owner_admin_id <> recipient_admin_id),
  CHECK (expires_at > created_at),

  CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR
    (status <> 'pending' AND resolved_at IS NOT NULL)
  )
);

-- Only one pending transfer may exist at a time.
CREATE UNIQUE INDEX ux_ownership_transfer_one_pending
  ON ownership_transfer_request(status)
  WHERE status = 'pending';

CREATE INDEX ix_ownership_transfer_recipient
  ON ownership_transfer_request(
    recipient_admin_id,
    status
  );

-- Completed, declined, canceled, and expired requests
-- cannot be reopened or accepted again.
CREATE TRIGGER trg_ownership_transfer_status_transition
BEFORE UPDATE OF status ON ownership_transfer_request
WHEN OLD.status <> 'pending'
  OR NEW.status = 'pending'
BEGIN
  SELECT RAISE(
    ABORT,
    'Invalid ownership transfer status transition'
  );
END;

-- Accepting a request performs the entire role exchange
-- as part of the same atomic SQLite statement.
CREATE TRIGGER trg_ownership_transfer_accept
AFTER UPDATE OF status ON ownership_transfer_request
WHEN OLD.status = 'pending'
  AND NEW.status = 'accepted'
BEGIN

  -- Reject expired requests.
  SELECT CASE WHEN
    NEW.resolved_at IS NULL
    OR CAST(strftime('%s', 'now') AS INTEGER)
       >= NEW.expires_at
  THEN RAISE(
    ABORT,
    'Ownership transfer link expired'
  ) END;

  -- Both accounts must still be eligible.
  SELECT CASE WHEN
    NOT EXISTS (
      SELECT 1
      FROM admin_user
      WHERE id = NEW.owner_admin_id
        AND role_id = 1
        AND deleted_at IS NULL
        AND status = 'active'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM admin_user
      WHERE id = NEW.recipient_admin_id
        AND role_id = 2
        AND deleted_at IS NULL
        AND status = 'active'
    )
  THEN RAISE(
    ABORT,
    'Ownership transfer accounts are no longer eligible'
  ) END;

  -- Demote the previous Owner first to respect
  -- the existing single-Owner unique index.
  UPDATE admin_user
  SET
    role_id = 2,
    can_invite_users = 0,
    session_version = session_version + 1
  WHERE id = NEW.owner_admin_id
    AND role_id = 1;

  -- Promote the receiving Admin.
  UPDATE admin_user
  SET
    role_id = 1,
    can_invite_users = 0,
    session_version = session_version + 1
  WHERE id = NEW.recipient_admin_id
    AND role_id = 2;

END;
