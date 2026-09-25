-- 0003: let admins hide the public contact form.
--
-- A flag on the single business_profile row. It defaults to 1, so the form
-- keeps showing exactly as before until it is turned off. SQLite allows a
-- new column to carry its own CHECK; only adding a CHECK to an EXISTING
-- column needs a full table rebuild.
ALTER TABLE business_profile
  ADD COLUMN contact_form_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (contact_form_enabled IN (0, 1));
