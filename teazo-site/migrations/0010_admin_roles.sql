-- TEAZO — Simplify administrator roles.
--
-- Keep two roles:
--   1 = Owner
--   2 = Admin
--
-- Existing Can View users (role 3) become Admins.
-- Only the Owner will be authorized to add or remove admins
-- through the application API.
--
-- Preserve existing accounts, IDs, emails, and password hashes.

-- Remove obsolete per-user admin management permissions.
UPDATE admin_user
SET can_invite_users = 0
WHERE can_invite_users <> 0;

-- Convert all Can View accounts to Admin, including soft-deleted
-- records, so the retired role is no longer referenced.
UPDATE admin_user
SET role_id = 2
WHERE role_id = 3;

-- Rename the existing Can Edit role to Admin.
UPDATE role
SET key = 'admin',
    label = 'Admin'
WHERE id = 2;

-- Retire the old Can View role.
DELETE FROM role
WHERE id = 3;
