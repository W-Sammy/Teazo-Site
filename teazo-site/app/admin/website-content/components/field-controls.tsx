import type { ReactNode } from "react";

// shared here so every section's inputs/errors look and behave identically
// Keep native inputs/selects within their column and give mobile fields more room.
export const inputClass =
  "block min-h-11 w-full min-w-0 max-w-full rounded border border-[#ecdfd7] px-2.5 py-1.5 text-base text-gray-700 focus:border-[#dbb082] focus:outline-none sm:min-h-0 sm:text-sm";

const errorInputClass =
  "block min-h-11 w-full min-w-0 max-w-full rounded border border-red-400 px-2.5 py-1.5 text-base text-gray-700 focus:border-red-400 focus:outline-none sm:min-h-0 sm:text-sm";

export function fieldClass(hasError?: boolean) {
  return hasError ? errorInputClass : inputClass;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-semibold text-gray-500">
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 min-w-0 break-words text-xs text-red-600">
      {children}
    </p>
  );
}

export function Logo({ src }: { src: string }) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col items-center">
      <img
        src={src}
        alt="TEAZO logo"
        className="h-14 w-auto max-w-full object-contain"
      />
      <div className="mt-1 text-[11px] tracking-[2px] text-[#c98a52]">
        TEAZO
      </div>
    </div>
  );
}