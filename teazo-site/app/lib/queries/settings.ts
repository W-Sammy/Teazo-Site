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
  canManageAdmins: boolean;
  canResendInvitation: boolean;
  canReceiveOwnership: boolean;
};

type SettingsAdminRow = {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  canResendInvitation: number;
  canReceiveOwnership: number;
};

function mapAdmin(admin: SettingsAdminRow): SettingsAdmin {
  return {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role,

    // The legacy can_invite_users flag does not grant access.
    canManageAdmins: admin.role === 1,
    canResendInvitation: admin.canResendInvitation === 1,

    // Only active regular Admins are eligible to receive ownership.
    canReceiveOwnership: admin.canReceiveOwnership === 1,
  };
}

const adminSelect = `
  SELECT id, username, email, role_id AS role,
         CASE
           WHEN password_hash IS NULL
             AND status IN ('active', 'invited')
             AND role_id IN (1, 2)
           THEN 1
           ELSE 0
         END AS canResendInvitation,
         CASE
           WHEN role_id = 2
             AND status = 'active'
           THEN 1
           ELSE 0
         END AS canReceiveOwnership
    FROM admin_user
   WHERE deleted_at IS NULL`;

export async function listSettingsAdmins(): Promise<SettingsAdmin[]> {
  const { results } = await prepare(
    `${adminSelect} ORDER BY username COLLATE NOCASE, id`,
  ).all<SettingsAdminRow>();

  return results.map(mapAdmin);
}

export async function createSettingsAdmin(
  input: NewAdminInput,
): Promise<SettingsAdmin> {
  const username = input.username.trim();
  const email = input.email.trim();
  const id = crypto.randomUUID();

  // All new accounts receive role 2 (Admin).
  // Legacy management privileges remain disabled.
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

// Update the username of an existing Owner or Admin account.
//
// Owner-only authorization must be enforced by the calling API.
// SQL independently restricts updates to non-deleted accounts
// belonging to the supported two-role administrator system.
//
// Account IDs, email addresses, roles, permissions, passwords,
// and session versions are never modified by this operation.
export async function updateSettingsAdminUsername(
  id: string,
  username: string,
): Promise<SettingsAdmin> {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Admin not found or cannot be changed.");
  }

  if (typeof username !== "string") {
    throw new Error("Username must be a string.");
  }

  const normalizedUsername = username.trim();

  if (!normalizedUsername) {
    throw new Error("Username is required.");
  }

  // Keep this limit consistent with administrator creation
  // validation in the API.
  if (normalizedUsername.length > 40) {
    throw new Error("Username must be 40 characters or fewer.");
  }

  await prepare(
    `UPDATE admin_user
        SET username = ?2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1
        AND deleted_at IS NULL
        AND role_id IN (1, 2)`,
  )
    .bind(id, normalizedUsername)
    .run();

  // Re-read the account to verify that the requested username
  // was persisted and the account still exists.
  const updated = await requireSettingsAdmin(id);

  if (updated.username !== normalizedUsername) {
    throw new Error("Admin not found or cannot be changed.");
  }

  return updated;
}

// Role editing and Manage Admins permission updates are retired.

export async function removeSettingsAdmin(
  id: string,
): Promise<void> {
  // Owner access is enforced by the API.
  // SQL independently protects the Owner account.
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
    .first<SettingsAdminRow>();

  if (!admin) {
    throw new Error(
      "Admin not found or cannot be changed.",
    );
  }

  return mapAdmin(admin);
}

export async function findSettingsAdminForInvitation(
  id: string,
): Promise<SettingsAdmin | null> {
  const admin = await prepare(
    `${adminSelect}
       AND id = ?1
       AND password_hash IS NULL
       AND status IN ('active', 'invited')
       AND role_id IN (1, 2)`,
  )
    .bind(id)
    .first<SettingsAdminRow>();

  return admin ? mapAdmin(admin) : null;
}
