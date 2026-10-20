-- Invalidate outstanding setup/reset links whenever a password changes.
-- This trigger runs within the same transaction as the password update.

CREATE TRIGGER trg_admin_user_consume_password_tokens
AFTER UPDATE OF password_hash ON admin_user
WHEN NEW.password_hash IS NOT OLD.password_hash
BEGIN
  UPDATE admin_password_token
     SET used_at = CAST(strftime('%s', 'now') AS INTEGER)
   WHERE admin_user_id = NEW.id
     AND used_at IS NULL;
END;