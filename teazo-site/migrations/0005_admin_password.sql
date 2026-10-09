-- ---------------------------------------------------------------------------
-- Adds password-hash storage for admin username/password login.
-- Store only password hashes here, never plaintext passwords.
-- Existing rows receive NULL until a password hash is set.
-- ---------------------------------------------------------------------------

ALTER TABLE admin_user
ADD COLUMN password_hash TEXT;

CREATE TRIGGER trg_admin_user_password_touch
AFTER UPDATE OF password_hash ON admin_user
FOR EACH ROW
BEGIN
  UPDATE admin_user
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;