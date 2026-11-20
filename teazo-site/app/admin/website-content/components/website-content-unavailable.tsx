"use client";

import Link from "next/link";

export default function WebsiteContentUnavailable({
  message = "Current website content could not be loaded from storage. Editing is disabled until connection is restored.",
}: {
  message?: string;
}) {
  return (
    <div className="w-full min-w-0 px-3 pb-16 pt-6 sm:px-5 sm:pt-10">
      <div className="mb-5 sm:mb-7">
        <h1 className="break-words text-2xl font-semibold leading-tight text-[#2b211d] sm:text-[26px]">
          Website Content
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          Manage live storefront settings, store hours, and links.
        </p>
      </div>

      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:p-8 text-[#2b211d] shadow-sm"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-amber-900">
              Content Storage Unavailable
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-800">
              {message}
            </p>
            <p className="mt-2 text-xs text-amber-700">
              To prevent overwriting store hours, holiday closures, or links with defaults, editing is paused until current data can be verified.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="cursor-pointer rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                Retry
              </button>
              <Link
                href="/admin"
                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100/50"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
