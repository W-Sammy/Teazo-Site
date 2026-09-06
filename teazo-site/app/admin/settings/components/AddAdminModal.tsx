import { useState } from "react";

import { ADMIN_ROLE_LABELS } from "@/app/types/admin-perms";
import type { AdminRole } from "@/app/types/admin-perms";
import type { NewAdminInput } from "../admin-types";
import { READ_ROLE, WRITE_ROLE } from "../roles";
import { InviteSwitch } from "./InviteSwitch";

export function AddAdminModal({
  onAdd,
  onCancel,
  onError,
}: {
  onAdd: (input: NewAdminInput) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>(READ_ROLE);
  const [canInviteUsers, setCanInviteUsers] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700">Add New User</h2>
          <p className="mt-1 text-sm text-gray-400">
            Add an administrator to your website.
          </p>
        </div>

        <label className="mb-4 block text-sm font-medium text-gray-600">
          Username
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-pink-300"
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-gray-600">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-pink-300"
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-gray-600">
          Role
          <select
            value={role}
            onChange={(event) => {
              const nextRole = Number(event.target.value) as AdminRole;
              setRole(nextRole);
              if (nextRole !== WRITE_ROLE) setCanInviteUsers(false);
            }}
            className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 outline-none focus:border-pink-300"
          >
            <option value={READ_ROLE}>{ADMIN_ROLE_LABELS[READ_ROLE]}</option>
            <option value={WRITE_ROLE}>{ADMIN_ROLE_LABELS[WRITE_ROLE]}</option>
          </select>
        </label>

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
            checked={canInviteUsers}
            unavailable={role !== WRITE_ROLE}
            onClick={() => {
              if (role !== WRITE_ROLE) {
                onError("Select Write access before enabling invitations.");
                return;
              }
              setCanInviteUsers((current) => !current);
            }}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm text-gray-400 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onAdd({ username, email, role, canInviteUsers })}
            className="rounded-md bg-pink-300 px-5 py-2 text-sm font-semibold text-white hover:bg-pink-400"
          >
            Add User
          </button>
        </div>
      </div>
    </div>
  );
}
