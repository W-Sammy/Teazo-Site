"use client";

import {
  useEffect,
  useState,
} from "react";

import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";
import { AddAdminModal } from "@/app/admin/settings/components/AddAdminModal";
import { AdminRow } from "@/app/admin/settings/components/AdminRow";
import { useAdmins } from "@/app/admin/settings/handlers/use-admins";

// Coordinate the admin rows, add-user modal, deletion confirmation, and error alert.
export default function AdminsTable() {
  // Mount the Add New User modal only while it is needed.
  const [showModal, setShowModal] =
    useState(false);

  // Delegate admin data, error state, and update operations to the shared hook.
  const {
    admins,
    errorMessage,
    clearError,
    setError,
    addAdmin,
    loadAdmins,
    deleteAdmin,
    changeRole,
    toggleInvitePermission,
  } = useAdmins();

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  // Automatically clear a displayed error after 3.5 seconds.
  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timeout = window.setTimeout(
      clearError,
      3500,
    );

    // Cancel the previous timer when dependencies change or the component unmounts.
    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearError, errorMessage]);

  // Keep the form open unless the hook reports that adding the admin succeeded.
  async function handleAddAdmin(
    input: NewAdminInput,
  ) {
    const added = await addAdmin(input);

    if (added) {
      setShowModal(false);
    }
  }

  // Ask for confirmation before forwarding a delete request to the hook.
  function handleDeleteAdmin(
    admin: Admin,
  ) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${admin.username}?`,
    );

    if (confirmed) {
      deleteAdmin(admin);
    }
  }

  return (
    <>
      {/* Surface the shared error message in an alert above the page content. */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed left-3 right-3 top-3 z-[70] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg sm:left-auto sm:right-5 sm:top-5 sm:max-w-sm"
        >
          {errorMessage}
        </div>
      )}

      <div className="w-full min-w-0 max-w-5xl">
        {/* Desktop column headings */}
        {/* Keep these column widths aligned with the desktop grid in AdminRow. */}
        <div className="hidden grid-cols-[1.4fr_2fr_1.2fr_1.3fr_40px] items-center gap-4 border-b border-gray-100 pb-4 md:grid">
          <div className="text-sm font-semibold text-gray-500">
            Username
          </div>

          <div className="text-sm font-semibold text-gray-500">
            Email (SSO)
          </div>

          <div className="text-sm font-semibold text-gray-500">
            Role
          </div>

          <div className="text-sm font-semibold text-gray-500">
            Invite users
          </div>

          {/* Reserve the final column for each row's action menu. */}
          <div aria-hidden="true" />
        </div>

        {/* Admin rows become cards on mobile. */}
        {/* Bind each row's callbacks to the corresponding administrator. */}
        <div className="space-y-3 md:space-y-0">
          {admins.map((admin) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              onRoleChange={(
                role: AdminRole,
              ) =>
                changeRole(
                  admin.id,
                  role,
                )
              }
              onToggleInvite={() =>
                toggleInvitePermission(
                  admin,
                )
              }
              onDelete={() =>
                handleDeleteAdmin(admin)
              }
            />
          ))}
        </div>

        {/* Open the creation modal without changing the current admin list. */}
        <button
          type="button"
          onClick={() =>
            setShowModal(true)
          }
          className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-[#dbb082] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c99a6e] sm:w-auto"
        >
          New User
          <span
            className="ml-2 text-base"
            aria-hidden="true"
          >
            +
          </span>
        </button>
      </div>

      {/*
       * Unmount the modal on close so its local form state resets when reopened.
       * Route modal errors through the same error state used by the table.
       */}
      {showModal && (
        <AddAdminModal
          onAdd={handleAddAdmin}
          onCancel={() =>
            setShowModal(false)
          }
          onError={setError}
        />
      )}
    </>
  );
}
