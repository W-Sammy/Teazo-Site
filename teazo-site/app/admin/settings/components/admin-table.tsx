"use client";

import { useEffect, useState } from "react";

import {
  Admin,
  AdminRole,
  ADMIN_ROLE_LABELS,
} from "@/app/types/admin-perms";

const OWNER_ROLE: AdminRole = 1;
const WRITE_ROLE: AdminRole = 2;
const READ_ROLE: AdminRole = 3;

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
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [showModal, setShowModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>(READ_ROLE);
  const [newCanInvite, setNewCanInvite] = useState(false);

  useEffect(() => {
    if (!errorMessage) return;

    const timeout = window.setTimeout(() => {
      setErrorMessage("");
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  const changeRole = (id: number, role: AdminRole) => {
    setAdmins((currentAdmins) =>
      currentAdmins.map((admin) => {
        if (admin.id !== id || admin.role === OWNER_ROLE) {
          return admin;
        }

        return {
          ...admin,
          role,
          // Read-only users cannot retain invitation permission.
          canInviteUsers:
            role === WRITE_ROLE ? admin.canInviteUsers : false,
        };
      })
    );
  };

  const toggleInvitePermission = (admin: Admin) => {
    if (admin.role === OWNER_ROLE) {
      return;
    }

    if (admin.role !== WRITE_ROLE) {
      setErrorMessage(
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
      setErrorMessage("The owner cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${admin.username}?`
    );

    if (!confirmed) return;

    setAdmins((currentAdmins) =>
      currentAdmins.filter(
        (currentAdmin) => currentAdmin.id !== admin.id
      )
    );
  };

  const addAdmin = () => {
    if (!newUsername.trim() || !newEmail.trim()) {
      setErrorMessage("Please enter both a username and email.");
      return;
    }

    const newAdmin: Admin = {
      id: Date.now(),
      username: newUsername.trim(),
      email: newEmail.trim(),
      role: newRole,
      canInviteUsers:
        newRole === WRITE_ROLE ? newCanInvite : false,
    };

    setAdmins((currentAdmins) => [...currentAdmins, newAdmin]);

    setNewUsername("");
    setNewEmail("");
    setNewRole(READ_ROLE);
    setNewCanInvite(false);
    setShowModal(false);
  };

  return (
    <>
      {/* Error toast */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed right-5 top-5 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg"
        >
          {errorMessage}
        </div>
      )}

      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="grid grid-cols-[1.4fr_2fr_1.2fr_1.3fr_40px] items-center gap-4 border-b border-gray-100 pb-4">
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

        {/* Admins */}
        <div>
          {admins.map((admin) => {
            const isOwner = admin.role === OWNER_ROLE;
            const canEditInvites = admin.role === WRITE_ROLE;

            return (
              <div
                key={admin.id}
                className="group/row grid grid-cols-[1.4fr_2fr_1.2fr_1.3fr_40px] items-center gap-4 py-3"
              >
                <div className="truncate text-sm text-gray-500 transition-colors group-hover/row:text-pink-300">
                  {admin.username}
                </div>

                <div
                  className="truncate text-sm text-gray-400 transition-colors group-hover/row:text-pink-300"
                  title={admin.email}
                >
                  {admin.email}
                </div>

                <div>
                  {isOwner ? (
                    <span className="text-sm text-gray-400 transition-colors group-hover/row:text-pink-300">
                      {ADMIN_ROLE_LABELS[admin.role]}
                    </span>
                  ) : (
                    <RoleDropdown
                      role={admin.role}
                      onChange={(role) => changeRole(admin.id, role)}
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <InviteSwitch
                    checked={isOwner || admin.canInviteUsers}
                    locked={isOwner}
                    unavailable={!isOwner && !canEditInvites}
                    onClick={() => toggleInvitePermission(admin)}
                  />

                  <span className="text-xs text-gray-400">
                    {isOwner || admin.canInviteUsers ? "On" : "Off"}
                  </span>
                </div>

                <div>
                  {!isOwner && (
                    <AdminActions
                      username={admin.username}
                      onDelete={() => deleteAdmin(admin)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-2 rounded-md bg-pink-300 px-5 py-2 text-xs font-semibold text-white transition hover:bg-pink-400"
        >
          New User <span className="ml-1 text-sm">+</span>
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowModal(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700">
                Add New User
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Add an administrator to your website.
              </p>
            </div>

            <div className="mb-4">
              <label
                htmlFor="new-admin-username"
                className="mb-2 block text-sm font-medium text-gray-600"
              >
                Username
              </label>

              <input
                id="new-admin-username"
                type="text"
                value={newUsername}
                onChange={(event) =>
                  setNewUsername(event.target.value)
                }
                placeholder="Username"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-pink-300"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="new-admin-email"
                className="mb-2 block text-sm font-medium text-gray-600"
              >
                Email
              </label>

              <input
                id="new-admin-email"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-pink-300"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="new-admin-role"
                className="mb-2 block text-sm font-medium text-gray-600"
              >
                Role
              </label>

              <select
                id="new-admin-role"
                value={newRole}
                onChange={(event) => {
                  const role = Number(
                    event.target.value
                  ) as AdminRole;

                  setNewRole(role);

                  if (role !== WRITE_ROLE) {
                    setNewCanInvite(false);
                  }
                }}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 outline-none focus:border-pink-300"
              >
                <option value={READ_ROLE}>
                  {ADMIN_ROLE_LABELS[READ_ROLE]}
                </option>

                <option value={WRITE_ROLE}>
                  {ADMIN_ROLE_LABELS[WRITE_ROLE]}
                </option>
              </select>
            </div>

            <div className="mb-6 flex items-center justify-between rounded-md border border-gray-100 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Allow user invitations
                </p>

                <p className="mt-0.5 text-xs text-gray-400">
                  Requires Write access.
                </p>
              </div>

              <InviteSwitch
                checked={newCanInvite}
                unavailable={newRole !== WRITE_ROLE}
                onClick={() => {
                  if (newRole !== WRITE_ROLE) {
                    setErrorMessage(
                      "Select Write access before enabling invitations."
                    );
                    return;
                  }

                  setNewCanInvite((current) => !current);
                }}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-400 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={addAdmin}
                className="rounded-md bg-pink-300 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-400"
              >
                Add User
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InviteSwitch({
  checked,
  locked = false,
  unavailable = false,
  onClick,
}: {
  checked: boolean;
  locked?: boolean;
  unavailable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Allow user invitations"
      aria-disabled={locked || unavailable}
      onClick={onClick}
      className={`relative h-5 w-9 flex-none overflow-hidden rounded-full p-0 transition-colors ${
        checked ? "bg-pink-300" : "bg-gray-200"
      } ${
        locked
          ? "cursor-not-allowed opacity-70"
          : unavailable
            ? "cursor-not-allowed opacity-50"
            : ""
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function AdminActions({
  username,
  onDelete,
}: {
  username: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Actions for ${username}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-md px-2 py-1 text-lg leading-none text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-28 overflow-hidden rounded-md border border-gray-100 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function RoleDropdown({
  role,
  onChange,
}: {
  role: AdminRole;
  onChange: (role: AdminRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const roles: AdminRole[] = [WRITE_ROLE, READ_ROLE];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-2 text-sm transition-colors group-hover/row:text-pink-300 ${
          open ? "text-pink-300" : "text-gray-400"
        }`}
      >
        {ADMIN_ROLE_LABELS[role]}

        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-32 overflow-hidden rounded-md border border-gray-100 bg-white shadow-lg">
          {roles.map((roleOption) => (
            <button
              key={roleOption}
              type="button"
              onClick={() => {
                onChange(roleOption);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
            >
              {ADMIN_ROLE_LABELS[roleOption]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}