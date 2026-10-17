-- Shared storage for first-time password setup and password resets.
-- Store a hash of each emailed token, never the original token.
-- Timestamps use Unix time in seconds.

CREATE TABLE admin_password_token (
  id TEXT PRIMARY KEY NOT NULL,
  admin_user_id TEXT NOT NULL
    REFERENCES admin_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('setup', 'reset')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  CHECK (expires_at > created_at)
);

CREATE INDEX ix_admin_password_token_admin
  ON admin_password_token (admin_user_id);

-- Increment this after a password change.
-- Later, protected requests will compare it with the session's version.
ALTER TABLE admin_user
ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0
  CHECK (session_version >= 0);