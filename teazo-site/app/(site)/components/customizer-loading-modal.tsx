"use client";

import React, { useEffect, useRef } from "react";

export interface CustomizerLoadingModalProps {
  onDismiss?: () => void;
}

export default function CustomizerLoadingModal({ onDismiss }: CustomizerLoadingModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Set initial focus to the cancel button or dialog
    const focusTimer = setTimeout(() => {
      if (cancelButtonRef.current) {
        cancelButtonRef.current.focus();
      } else {
        dialogRef.current?.focus();
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDismiss?.();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElementRef.current && document.contains(previousActiveElementRef.current)) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="Loading drink customizer"
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity focus:outline-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && onDismiss) {
          onDismiss();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-[#FAF7F2] p-8 shadow-2xl flex flex-col items-center justify-center space-y-4 border border-stone-200 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-3 border-[#DBAF82] border-t-transparent"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-stone-800">Loading customization options...</p>
          <p className="text-xs text-stone-500">Preparing available flavours and toppings</p>
        </div>
        {onDismiss && (
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onDismiss}
            className="mt-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition shadow-xs focus:outline-none focus:ring-2 focus:ring-[#DBAF82]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
