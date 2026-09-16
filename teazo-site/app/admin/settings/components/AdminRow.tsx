import {
  ADMIN_ROLE_LABELS,
  OWNER_ROLE,
  WRITE_ROLE,
} from "@/app/types/admin-perms";
import type {
  Admin,
  AdminRole,
} from "@/app/types/admin-perms";
import { AdminActions } from "./AdminActions";
import { InviteSwitch } from "./InviteSwitch";
import { RoleDropdown } from "./RoleDropdown";

type AdminRowProps = {
  admin: Admin;
  onRoleChange: (
    role: AdminRole,
  ) => void;
  onToggleInvite: () => void;
  onDelete: () => void;
};

export function AdminRow({
  admin,
  onRoleChange,
  onToggleInvite,
  onDelete,
}: AdminRowProps) {
  const isOwner =
    admin.role === OWNER_ROLE;

  const canEditInvites =
    admin.role === WRITE_ROLE;

  return (
    <div className="group/row grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[1.4fr_2fr_1.2fr_1.3fr_40px] md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0 md:py-3 md:shadow-none">
      {/* Username */}
      <div className="min-w-0">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
          Username
        </span>

        <div
          className="break-words text-sm text-gray-500 transition-colors [overflow-wrap:anywhere] group-hover/row:text-pink-300"
          title={admin.username}
        >
          {admin.username}
        </div>
      </div>

      {/* Email */}
      <div className="min-w-0">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
          Email (SSO)
        </span>

        <div
          className="break-words text-sm text-gray-400 transition-colors [overflow-wrap:anywhere] group-hover/row:text-pink-300"
          title={admin.email}
        >
          {admin.email}
        </div>
      </div>

      {/* Role */}
      <div className="min-w-0">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
          Role
        </span>

        {isOwner ? (
          <span className="block text-sm text-gray-400 transition-colors group-hover/row:text-pink-300">
            {
              ADMIN_ROLE_LABELS[
                admin.role
              ]
            }
          </span>
        ) : (
          <RoleDropdown
            role={admin.role}
            onChange={onRoleChange}
          />
        )}
      </div>

      {/* Invite permission */}
      <div className="min-w-0">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
          Invite users
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <InviteSwitch
            checked={
              isOwner ||
              admin.canInviteUsers
            }
            locked={isOwner}
            unavailable={
              !isOwner &&
              !canEditInvites
            }
            onClick={onToggleInvite}
          />

          <span className="text-xs text-gray-400">
            {isOwner ||
            admin.canInviteUsers
              ? "On"
              : "Off"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div
        className={
          isOwner
            ? "hidden md:block"
            : "flex min-w-0 items-center justify-between gap-3 md:block"
        }
      >
        {!isOwner && (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
              Actions
            </span>

            <AdminActions
              username={admin.username}
              onDelete={onDelete}
            />
          </>
        )}
      </div>
    </div>
  );
}