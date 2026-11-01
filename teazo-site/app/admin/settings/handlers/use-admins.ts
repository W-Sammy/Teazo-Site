import { useCallback, useState } from "react";

import {
  createAdmin,
  fetchAdmins,
  removeAdmin,
  updateAdminUsername,
} from "@/app/api/admin/settings/admins-api";
import type {
  Admin,
  NewAdminInput,
} from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";

const MAX_USERNAME_LENGTH = 40;

export function useAdmins(initialAdmins: Admin[] = []) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const clearError = useCallback(() => {
    setErrorMessage("");
  }, []);

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
      // The server assigns role 2 and no management privilege.
      const result = await createAdmin({
        username,
        email,
      });

      setAdmins((currentAdmins) => [
        ...currentAdmins,
        result.admin,
      ]);

      return {
        success: true as const,
        invitation: result.invitation,
      };
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

  // Only the Owner may edit existing administrator usernames.
  // The API independently enforces Owner-only authorization.
  const editAdminUsername = async (
    admin: Admin,
    username: string,
  ) => {
    if (!canManageAdmins) {
      return {
        success: false as const,
        error: "Only the Owner can edit administrator accounts.",
      };
    }

    const normalizedUsername = username.trim();

    if (!normalizedUsername) {
      return {
        success: false as const,
        error: "Username is required.",
      };
    }

    if (normalizedUsername.length > MAX_USERNAME_LENGTH) {
      return {
        success: false as const,
        error: `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`,
      };
    }

    if (normalizedUsername === admin.username) {
      return {
        success: false as const,
        error: "The username has not changed.",
      };
    }

    try {
      // Send the update only after client-side validation.
      // The server revalidates both authorization and input.
      const updatedAdmin = await updateAdminUsername(
        admin.id,
        normalizedUsername,
      );

      if (
        updatedAdmin.id !== admin.id ||
        updatedAdmin.username !== normalizedUsername
      ) {
        throw new Error(
          "The administrator update could not be verified.",
        );
      }

      // Preserve all existing account properties.
      // Update the displayed username only after the API succeeds.
      setAdmins((currentAdmins) =>
        currentAdmins.map((currentAdmin) =>
          currentAdmin.id === admin.id
            ? {
                ...currentAdmin,
                username: updatedAdmin.username,
              }
            : currentAdmin,
        ),
      );

      return {
        success: true as const,
        admin: updatedAdmin,
      };
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : "The administrator username could not be updated.",
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
    editAdminUsername,
  };
}
