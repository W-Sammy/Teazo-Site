"use client";

import type { ReactNode } from "react";

export type AdminViewOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type AdminViewToggleProps<T extends string> = {
  value: T;
  options: readonly AdminViewOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

export default function AdminViewToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = "Select view",
  className = "",
}: AdminViewToggleProps<T>) {
  return (
    <div
      className={`inline-flex w-full min-w-0 overflow-hidden rounded-lg border border-[#dbb082] sm:w-auto sm:shrink-0 ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap px-2 py-2 text-sm transition-colors sm:flex-none sm:gap-2 sm:px-3 ${
              index > 0
                ? "border-l border-[#dbb082]"
                : ""
            } ${
              isActive
                ? "bg-[#dbb082] font-semibold text-white"
                : "bg-white text-gray-600 hover:bg-[#fffaf6]"
            }`}
            aria-pressed={isActive}
          >
            {option.icon && (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                {option.icon}
              </span>
            )}

            <span className="whitespace-nowrap">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GridViewIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="4"
        height="4"
        rx="0.5"
      />
      <rect
        x="8"
        y="2"
        width="4"
        height="4"
        rx="0.5"
      />
      <rect
        x="14"
        y="2"
        width="4"
        height="4"
        rx="0.5"
      />

      <rect
        x="2"
        y="8"
        width="4"
        height="4"
        rx="0.5"
      />
      <rect
        x="8"
        y="8"
        width="4"
        height="4"
        rx="0.5"
      />
      <rect
        x="14"
        y="8"
        width="4"
        height="4"
        rx="0.5"
      />

      <rect
        x="2"
        y="14"
        width="4"
        height="4"
        rx="0.5"
      />
      <rect
        x="8"
        y="14"
        width="4"
        height="4"
        rx="0.5"
      />
      <rect
        x="14"
        y="14"
        width="4"
        height="4"
        rx="0.5"
      />
    </svg>
  );
}

export function ListViewIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 5h11" />
      <path d="M7 10h11" />
      <path d="M7 15h11" />

      <path d="M2 5h1" />
      <path d="M2 10h1" />
      <path d="M2 15h1" />
    </svg>
  );
}