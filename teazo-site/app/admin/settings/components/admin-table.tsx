"use client";

import { useEffect, useState } from "react";

import type { Admin, AdminRole, NewAdminInput,} from "@/app/types/admin-perms";
import { OWNER_ROLE, READ_ROLE, WRITE_ROLE } from "@/app/types/admin-perms";
import { AddAdminModal } from "@/app/admin/settings/components/AddAdminModal";
import { AdminRow } from "@/app/admin/settings/components/AdminRow";
import { useAdmins } from "@/app/admin/settings/hooks/use-admins";

/* temporary data */
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

/* fully put together admin table code */
export default function AdminsTable() {
  const [showModal, setShowModal] = useState(false);
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
    if (!errorMessage) return;

    const timeout = window.setTimeout(clearError, 3500);
    return () => window.clearTimeout(timeout);
  }, [clearError, errorMessage]);

  /* create function to call addAdmin in the hoooks */
  const handleAddAdmin = (input: NewAdminInput) => {
    const added = addAdmin(input);
    if (added) setShowModal(false);
  };

  const handleDeleteAdmin = (admin: Admin) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${admin.username}?`
    );

    if (confirmed) deleteAdmin(admin);
  };

  return (
    <>
      {errorMessage && (
        <div
          role="alert"
          className="fixed right-5 top-5 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg"
        >
          {errorMessage}
        </div>
      )}

      <div className="w-full max-w-5xl">
        {/*top row */}
        <div className="grid grid-cols-[1.4fr_2fr_1.2fr_1.3fr_40px] items-center gap-4 border-b border-gray-100 pb-4">
          <div className="text-sm font-semibold text-gray-500">Username</div>
          <div className="text-sm font-semibold text-gray-500">Email (SSO)</div>
          <div className="text-sm font-semibold text-gray-500">Role</div>
          <div className="text-sm font-semibold text-gray-500">Invite users</div>
          <div aria-hidden="true" />
        </div>

        {/*mapping of all the admins */}
        <div>
          {admins.map((admin) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              onRoleChange={(role: AdminRole) =>
                changeRole(admin.id, role)
              }
              onToggleInvite={() => toggleInvitePermission(admin)}
              onDelete={() => handleDeleteAdmin(admin)}
            />
          ))}
        </div>

        {/*add user button*/}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-2 rounded-md bg-pink-300 px-5 py-2 text-xs font-semibold text-white transition hover:bg-pink-400"
        >
          New User <span className="ml-1 text-sm">+</span>
        </button>
      </div>

      {/*add user modal that gets the input and passes addAdmin function*/}
      {showModal && (
        <AddAdminModal
          onAdd={handleAddAdmin}
          onCancel={() => setShowModal(false)}
          onError={setError}
        />
      )}
    </>
  );
}
