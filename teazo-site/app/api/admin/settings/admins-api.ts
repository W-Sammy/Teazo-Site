import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";

// Replace these with your authenticated backend requests when gucci
export async function fetchAdmins(): Promise<Admin[]> {
  throw new Error("fetchAdmins is not connected to the backend yet.");
}

export async function createAdmin(_input: NewAdminInput): Promise<Admin> {
  throw new Error("createAdmin is not connected to the backend yet.");
}

export async function updateAdminRole(
  _id: number,
  _role: AdminRole
): Promise<Admin> {
  throw new Error("updateAdminRole is not connected to the backend yet.");
}

export async function updateInvitePermission(
  _id: number,
  _canInviteUsers: boolean
): Promise<Admin> {
  throw new Error(
    "updateInvitePermission is not connected to the backend yet."
  );
}

export async function removeAdmin(_id: number): Promise<void> {
  throw new Error("removeAdmin is not connected to the backend yet.");
}
