"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ADMIN_ROLE_LABELS,
  READ_ROLE,
  WRITE_ROLE,
} from "@/app/types/admin-perms";
import type { AdminRole } from "@/app/types/admin-perms";

type RoleDropdownProps = {
  role: AdminRole;
  onChange: (
    role: AdminRole,
  ) => void;
};

const roles: AdminRole[] = [
  WRITE_ROLE,
  READ_ROLE,
];

export function RoleDropdown({
  role,
  onChange,
}: RoleDropdownProps) {
  const [open, setOpen] =
    useState(false);

  const containerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(
      event: PointerEvent,
    ) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(
          event.target,
        )
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative w-full md:inline-block md:w-auto"
    >
      <button
        type="button"
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm transition-colors md:w-auto md:justify-start md:border-0 md:bg-transparent md:p-0 ${
          open
            ? "text-pink-400"
            : "text-gray-500"
        } group-hover/row:text-pink-300`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>
          {ADMIN_ROLE_LABELS[role]}
        </span>

        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-40 mt-2 min-w-40 overflow-visible rounded-md border border-gray-100 bg-white shadow-lg md:right-auto md:w-32"
        >
          {roles.map(
            (roleOption) => (
              <button
                key={roleOption}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(
                    roleOption,
                  );

                  setOpen(false);
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                {
                  ADMIN_ROLE_LABELS[
                    roleOption
                  ]
                }
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}