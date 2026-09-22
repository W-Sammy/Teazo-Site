import { auth } from "@/auth";
import { prepare } from "./d1";

export type Admin = {
  id: string;
  username: string;
  role_id: number;
  can_invite_users: number;
};

/** Roles: 1 Owner, 2 Can Edit, 3 Can View. A lower number is more access. */
export async function getAdmin(
  minRole: 1 | 2 | 3
): Promise<Admin | null> {
  const email = (await auth())?.user?.email;

  if (!email) return null;

  const admin = await prepare(
    `SELECT id, username, role_id, can_invite_users
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')`
  )
    .bind(email.trim().toLowerCase())
    .first<Admin>();

  return admin && admin.role_id <= minRole ? admin : null;
}