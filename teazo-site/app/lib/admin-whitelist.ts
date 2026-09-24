import "server-only";

import { prepare } from "./d1";

export type AdminRole = 1 | 2 | 3;

export type Admin = {
  id: string;
  username: string;
  role_id: AdminRole;
  can_invite_users: number;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Call to normalize email and prepare query
export async function findAuthorizedAdmin(
  email: string,
): Promise<Admin | null> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return null;

  return prepare(
    `SELECT id, username, role_id, can_invite_users
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')
        AND role_id IN (1, 2, 3)
      LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<Admin>();
}