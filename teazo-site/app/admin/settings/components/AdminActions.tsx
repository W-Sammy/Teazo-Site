"use client";

import { useEffect, useRef, useState } from "react";

type AdminActionsProps = {
  username: string;
  onDelete?: () => void;
  onResendInvitation?: () => void;
  onTransferOwnership?: () => void;
  isResending?: boolean;
  isTransferring?: boolean;
};

// Three-dot action menu for an individual administrator.
export function AdminActions({
  username,
  onDelete,
  onResendInvitation,
  onTransferOwnership,
  isResending = false,
  isTransferring = false,
}: AdminActionsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isBusy = isResending || isTransferring;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${username}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isBusy}
        aria-busy={isBusy}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:cursor-wait disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="currentColor"
        >
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${username}`}
          className="absolute right-0 top-full z-40 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-md border border-gray-100 bg-white shadow-lg"
        >
          {onResendInvitation && (
            <button
              type="button"
              role="menuitem"
              disabled={isBusy}
              onClick={() => {
                setOpen(false);
                onResendInvitation();
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Resend Invitation
            </button>
          )}

          {onTransferOwnership && (
            <button
              type="button"
              role="menuitem"
              disabled={isBusy}
              onClick={() => {
                setOpen(false);
                onTransferOwnership();
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Transfer Ownership
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              role="menuitem"
              disabled={isBusy}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
