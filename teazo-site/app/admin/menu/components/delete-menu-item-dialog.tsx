"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type DeleteMenuItemDialogProps = {
  itemName: string;
  onCancel: () => void;

  // The parent removes the row/closes the dialog only after confirmed deletion.
  onConfirm: () => Promise<string | null>;

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
  const pendingRef = useRef(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    if (!dialog.open) {
      dialog.showModal();
    }

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

  function handleCancel() {
    // Use the ref as well as disabled buttons to block immediate repeated input.
    if (!pendingRef.current) {
      onCancel();
    }
  }

  async function handleConfirm() {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const errorMessage = await onConfirm();

      if (errorMessage) {
        setDeleteError(errorMessage);
      }
    } catch {
      setDeleteError(
        "The deletion could not be confirmed. Reload the menu and check the item before trying again.",
      );
    } finally {
      // Failed requests must not leave the Delete button permanently locked.
      pendingRef.current = false;
      setIsDeleting(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[#dbb082]/60 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/40 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        handleCancel();
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
          handleCancel();
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
        onClick={handleCancel}
        disabled={isDeleting}
        aria-label="Close delete confirmation"
        className="absolute right-2 top-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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

        <p className="mt-2">
          This deletes the item and its variations from Square and removes it
          from the menu. This action cannot be undone from this page.
        </p>
      </div>

      {deleteError && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]"
        >
          {deleteError}
        </p>
      )}

      {isDeleting && (
        <p
          role="status"
          className="mt-4 text-sm text-gray-600"
        >
          Deleting the item from Square. Please keep this page open.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={handleCancel}
          disabled={isDeleting}
          className="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isDeleting}
          className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}