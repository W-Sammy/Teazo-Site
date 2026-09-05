export type AdminRole = 1 | 2 | 3;

export interface Admin {
  id: number;
  username: string;
  email: string;
  role: AdminRole;
  canInviteUsers: boolean;
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  1: "Owner",
  2: "Can Edit",
  3: "Can View",
};
