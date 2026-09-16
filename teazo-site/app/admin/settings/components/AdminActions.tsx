"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type AdminActionsProps = {
  username: string;
  onDelete: () => void;
};

export function AdminActions({
  username,
  onDelete,
}: AdminActionsProps) {
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
      className="relative"
    >
      <button
        type="button"
        aria-label={`Actions for ${username}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="currentColor"
        >
          <circle
            cx="5"
            cy="12"
            r="1.75"
          />

          <circle
            cx="12"
            cy="12"
            r="1.75"
          />

          <circle
            cx="19"
            cy="12"
            r="1.75"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-32 max-w-[calc(100vw-2rem)] overflow-visible rounded-md border border-gray-100 bg-white shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}