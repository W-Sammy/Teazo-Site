"use client";

import {
  useEffect,
  useId,
  useState,
  type SubmitEvent,
} from "react";

import { adminButtonStyles } from "@/app/admin/components/admin-button-styles";
import type { Admin } from "@/app/types/admin-perms";
import { OWNER_ROLE } from "@/app/types/admin-perms";

type EditAccountModalProps = {
  admin: Admin;
  isSaving: boolean;
  errorMessage: string;
  onSave: (username: string) => void | Promise<void>;
  onCancel: () => void;
};

// Only the Owner can open this dialog through administrator management.
// The server must independently enforce Owner-only account editing.
export function EditAccountModal({
  admin,
  isSaving,
  errorMessage,
  onSave,
  onCancel,
}: EditAccountModalProps) {
  const [username, setUsername] = useState(admin.username);
  const [validationError, setValidationError] = useState("");

  const titleId = useId();
  const descriptionId = useId();
  const usernameId = useId();

  const normalizedUsername = username.trim();
  const originalUsername = admin.username.trim();

  const hasChanges = normalizedUsername !== originalUsername;
  const displayedError = validationError || errorMessage;

  // Prevent the dialog from closing while a save is in progress.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSaving, onCancel]);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    if (!normalizedUsername) {
      setValidationError("Username is required.");
      return;
    }

    if (!hasChanges) {
      return;
    }

    setValidationError("");
    void onSave(normalizedUsername);
  }

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-black/30 p-3 sm:p-4"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onCancel();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onSubmit={handleSubmit}
          className="relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close Edit Account form"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <div className="mb-6 pr-10">
            <h2
              id={titleId}
              className="text-lg font-semibold text-gray-700"
            >
              Edit Account
            </h2>

            <p
              id={descriptionId}
              className="mt-1 text-sm text-gray-400"
            >
              Update the administrator account&apos;s username.
            </p>

            {displayedError && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {displayedError}
              </p>
            )}
          </div>

          {/* Account role is displayed but cannot be changed. */}
          <div className="mb-4">
            <span className="block text-sm font-medium text-gray-600">
              Role
            </span>

            <p className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {admin.role === OWNER_ROLE ? "Owner" : "Admin"}
            </p>
          </div>

          {/* Owner-editable username */}
          <label
            htmlFor={usernameId}
            className="mb-4 block text-sm font-medium text-gray-600"
          >
            Username{" "}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>

            <input
              id={usernameId}
              name="editAdminUsername"
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setValidationError("");
              }}
              placeholder="Username"
              autoComplete="off"
              disabled={isSaving}
              aria-required="true"
              aria-invalid={Boolean(displayedError)}
              className="mt-2 w-full min-w-0 rounded-md border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-[#dbb082] disabled:bg-gray-50 disabled:opacity-70 sm:text-sm"
            />
          </label>

          {/* Email is intentionally read-only. */}
          <div className="mb-6">
            <span className="block text-sm font-medium text-gray-600">
              Email
            </span>

            <p className="mt-2 break-words rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {admin.email}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Email addresses cannot be changed here.
            </p>
          </div>

          {/* Preserve changes only when Save is explicitly selected. */}
          <div className="sticky bottom-0 -mx-1 grid grid-cols-2 gap-3 border-t border-gray-100 bg-white px-1 pb-1 pt-4 sm:static sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:px-0 sm:pb-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className={`${adminButtonStyles.secondary} w-full sm:w-auto`}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving || !hasChanges}
              className={`${adminButtonStyles.primary} w-full sm:w-auto`}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
