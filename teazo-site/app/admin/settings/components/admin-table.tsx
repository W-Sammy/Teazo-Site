"use client";

import {
  useEffect,
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

// Coordinate Owner/Admin sections, creation, deletion, and feedback.
export default function AdminsTable() {
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [adminToDelete, setAdminToDelete] =
    useState<Admin | null>(null);

  const {
    admins,
    canManageAdmins,
    errorMessage,
    clearError,
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

  // The database allows only one non-deleted Owner.
  const owner = admins.find(
    (admin) => admin.role === OWNER_ROLE,
  );

  // The migration will convert all remaining role-3 accounts
  // to Admin. Until then, keep legacy rows visible in Settings.
  const regularAdmins = admins.filter(
    (admin) => admin.role !== OWNER_ROLE,
  );

  async function handleAddAdmin(input: NewAdminInput) {
    const result = await addAdmin(input);

    if (result.success) {
      setModalError("");
      setShowModal(false);
      setSuccessMessage("Invitation added successfully.");
    } else {
      setModalError(result.error);
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
