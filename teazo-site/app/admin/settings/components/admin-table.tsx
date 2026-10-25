"use client";

import {
  useEffect,
  useState,
  useRef,
} from "react";

import type { Admin, AdminRole, NewAdminInput } from "@/app/types/admin-perms";
import { AddAdminModal } from "@/app/admin/settings/components/AddAdminModal";
import { AdminRow } from "@/app/admin/settings/components/AdminRow";
import DeleteAdminDialog from "@/app/admin/settings/components/delete-admin-dialog";
import { useAdmins } from "@/app/admin/settings/handlers/use-admins";
import { resendAdminInvitation } from "@/app/api/admin/settings/admins-api";

// Coordinate the admin rows, add-user modal, deletion confirmation, and error alert.
export default function AdminsTable() {
  // Mount the Add New User modal only while it is needed.
  const [showModal, setShowModal] =
    useState(false);
  const [modalError, setModalError] =
    useState("");
  const [successMessage, setSuccessMessage] =
    useState("");
  const [adminToDelete, setAdminToDelete] =
    useState<Admin | null>(null);
  const [resendingAdminId, setResendingAdminId] =
    useState<string | null>(null);
  const [invitationNotice, setInvitationNotice] =
    useState("");

const resendInFlight = useRef(false);
  // Delegate admin data, error state, and update operations to the shared hook.
  const {
    admins,
    canEdit,
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

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(
      () => setSuccessMessage(""),
      3500,
    );

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  // Keep the form open unless the hook reports that adding the admin succeeded.
  async function handleAddAdmin(input: NewAdminInput) {
    clearError();
    setSuccessMessage("");
    setInvitationNotice("");

    const result = await addAdmin(input);

    if (!result.success) {
      setModalError(result.error);
      return;
    }

    setModalError("");
    setShowModal(false);

    if (result.invitation.submitted) {
      setSuccessMessage(result.invitation.message);
    } else {
      setInvitationNotice(result.invitation.message);
    }
  }

  // Open the shared-style confirmation dialog before forwarding a delete request.
  function handleDeleteAdmin(
    admin: Admin,
  ) {
    setAdminToDelete(admin);
  }

  async function confirmDeleteAdmin() {
    if (!adminToDelete) return;

    const deleted = await deleteAdmin(adminToDelete);
    if (deleted) setAdminToDelete(null);
  }

  async function handleResendInvitation(admin: Admin) {
    if (
      resendInFlight.current ||
      !canEdit ||
      !admin.canResendInvitation
    ) {
      return;
    }

    resendInFlight.current = true;
    setResendingAdminId(admin.id);
    clearError();
    setSuccessMessage("");

    try {
      const result = await resendAdminInvitation(admin.id);

      setInvitationNotice("");
      setSuccessMessage(result.message);
      await loadAdmins();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The invitation could not be resent.",
      );

      await loadAdmins();
    } finally {
      resendInFlight.current = false;
      setResendingAdminId(null);
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

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-3 top-3 z-[70] rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-lg sm:right-5 sm:top-5"
        >
          {successMessage}
        </div>
      )}

      <div className="w-full min-w-0 max-w-5xl">
        {invitationNotice && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p>{invitationNotice}</p>

            <button
              type="button"
              onClick={() => setInvitationNotice("")}
              className="mt-2 cursor-pointer font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}
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
            Manage Admins
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
              canEdit={canEdit}
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
              onResendInvitation={() => {
                void handleResendInvitation(admin);
              }}
              isResending={resendingAdminId === admin.id}
            />
          ))}
        </div>

        {/* Open the creation modal without changing the current admin list. */}
        {canEdit && <button
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
        </button>}
      </div>

      {/*
       * Unmount the modal on close so its local form state resets when reopened.
       * Route modal errors through the same error state used by the table.
       */}
      {showModal && (
        <AddAdminModal
          onAdd={handleAddAdmin}
          onCancel={() => {
            setModalError("");
            setShowModal(false);
          }}
          onError={setModalError}
          errorMessage={modalError}
        />
      )}

      <DeleteAdminDialog
        admin={adminToDelete}
        onCancel={() => setAdminToDelete(null)}
        onConfirm={confirmDeleteAdmin}
      />
    </>
  );
}
