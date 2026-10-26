"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Admin,
  NewAdminInput,
} from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";
import { AddAdminModal } from "@/app/admin/settings/components/AddAdminModal";
import { AdminRow } from "@/app/admin/settings/components/AdminRow";
import DeleteAdminDialog from "@/app/admin/settings/components/delete-admin-dialog";
import { useAdmins } from "@/app/admin/settings/handlers/use-admins";
import { resendAdminInvitation } from "@/app/api/admin/settings/admins-api";

// Coordinate Owner/Admin sections, account actions, and feedback.
export default function AdminsTable() {
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [adminToDelete, setAdminToDelete] =
    useState<Admin | null>(null);
  const [resendingAdminId, setResendingAdminId] =
    useState<string | null>(null);
  const [invitationNotice, setInvitationNotice] =
    useState("");

  const resendInFlight = useRef(false);

  const {
    admins,
    canManageAdmins,
    errorMessage,
    clearError,
    setError,
    addAdmin,
    loadAdmins,
    deleteAdmin,
  } = useAdmins();

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  // Automatically clear operation errors after 3.5 seconds.
  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timeout = window.setTimeout(clearError, 3500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearError, errorMessage]);

  // Automatically clear success messages.
  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(
      () => setSuccessMessage(""),
      3500,
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [successMessage]);

  // Keep Owner separate from the regular Admin rows.
  const owner = admins.find(
    (admin) => admin.role === OWNER_ROLE,
  );

  const regularAdmins = admins.filter(
    (admin) => admin.role !== OWNER_ROLE,
  );

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

  function handleDeleteAdmin(admin: Admin) {
    if (!canManageAdmins || admin.role === OWNER_ROLE) {
      return;
    }

    setAdminToDelete(admin);
  }

  async function confirmDeleteAdmin() {
    if (!canManageAdmins || !adminToDelete) {
      return;
    }

    const deleted = await deleteAdmin(adminToDelete);

    if (deleted) {
      setAdminToDelete(null);
    }
  }

  async function handleResendInvitation(admin: Admin) {
    if (
      resendInFlight.current ||
      !canManageAdmins ||
      !admin.canResendInvitation
    ) {
      return;
    }

    resendInFlight.current = true;
    setResendingAdminId(admin.id);
    clearError();
    setSuccessMessage("");
    setInvitationNotice("");

    try {
      const result = await resendAdminInvitation(admin.id);

      setSuccessMessage(result.message);
      await loadAdmins();
    } catch (error) {
      // Refresh eligibility before displaying the operation error.
      await loadAdmins();

      setError(
        error instanceof Error
          ? error.message
          : "The invitation could not be resent.",
      );
    } finally {
      resendInFlight.current = false;
      setResendingAdminId(null);
    }
  }

  return (
    <>
      {/* Error feedback */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed left-3 right-3 top-3 z-[70] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg sm:left-auto sm:right-5 sm:top-5 sm:max-w-sm"
        >
          {errorMessage}
        </div>
      )}

      {/* Success feedback */}
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-3 top-3 z-[70] rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-lg sm:right-5 sm:top-5"
        >
          {successMessage}
        </div>
      )}

      {/* Invitation delivery notices */}
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

      {/* Owner section */}
      <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
        <h2 className="text-xl font-bold text-[#2b211d]">
          Owner
        </h2>

        <div className="w-full min-w-0 max-w-5xl">
          <div className="hidden items-center gap-4 border-b border-gray-100 pb-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_40px]">
            <div className="text-sm font-semibold text-gray-500">
              Username
            </div>

            <div className="text-sm font-semibold text-gray-500">
              Email
            </div>

            <div aria-hidden="true" />
          </div>

          {owner ? (
            <AdminRow
              key={owner.id}
              admin={owner}
              showActions={canManageAdmins}
              onResendInvitation={() => {
                void handleResendInvitation(owner);
              }}
              isResending={resendingAdminId === owner.id}
            />
          ) : (
            <p className="py-4 text-sm text-gray-500">
              No Owner account was found.
            </p>
          )}
        </div>
      </section>

      {/* Regular administrators section */}
      <section className="mt-10 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
        <h2 className="text-xl font-bold text-[#2b211d]">
          Admins
        </h2>

        <div className="w-full min-w-0 max-w-5xl">
          <div className="hidden items-center gap-4 border-b border-gray-100 pb-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_40px]">
            <div className="text-sm font-semibold text-gray-500">
              Username
            </div>

            <div className="text-sm font-semibold text-gray-500">
              Email
            </div>

            <div className="text-sm font-semibold text-gray-500">
              <span className="sr-only">Actions</span>
            </div>
          </div>

          {/* Administrator rows become cards on mobile. */}
          <div className="space-y-3 md:space-y-0">
            {regularAdmins.length > 0 ? (
              regularAdmins.map((admin) => (
                <AdminRow
                  key={admin.id}
                  admin={admin}
                  showActions={canManageAdmins}
                  onDelete={() => handleDeleteAdmin(admin)}
                  onResendInvitation={() => {
                    void handleResendInvitation(admin);
                  }}
                  isResending={resendingAdminId === admin.id}
                />
              ))
            ) : (
              <p className="py-4 text-sm text-gray-500">
                No administrators have been added.
              </p>
            )}
          </div>

          {/* Only the Owner can create administrator accounts. */}
          {canManageAdmins && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 sm:w-auto"
            >
              New User
              <span
                className="ml-2 text-base"
                aria-hidden="true"
              >
                +
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Only the Owner can access the Add New User modal. */}
      {canManageAdmins && showModal && (
        <AddAdminModal
          onAdd={handleAddAdmin}
          onCancel={() => {
            setModalError("");
            setShowModal(false);
          }}
          errorMessage={modalError}
        />
      )}

      {/* Preserve the existing confirmation dialog. */}
      <DeleteAdminDialog
        admin={canManageAdmins ? adminToDelete : null}
        onCancel={() => setAdminToDelete(null)}
        onConfirm={confirmDeleteAdmin}
      />
    </>
  );
}