import { ADMIN_ROLE_LABELS } from "@/app/types/admin-perms";
import type { Admin, AdminRole } from "@/app/types/admin-perms";
import { OWNER_ROLE, WRITE_ROLE } from "../roles";
import { AdminActions } from "./AdminActions";
import { InviteSwitch } from "./InviteSwitch";
import { RoleDropdown } from "./RoleDropdown";

export function AdminRow({
  admin,
  onRoleChange,
  onToggleInvite,
  onDelete,
}: {
  admin: Admin;
  onRoleChange: (role: AdminRole) => void;
  onToggleInvite: () => void;
  onDelete: () => void;
}) {
  const isOwner = admin.role === OWNER_ROLE;
  const canEditInvites = admin.role === WRITE_ROLE;

  return (
    <div className="group/row grid grid-cols-[1.4fr_2fr_1.2fr_1.3fr_40px] items-center gap-4 py-3">
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
          <RoleDropdown role={admin.role} onChange={onRoleChange} />
        )}
      </div>

      <div className="flex items-center gap-2">
        <InviteSwitch
          checked={isOwner || admin.canInviteUsers}
          locked={isOwner}
          unavailable={!isOwner && !canEditInvites}
          onClick={onToggleInvite}
        />
        <span className="text-xs text-gray-400">
          {isOwner || admin.canInviteUsers ? "On" : "Off"}
        </span>
      </div>

      <div>
        {!isOwner && (
          <AdminActions username={admin.username} onDelete={onDelete} />
        )}
      </div>
    </div>
  );
}
