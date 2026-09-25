// Server code only. Never import this file into a client component.
import { prepare } from "@/app/lib/d1";
import type { AdminRole, NewAdminInput } from "@/app/types/admin-perms";

export type SettingsAdmin = {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  canInviteUsers: boolean;
};

type SettingsAdminRow = Omit<SettingsAdmin, "canInviteUsers"> & {
  canInviteUsers: number;
};

function mapAdmin(admin: SettingsAdminRow): SettingsAdmin {
  return { ...admin, canInviteUsers: admin.canInviteUsers === 1 };
}

const adminSelect = `
  SELECT id, username, email, role_id AS role,
         can_invite_users AS canInviteUsers
    FROM admin_user
   WHERE deleted_at IS NULL`;

export async function listSettingsAdmins(): Promise<SettingsAdmin[]> {
  const { results } = await prepare(
    `${adminSelect} ORDER BY username COLLATE NOCASE, id`,
  ).all<SettingsAdminRow>();
  return results.map(mapAdmin);
}

export async function createSettingsAdmin(input: NewAdminInput): Promise<SettingsAdmin> {
  const username = input.username.trim();
  const email = input.email.trim();
  const id = crypto.randomUUID();
  const canInviteUsers = input.role === 2 && input.canInviteUsers ? 1 : 0;

  await prepare(
    `INSERT INTO admin_user
       (id, email, email_normalized, username, role_id, can_invite_users, status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'invited')`,
  ).bind(id, email, email.toLowerCase(), username, input.role, canInviteUsers).run();

  return requireSettingsAdmin(id);
}

export async function updateSettingsAdminRole(id: string, role: AdminRole) {
  await prepare(
    `UPDATE admin_user
        SET role_id = ?1,
            can_invite_users = CASE WHEN ?1 = 2 THEN can_invite_users ELSE 0 END,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?2 AND deleted_at IS NULL AND role_id <> 1`,
  ).bind(role, id).run();
  return requireSettingsAdmin(id);
}

export async function updateSettingsAdminInvitePermission(
  id: string,
  canInviteUsers: boolean,
) {
  await prepare(
    `UPDATE admin_user
        SET can_invite_users = ?1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?2 AND deleted_at IS NULL AND role_id = 2`,
  ).bind(canInviteUsers ? 1 : 0, id).run();
  return requireSettingsAdmin(id);
}

export async function removeSettingsAdmin(id: string): Promise<void> {
  await prepare(
    `UPDATE admin_user
        SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1 AND deleted_at IS NULL AND role_id <> 1`,
  ).bind(id).run();
}

async function requireSettingsAdmin(id: string): Promise<SettingsAdmin> {
  const admin = await prepare(`${adminSelect} AND id = ?1`)
    .bind(id)
    .first<SettingsAdminRow>();
  if (!admin) throw new Error("Admin not found or cannot be changed.");
  return mapAdmin(admin);
}
