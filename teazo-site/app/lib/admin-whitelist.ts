import "server-only";
import { prepare } from "./d1";

// The administrator system recognizes only two roles:
// 1 = Owner
// 2 = Admin
export type AdminRole = 1 | 2;

export type Admin = {
  id: string;
  username: string;
  role_id: AdminRole;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Look up an active, authorized Owner or Admin by normalized email.
export async function findAuthorizedAdmin(
  email: string,
): Promise<Admin | null> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return null;

  return prepare(
    `SELECT id, username, role_id
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')
        AND role_id IN (1, 2)
      LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<Admin>();
}
