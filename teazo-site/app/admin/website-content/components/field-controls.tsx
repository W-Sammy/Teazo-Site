import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded border border-[#ecdfd7] px-2.5 py-1.5 text-sm text-gray-700 focus:border-[#dbb082] focus:outline-none";

const errorInputClass =
  "w-full rounded border border-red-400 px-2.5 py-1.5 text-sm text-gray-700 focus:border-red-400 focus:outline-none";

export function fieldClass(hasError?: boolean) {
  return hasError ? errorInputClass : inputClass;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold text-gray-500">{children}</label>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
}

export function Logo({ src }: { src: string }) {
  return (
    <div className="flex flex-col items-center">
      <img src={src} alt="TEAZO logo" className="h-14 w-auto object-contain" />
      <div className="mt-1 text-[11px] tracking-[2px] text-[#c98a52]">
        TEAZO
      </div>
    </div>
  );
}
