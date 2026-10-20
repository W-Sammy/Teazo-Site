// Server code only. Never import this file into a client component.

import { prepare } from "@/app/lib/d1";
import type {
  AdminRole,
  NewAdminInput,
} from "@/app/types/admin-perms";

export type SettingsAdmin = {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
};

const adminSelect = `
  SELECT id, username, email, role_id AS role
    FROM admin_user
   WHERE deleted_at IS NULL`;

export async function listSettingsAdmins(): Promise<SettingsAdmin[]> {
  const { results } = await prepare(
    `${adminSelect} ORDER BY username COLLATE NOCASE, id`,
  ).all<SettingsAdmin>();

  return results;
}

export async function createSettingsAdmin(
  input: NewAdminInput,
): Promise<SettingsAdmin> {
  const username = input.username.trim();
  const email = input.email.trim();
  const id = crypto.randomUUID();

  // New accounts always receive role 2 (Admin).
  // Keep can_invite_users at 0 for compatibility with the
  // existing D1 schema; the field no longer grants privileges.
  await prepare(
    `INSERT INTO admin_user
       (id, email, email_normalized, username, role_id,
        can_invite_users, status)
     VALUES (?1, ?2, ?3, ?4, 2, 0, 'invited')`,
  )
    .bind(
      id,
      email,
      email.toLowerCase(),
      username,
    )
    .run();

  return requireSettingsAdmin(id);
}

// Role editing and Manage Admins permission updates
// are retired from the two-role administration system.

export async function removeSettingsAdmin(
  id: string,
): Promise<void> {
  // The API requires Owner access before this function runs.
  // The SQL statement independently protects the Owner row.
  await prepare(
    `UPDATE admin_user
        SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1
        AND deleted_at IS NULL
        AND role_id <> 1`,
  )
    .bind(id)
    .run();
}

async function requireSettingsAdmin(
  id: string,
): Promise<SettingsAdmin> {
  const admin = await prepare(
    `${adminSelect} AND id = ?1`,
  )
    .bind(id)
    .first<SettingsAdmin>();

  if (!admin) {
    throw new Error(
      "Admin not found or cannot be changed.",
    );
  }

  return admin;
}
