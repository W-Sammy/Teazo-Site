import { useCallback, useState } from "react";

import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";
import { OWNER_ROLE, WRITE_ROLE } from "@/app/types/admin-perms";

export function useAdmins(initialAdmins: Admin[]) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [errorMessage, setErrorMessage] = useState("");

  const clearError = useCallback(() => setErrorMessage(""), []);
  const setError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const changeRole = (id: number, role: AdminRole) => {
    setAdmins((currentAdmins) =>
      currentAdmins.map((admin) => {
        if (admin.id !== id || admin.role === OWNER_ROLE) return admin;

        return {
          ...admin,
          role,
          canInviteUsers:
            role === WRITE_ROLE ? admin.canInviteUsers : false,
        };
      })
    );
  };

  const toggleInvitePermission = (admin: Admin) => {
    if (admin.role === OWNER_ROLE) return;

    if (admin.role !== WRITE_ROLE) {
      setError(
        `${admin.username} needs Write access before they can invite users.`
      );
      return;
    }

    setAdmins((currentAdmins) =>
      currentAdmins.map((currentAdmin) =>
        currentAdmin.id === admin.id
          ? {
              ...currentAdmin,
              canInviteUsers: !currentAdmin.canInviteUsers,
            }
          : currentAdmin
      )
    );
  };

  const deleteAdmin = (admin: Admin) => {
    if (admin.role === OWNER_ROLE) {
      setError("The owner cannot be deleted.");
      return;
    }

    setAdmins((currentAdmins) =>
      currentAdmins.filter(
        (currentAdmin) => currentAdmin.id !== admin.id
      )
    );
  };

  const addAdmin = (input: NewAdminInput) => {
    const username = input.username.trim();
    const email = input.email.trim();

    if (!username || !email) {
      setError("Please enter both a username and email.");
      return false;
    }

    const newAdmin: Admin = {
      id: Date.now(),
      username,
      email,
      role: input.role,
      canInviteUsers:
        input.role === WRITE_ROLE ? input.canInviteUsers : false,
    };

    setAdmins((currentAdmins) => [...currentAdmins, newAdmin]);
    return true;
  };

  return {
    admins,
    errorMessage,
    clearError,
    setError,
    addAdmin,
    deleteAdmin,
    changeRole,
    toggleInvitePermission,
  };
}
