"use client";

import type { ReactNode } from "react";
import type { SectionId } from "./types";

export function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 border-r-[1.6px] border-b-[1.6px] border-[#a99584] transition-transform duration-150 ${
        open ? "rotate-[135deg]" : "-rotate-45"
      }`}
    />
  );
}

// sidebar nav row; `active` mirrors the currently open AccordionItem so the two stay in sync
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
      className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
        active
          ? "border-[#c98a52] bg-[#c98a52]/[0.14] font-bold text-[#a5652b]"
          : "border-transparent text-[#4a3418] hover:bg-white/60"
      }`}
    >
      <span
        className={`shrink-0 ${
          active ? "text-[#c98a52]" : "text-[#a99584]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 break-words">{label}</span>
    </button>
  );
}

// setRef exposes the card's DOM node to the parent so its effect can scrollIntoView on open
// Cards can shrink with the page instead of forcing a wider content column.
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
    <div
      ref={setRef}
      id={`section-${id}`}
      className="w-full min-w-0 scroll-mt-4 overflow-hidden rounded-xl border border-[#ecdfd7] bg-white"
    >
      <button
        id={`section-heading-${id}`}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`section-panel-${id}`}
        className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 px-3 py-4 text-left sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="shrink-0 text-[#c98a52]">{icon}</span>
          <span className="min-w-0 break-words text-sm font-bold text-[#2b211d]">
            {label}
          </span>
        </span>
        <Chevron open={isOpen} />
      </button>

      {isOpen && (
        <div
          id={`section-panel-${id}`}
          role="region"
          aria-labelledby={`section-heading-${id}`}
          className="min-w-0 px-3 pb-5 sm:px-5 sm:pb-6"
        >
          {children}
        </div>
      )}
    </div>
  );
}