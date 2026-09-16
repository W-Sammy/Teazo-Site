"use client";

import type { ReactNode } from "react";

type AdminFormProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  mobileFullscreen?: boolean;
};

export default function AdminForm({
  isOpen,
  onClose,
  children,
  mobileFullscreen = false,
}: AdminFormProps) {
  const drawerClasses = mobileFullscreen
    ? `fixed inset-y-0 right-0 z-50 h-dvh w-full max-w-md overflow-hidden bg-white shadow-xl transition-transform duration-300 md:static md:z-auto md:h-full md:max-w-none md:shrink-0 md:transition-[width] ${
        isOpen
          ? "translate-x-0 md:w-80"
          : "pointer-events-none translate-x-full md:w-0 md:translate-x-0"
      }`
    : `h-full shrink-0 overflow-hidden bg-white shadow-xl transition-all duration-300 ${
        isOpen ? "w-80" : "w-0"
      }`;

  return (
    <>
      {mobileFullscreen && isOpen && (
        <button
          type="button"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          aria-label="Close form"
        />
      )}

      <aside
        className={drawerClasses}
        role="dialog"
        aria-modal={mobileFullscreen ? true : undefined}
        aria-hidden={!isOpen}
      >
        <div className="relative h-full min-w-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-black"
            aria-label="Close form"
            title="Close"
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

          {children}
        </div>
      </aside>
    </>
  );
}