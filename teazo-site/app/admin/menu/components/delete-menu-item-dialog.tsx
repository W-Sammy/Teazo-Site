"use client";

import {
  useEffect,
  useId,
  useRef,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type DeleteMenuItemDialogProps = {
  itemName: string;
  onCancel: () => void;
  onConfirm: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};

export default function DeleteMenuItemDialog({
  itemName,
  onCancel,
  onConfirm,
  fallbackFocusRef,
}: DeleteMenuItemDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmed = useRef(false);

  const titleId = useId();
  const descriptionId = useId();

  // The parent mounts this component only while an item awaits confirmation.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // A native modal sits above the navigation and makes the background inert.
    dialog.showModal();
    cancelButtonRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog.open) {
        dialog.close();
      }

      // A deleted item's button no longer exists. Fall back to the search field.
      const focusTarget = previousFocus?.isConnected
        ? previousFocus
        : fallbackFocusRef?.current;

      focusTarget?.focus({ preventScroll: true });
    };
  }, [fallbackFocusRef]);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[#dbb082]/60 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/40 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        // Cancel only when the backdrop is clicked, not the dialog's padding.
        const bounds = event.currentTarget.getBoundingClientRect();

        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;

        if (outside) {
          onCancel();
        }
      }}
    >
      <h2
        id={titleId}
        className="pr-10 text-lg font-semibold"
      >
        Delete menu item?
      </h2>

      <button
        type="button"
        onClick={onCancel}
        aria-label="Close delete confirmation"
        className="absolute right-2 top-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>

      <div
        id={descriptionId}
        className="mt-3 text-sm text-gray-600"
      >
        <p className="[overflow-wrap:anywhere]">
          Are you sure you want to delete <strong>{itemName}</strong>?
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => {
            if (!confirmed.current) {
              confirmed.current = true;
              onConfirm();
            }
          }}
          className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Delete
        </button>
      </div>
    </dialog>,
    document.body,
  );
}