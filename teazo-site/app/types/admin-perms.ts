export type AdminRole = 1 | 2 | 3;

export interface Admin {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  canManageAdmins: boolean;
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  1: "Owner",
  2: "Can Edit",
  3: "Can View",
};

export type NewAdminInput = {
  username: string;
  email: string;
  role: AdminRole;
  canManageAdmins: boolean;
};

export const OWNER_ROLE: AdminRole = 1;
export const WRITE_ROLE: AdminRole = 2;
export const READ_ROLE: AdminRole = 3;
