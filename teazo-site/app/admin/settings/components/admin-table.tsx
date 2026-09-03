"use client";

import { useState } from "react";

import {
  Admin,
  AdminRole,
  ADMIN_ROLE_LABELS,
} from "@/app/types/admin-perms";

const initialAdmins: Admin[] = [
  {
    id: 1,
    username: "You",
    email: "temp@teazo.com",
    role: 1,
  },
  {
    id: 2,
    username: "Person1",
    email: "Person1@teazo.com",
    role: 2,
  },
  {
    id: 3,
    username: "Person2",
    email: "Person2@teazo.com",
    role: 3,
  },
];

export default function AdminsTable() {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [showModal, setShowModal] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>(3);

  const changeRole = (id: number, role: AdminRole) => {
    setAdmins((currentAdmins) =>
      currentAdmins.map((admin) =>
        admin.id === id ? { ...admin, role } : admin
      )
    );
  };

  const addAdmin = () => {
    if (!newUsername.trim() || !newEmail.trim()) {
      return;
    }

    const newAdmin: Admin = {
      id: Date.now(),
      username: newUsername.trim(),
      email: newEmail.trim(),
      role: newRole,
    };

    setAdmins((currentAdmins) => [...currentAdmins, newAdmin]);

    setNewUsername("");
    setNewEmail("");
    setNewRole(3);
    setShowModal(false);
  };

  return (
    <>
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="grid grid-cols-[1.5fr_2fr_1.5fr] items-center border-b border-gray-100 pb-4">
          <div className="text-sm font-semibold text-gray-500">
            Username
          </div>

          <div className="text-sm font-semibold text-gray-500">
            Email (SSO)
          </div>

          <div className="text-sm font-semibold text-gray-500">
            Role
          </div>
        </div>

        {/* Admins */}
        <div>
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="grid grid-cols-[1.5fr_2fr_1.5fr] items-center py-3"
            >
              {/* Username */}
              <div className="text-sm text-gray-500">
                {admin.username}
              </div>

              {/* Email */}
              <div
                className={`text-sm ${
                  admin.username === "Person1"
                    ? "text-pink-300"
                    : "text-gray-400"
                }`}
              >
                {admin.email}
              </div>

              {/* Role */}
              <div>
                {admin.role === 1 ? (
                  <span className="text-sm text-gray-400">
                    {ADMIN_ROLE_LABELS[admin.role]}
                  </span>
                ) : (
                  <RoleDropdown
                    role={admin.role}
                    onChange={(role) => changeRole(admin.id, role)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add User */}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700">
                Add New User
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Add an administrator to your website.
              </p>
            </div>

            {/* Username */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-600">
                Username
              </label>

              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-pink-300"
              />
            </div>

            {/* Email */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-600">
                Email
              </label>

              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-pink-300"
              />
            </div>

            {/* Role */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-600">
                Role
              </label>

              <select
                value={newRole}
                onChange={(e) =>
                  setNewRole(Number(e.target.value) as AdminRole)
                }
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 outline-none focus:border-pink-300"
              >
                <option value={3}>{ADMIN_ROLE_LABELS[3]}</option>
                <option value={2}>{ADMIN_ROLE_LABELS[2]}</option>
              </select>
            </div>

            {/* Buttons */}
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

/* -----------------------------
   Role Dropdown
----------------------------- */

function RoleDropdown({
  role,
  onChange,
}: {
  role: AdminRole;
  onChange: (role: AdminRole) => void;
}) {
  const [open, setOpen] = useState(false);

  const roles: AdminRole[] = [2, 3];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-400"
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
