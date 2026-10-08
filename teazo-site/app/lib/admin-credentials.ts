import "server-only";
import { normalizeEmail } from "./admin-whitelist";
import { prepare } from "./d1";

type AdminCredentials = {
  id: string;
  username: string;
  email_normalized: string;
  password_hash: string;
};
export async function findAdminCredentials(
  email: string,
): Promise<AdminCredentials | null> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizeEmail) return null;

  return prepare(
    `SELECT id, username, email_normalized, password_hash
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')
        AND role_id IN (1, 2, 3)
        AND password_hash IS NOT NULL
      LIMIT 1`,
  )
    .bind(normalizeEmail)
    .first<AdminCredentials>();
}
