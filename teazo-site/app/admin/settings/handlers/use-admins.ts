import { useCallback, useState } from "react";

import {
  createAdmin,
  fetchAdmins,
  removeAdmin,
  updateAdminRole,
  updateInvitePermission,
} from "@/app/api/admin/settings/admins-api";
import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";
import { OWNER_ROLE, WRITE_ROLE } from "@/app/types/admin-perms";

export function useAdmins(initialAdmins: Admin[] = []) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [errorMessage, setErrorMessage] = useState("");
  const clearError = useCallback(() => setErrorMessage(""), []);
  const setError = useCallback((message: string) => setErrorMessage(message), []);

  const loadAdmins = useCallback(async () => {
    try {
      setAdmins(await fetchAdmins());
    } catch (error) {
      setError(error instanceof Error ? error.message : "The admins could not be loaded.");
    }
  }, [setError]);

  const changeRole = async (id: string, role: AdminRole) => {
    const admin = admins.find((currentAdmin) => currentAdmin.id === id);
    if (!admin || admin.role === OWNER_ROLE) return;
    try {
      const updatedAdmin = await updateAdminRole(id, role);
      setAdmins((currentAdmins) => currentAdmins.map((currentAdmin) =>
        currentAdmin.id === id ? updatedAdmin : currentAdmin,
      ));
    } catch (error) {
      setError(error instanceof Error ? error.message : "The role could not be updated.");
    }
  };

  const toggleInvitePermission = async (admin: Admin) => {
    if (admin.role === OWNER_ROLE) return;
    if (admin.role !== WRITE_ROLE) {
      setError(`${admin.username} needs Edit access before they can invite users.`);
      return;
    }
    try {
      const updatedAdmin = await updateInvitePermission(admin.id, !admin.canInviteUsers);
      setAdmins((currentAdmins) => currentAdmins.map((currentAdmin) =>
        currentAdmin.id === admin.id ? updatedAdmin : currentAdmin,
      ));
    } catch (error) {
      setError(error instanceof Error ? error.message : "The invitation permission could not be updated.");
    }
  };

  const deleteAdmin = async (admin: Admin) => {
    if (admin.role === OWNER_ROLE) {
      setError("The owner cannot be deleted.");
      return;
    }
    try {
      await removeAdmin(admin.id);
      setAdmins((currentAdmins) => currentAdmins.filter((currentAdmin) => currentAdmin.id !== admin.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : "The admin could not be deleted.");
    }
  };

  const addAdmin = async (input: NewAdminInput) => {
    const username = input.username.trim();
    const email = input.email.trim();
    if (!username || !email) {
      return { success: false as const, error: "Please enter both a username and email." };
    }
    try {
      const newAdmin = await createAdmin({ ...input, username, email });
      setAdmins((currentAdmins) => [...currentAdmins, newAdmin]);
      return { success: true as const };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "The admin could not be added.",
      };
    }
  };

  return { admins, errorMessage, clearError, setError, loadAdmins, addAdmin, deleteAdmin, changeRole, toggleInvitePermission };
}
