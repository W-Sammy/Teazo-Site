import { useCallback, useState } from "react";

import {
  createAdmin,
  fetchAdmins,
  removeAdmin,
} from "@/app/api/admin/settings/admins-api";
import type {
  Admin,
  NewAdminInput,
} from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";

export function useAdmins(initialAdmins: Admin[] = []) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const clearError = useCallback(() => setErrorMessage(""), []);

  const setError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const loadAdmins = useCallback(async () => {
    try {
      const response = await fetchAdmins();

      setAdmins(response.admins);
      setCanManageAdmins(response.canEdit);
      clearError();
    } catch (error) {
      // Fail closed if permissions cannot be confirmed.
      setCanManageAdmins(false);

      setError(
        error instanceof Error
          ? error.message
          : "The admins could not be loaded.",
      );
    }
  }, [clearError, setError]);

  const deleteAdmin = async (admin: Admin): Promise<boolean> => {
    if (!canManageAdmins) {
      setError("Only the Owner can remove administrators.");
      return false;
    }

    if (admin.role === OWNER_ROLE) {
      setError("The Owner cannot be deleted.");
      return false;
    }

    try {
      await removeAdmin(admin.id);

      setAdmins((currentAdmins) =>
        currentAdmins.filter(
          (currentAdmin) => currentAdmin.id !== admin.id,
        ),
      );

      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The admin could not be deleted.",
      );

      return false;
    }
  };

  const addAdmin = async (input: NewAdminInput) => {
    if (!canManageAdmins) {
      return {
        success: false as const,
        error: "Only the Owner can add administrators.",
      };
    }

    const username = input.username.trim();
    const email = input.email.trim();

    if (!username || !email) {
      return {
        success: false as const,
        error: "Please enter both a username and email.",
      };
    }

    try {
      // The server assigns role 2 and no administrator-management privilege.
      const newAdmin = await createAdmin({
        username,
        email,
      });

      setAdmins((currentAdmins) => [
        ...currentAdmins,
        newAdmin,
      ]);

      return { success: true as const };
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : "The admin could not be added.",
      };
    }
  };

  return {
    admins,
    canManageAdmins,
    errorMessage,
    clearError,
    setError,
    loadAdmins,
    addAdmin,
    deleteAdmin,
  };
}
