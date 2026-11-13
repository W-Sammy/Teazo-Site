"use client";

import { useEffect, useRef, useState } from "react";
import type { StorageUsage } from "@/app/types/storage-usage";

const WARNING_THRESHOLD = 0.8;

const STORAGE_DETAILS = {
  D1: {
    label: "General Data",
    description: "The D1 database stores website text, settings, admin accounts, analytics, and file references. Square manages your product catalog and payments separately.",
    cleanup: "Review and remove unneeded site records to free up space.",
  },
  R2: {
    label: "Site Images",
    description: "R2 stores images uploaded to the site, such as gallery and event photos, plus uploaded menu PDFs. Images hosted by Square are stored separately.",
    cleanup: "Remove unused uploaded images or menu PDFs to free up space.",
  },
} satisfies Record<StorageUsage["service"], { label: string; description: string; cleanup: string }>;

// Picks the unit that fits, so a few small images read "403.9 KB" rather than
// rounding down to "0.0 GB" and looking like nothing is stored.
function formatStorage(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// "<1%" instead of "0%" when something is stored but too little to round up.
function formatPercent(usage: StorageUsage) {
  const percent = getUsagePercent(usage);
  return usage.currentBytes > 0 && percent < 1 ? "<1%" : `${percent.toFixed(0)}%`;
}

function getUsagePercent(usage: StorageUsage) {
  return Math.min((usage.currentBytes / usage.maxBytes) * 100, 100);
}

function isAtWarningThreshold(usage: StorageUsage) {
  return usage.currentBytes / usage.maxBytes >= WARNING_THRESHOLD;
}

export function StorageWarnings({ usage }: { usage: StorageUsage[] }) {
  const warnings = usage.filter(isAtWarningThreshold);

  if (warnings.length === 0) return null;

  return (
    <section aria-label="Storage warnings" className="mb-6 space-y-3">
      {warnings.map((item) => (
        <div key={item.service} role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span aria-hidden="true" className="mt-0.5 text-base">⚠</span>
          <p><span className="font-semibold">{STORAGE_DETAILS[item.service].label} storage is at {getUsagePercent(item).toFixed(0)}%.</span> {STORAGE_DETAILS[item.service].cleanup}</p>
        </div>
      ))}
    </section>
  );
}

export default function StorageUsage({ usage }: { usage: StorageUsage[] }) {
  const [openTooltip, setOpenTooltip] = useState<StorageUsage["service"] | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !sectionRef.current?.contains(target)
      ) {
        setOpenTooltip(null);
        return;
      }

      if (
        target instanceof Element &&
        !target.closest("[data-storage-tooltip]")
      ) {
        setOpenTooltip(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenTooltip(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <section 
    ref={sectionRef}
    className="mt-8 rounded-2xl bg-white p-5 sm:p-7"
    aria-labelledby="storage-heading">
      <div className="mb-6"><h2 id="storage-heading" className="text-lg font-bold text-[#374151]">Storage usage</h2><p className="mt-1 text-sm text-slate-400">Current usage compared with your service limits.</p></div>
      <div className="grid gap-6">
        {usage.map((item) => {
          const percentage = getUsagePercent(item);
          const color = item.service === "D1" ? "bg-blue-500" : "bg-green-500";
          const trackColor = item.service === "D1" ? "bg-blue-50" : "bg-green-50";
          const details = STORAGE_DETAILS[item.service];
          const tooltipId = `storage-info-${item.service}`;

          return (
            <div key={item.service}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">{details.label}</span>
                  <div data-storage-tooltip className="group relative flex items-center">
                    <button
                      type="button"
                      aria-label={`About ${details.label}`}
                      aria-expanded={openTooltip === item.service}
                      aria-describedby={tooltipId}
                      onClick={() =>
                        setOpenTooltip((current) =>
                        current === item.service ? null : item.service
                      )}
                      className="cursor-pointer rounded-full p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 11v6" />
                        <path d="M12 7h.01" />
                      </svg>
                    </button>
                    <span
                      id={tooltipId}
                      role="tooltip"
                      className={`pointer-events-none absolute -left-24 top-full z-10 w-60 rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-relaxed text-white transition-opacity sm:left-0 sm:w-72 ${
                        openTooltip === item.service
                          ? "visible opacity-100"
                          : "invisible opacity-0"
                      }`}
                    >
                      {details.description}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-400">{formatPercent(item)}</span>
              </div>
              <div className={`h-4 overflow-hidden rounded-full ${trackColor}`}>
                <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${item.currentBytes > 0 ? Math.max(percentage, 1) : 0}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-600">
                  {formatStorage(item.currentBytes)}
                  {item.fileCount !== undefined && (
                    <span className="font-normal text-slate-400">
                      {" "}· {item.fileCount} {item.fileCount === 1 ? "file" : "files"}
                    </span>
                  )}
                </span>
                <span className="text-slate-400">of {formatStorage(item.maxBytes)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
