"use client";

import type { ReactNode } from "react";
import type { SectionId } from "./types";

export function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 border-r-[1.6px] border-b-[1.6px] border-[#a99584] transition-transform duration-150 ${
        open ? "rotate-[135deg]" : "-rotate-45"
      }`}
    />
  );
}

export function TocItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
        active
          ? "border-[#c98a52] bg-[#c98a52]/[0.14] font-bold text-[#a5652b]"
          : "border-transparent text-[#4a3418] hover:bg-white/60"
      }`}
    >
      <span className={active ? "text-[#c98a52]" : "text-[#a99584]"}>{icon}</span>
      {label}
    </button>
  );
}

export function AccordionItem({
  id,
  label,
  icon,
  isOpen,
  onToggle,
  setRef,
  children,
}: {
  id: SectionId;
  label: string;
  icon: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div ref={setRef} id={`section-${id}`} className="overflow-hidden rounded-xl border border-[#ecdfd7] bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="text-[#c98a52]">{icon}</span>
          <span className="text-sm font-bold text-[#2b211d]">{label}</span>
        </span>
        <Chevron open={isOpen} />
      </button>
      {isOpen && <div className="px-5 pb-6">{children}</div>}
    </div>
  );
}
