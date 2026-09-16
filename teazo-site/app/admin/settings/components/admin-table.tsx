"use client";

import {
  useEffect,
  useState,
} from "react";

import type {
  Admin,
  AdminRole,
  NewAdminInput,
} from "@/app/types/admin-perms";
import {
  OWNER_ROLE,
  READ_ROLE,
  WRITE_ROLE,
} from "@/app/types/admin-perms";
import { AddAdminModal } from "@/app/admin/settings/components/AddAdminModal";
import { AdminRow } from "@/app/admin/settings/components/AdminRow";
import { useAdmins } from "@/app/admin/settings/handlers/use-admins";

/* Temporary front-end data. */
const initialAdmins: Admin[] = [
  {
    id: 1,
    username: "You",
    email: "temp@teazo.com",
    role: OWNER_ROLE,
    canInviteUsers: true,
  },
  {
    id: 2,
    username: "Person1",
    email: "Person1@teazo.com",
    role: WRITE_ROLE,
    canInviteUsers: false,
  },
  {
    id: 3,
    username: "Person2",
    email: "Person2@teazo.com",
    role: READ_ROLE,
    canInviteUsers: false,
  },
];

export default function AdminsTable() {
  const [showModal, setShowModal] =
    useState(false);

  const {
    admins,
    errorMessage,
    clearError,
    setError,
    addAdmin,
    deleteAdmin,
    changeRole,
    toggleInvitePermission,
  } = useAdmins(initialAdmins);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timeout = window.setTimeout(
      clearError,
      3500,
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearError, errorMessage]);

  function handleAddAdmin(
    input: NewAdminInput,
  ) {
    const added = addAdmin(input);

    if (added) {
      setShowModal(false);
    }
  }

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

          <div aria-hidden="true" />
        </div>

        {/* Admin rows become cards on mobile. */}
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

        <button
          type="button"
          onClick={() =>
            setShowModal(true)
          }
          className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-pink-300 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-400 sm:w-auto"
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