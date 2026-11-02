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

  // Derived from the account's role.
  // Only Owner can manage administrators.
  canManageAdmins: boolean;

  // Whether this account can receive another password
  // setup invitation. Eligibility does not grant
  // permission to send invitations.
  canResendInvitation: boolean;

  // Calculated by the server from the account's role
  // and status. Only an active role-2 Admin may be
  // offered ownership.
  canReceiveOwnership: boolean;
}

// The server always assigns role 2 to newly created accounts.
export type NewAdminInput = {
  username: string;
  email: string;
};
