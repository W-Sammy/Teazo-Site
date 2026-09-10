import { ADMIN_ROLE_LABELS, OWNER_ROLE, WRITE_ROLE, READ_ROLE } from "@/app/types/admin-perms";
import type { AdminRole } from "@/app/types/admin-perms";
import { useState } from "react";

export function RoleDropdown({
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
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-32 overflow-visible rounded-md border border-gray-100 bg-white shadow-lg">
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