import type { Admin } from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";
import { AdminActions } from "./AdminActions";

type AdminRowProps = {
  admin: Admin;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onResendInvitation?: () => void;
  onTransferOwnership?: () => void;
  isResending?: boolean;
  isTransferring?: boolean;
};

// Display an administrator without role or permission selectors.
export function AdminRow({
  admin,
  showActions = false,
  onEdit,
  onDelete,
  onResendInvitation,
  onTransferOwnership,
  isResending = false,
  isTransferring = false,
}: AdminRowProps) {
  const isOwner = admin.role === OWNER_ROLE;

  // The current Owner may edit their own account and regular Admin accounts.
  // The parent supplies this action only when administrator management is allowed.
  const canEdit =
    showActions &&
    typeof onEdit === "function";

  const canDelete =
    showActions &&
    !isOwner &&
    typeof onDelete === "function";

  const canResend =
    showActions &&
    admin.canResendInvitation &&
    typeof onResendInvitation === "function";

  // The server determines ownership-transfer eligibility.
  // Pending invitations and other ineligible accounts
  // must not display the transfer action.
  const canTransfer =
    showActions &&
    !isOwner &&
    admin.canReceiveOwnership &&
    typeof onTransferOwnership === "function";

  const hasActions =
    canEdit || canDelete || canResend || canTransfer;

  return (
    <div className="group/row grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_40px] md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0 md:py-3 md:shadow-none">
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
          Email
        </span>

        <div
          className="break-words text-sm text-gray-400 transition-colors [overflow-wrap:anywhere] group-hover/row:text-[#b98555]"
          title={admin.email}
        >
          {admin.email}
        </div>
      </div>

      {/* Owner-only administrator actions */}
      <div
        className={
          hasActions
            ? "flex min-w-0 items-center justify-between gap-3 md:block"
            : "hidden md:block"
        }
      >
        {hasActions && (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
              Actions
            </span>

            <AdminActions
              username={admin.username}
              onEdit={
                canEdit ? onEdit : undefined
              }
              onDelete={
                canDelete ? onDelete : undefined
              }
              onResendInvitation={
                canResend ? onResendInvitation : undefined
              }
              onTransferOwnership={
                canTransfer ? onTransferOwnership : undefined
              }
              isResending={isResending}
              isTransferring={isTransferring}
            />
          </>
        )}
      </div>
    </div>
  );
}
