export type AdminRole = 1 | 2;
export const OWNER_ROLE: AdminRole = 1;
export const ADMIN_ROLE: AdminRole = 2;
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  1: "Owner",
  2: "Admin",
};

export interface Admin {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
}

// New users are always assigned the Admin role by the server.
// The client cannot select a role or grant management privileges.
export type NewAdminInput = {
  username: string;
  email: string;
};
