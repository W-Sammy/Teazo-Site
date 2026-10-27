"use client";

import {
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from "react";
import type { NewAdminInput } from "@/app/types/admin-perms";

type AddAdminModalProps = {
  onAdd: (input: NewAdminInput) => void | Promise<void>;
  onCancel: () => void;
  errorMessage: string;
};

// New accounts are automatically assigned the Admin role by the server.
export function AddAdminModal({
  onAdd,
  onCancel,
  errorMessage,
}: AddAdminModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    onAdd({
      username,
      email,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-black/30 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-admin-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center">
        <form
          onSubmit={handleSubmit}
          className="relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <button
            type="button"
            onClick={onCancel}
            className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close Add New User form"
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
              id="add-admin-title"
              className="text-lg font-semibold text-gray-700"
            >
              Add New User
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Add an administrator to your website.
            </p>

            {errorMessage && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {errorMessage}
              </p>
            )}
          </div>

          {/* Username */}
          <label
            className="mb-4 block text-sm font-medium text-gray-600"
            htmlFor="new-admin-username"
          >
            Username <span className="text-red-600" aria-hidden="true">*</span>

            <input
              id="new-admin-username"
              name="newAdminUsername"
              type="text"
              value={username}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) => setUsername(event.target.value)}
              placeholder="Username"
              autoComplete="username"
              className="mt-2 w-full min-w-0 rounded-md border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-[#dbb082] sm:text-sm"
            />
          </label>

          {/* Email */}
          <label
            className="mb-6 block text-sm font-medium text-gray-600"
            htmlFor="new-admin-email"
          >
            Email <span className="text-red-600" aria-hidden="true">*</span>

            <input
              id="new-admin-email"
              name="newAdminEmail"
              type="email"
              value={email}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) => setEmail(event.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              className="mt-2 w-full min-w-0 rounded-md border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-[#dbb082] sm:text-sm"
            />
          </label>

          {/* Preserve the existing Cancel and Add User controls. */}
          <div className="sticky bottom-0 -mx-1 grid grid-cols-2 gap-3 border-t border-gray-100 bg-white px-1 pb-1 pt-4 sm:static sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:px-0 sm:pb-0">
            <button
              type="button"
              onClick={onCancel}
              className="w-full cursor-pointer rounded-md px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 sm:w-auto"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="w-full cursor-pointer rounded-md bg-[#dbb082] px-5 py-2 text-sm font-semibold text-white hover:bg-[#c99a6e] sm:w-auto"
            >
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
