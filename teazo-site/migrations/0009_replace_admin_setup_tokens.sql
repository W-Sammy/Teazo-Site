-- A newly issued setup link replaces earlier setup links for the account.
-- The trigger runs atomically with the token insertion.

CREATE TRIGGER trg_replace_admin_setup_tokens
AFTER INSERT ON admin_password_token
WHEN NEW.purpose = 'setup'
BEGIN
  UPDATE admin_password_token
     SET used_at = NEW.created_at
   WHERE admin_user_id = NEW.admin_user_id
     AND purpose = 'setup'
     AND used_at IS NULL
     AND id <> NEW.id;
END;