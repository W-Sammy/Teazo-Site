import type { Admin } from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";
import { AdminActions } from "./AdminActions";

type AdminRowProps = {
  admin: Admin;
  showActions?: boolean;
  onDelete?: () => void;
};

// Display one administrator without role or permission selectors.
export function AdminRow({
  admin,
  showActions = false,
  onDelete,
}: AdminRowProps) {
  const isOwner = admin.role === OWNER_ROLE;
  const canDelete =
    showActions && !isOwner && typeof onDelete === "function";

  return (
    <div
      className={`group/row grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0 md:py-3 md:shadow-none ${
        showActions
          ? "md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_40px]"
          : "md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]"
      }`}
    >
      {/* Username */}
      <div className="min-w-0">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
          Username
        </span>

        <div
          className="break-words text-sm text-gray-500 transition-colors [overflow-wrap:anywhere] group-hover/row:text-[#b98555]"
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
          className="break-words text-sm text-gray-400 transition-colors [overflow-wrap:anywhere] group-hover/row:text-[#b98555]"
          title={admin.email}
        >
          {admin.email}
        </div>
      </div>

      {/* Owner-only administrator deletion controls */}
      {showActions && (
        <div className="flex min-w-0 items-center justify-between gap-3 md:block">
          {canDelete && (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
                Actions
              </span>

              <AdminActions
                username={admin.username}
                onDelete={() => onDelete?.()}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
