"use client";

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DayHours } from "@/app/types/website-content";
import { formatHour, hourToTimeValue, timeValueToHour, SNAP_HOURS, MIN_DURATION_HOURS } from "../hours-utils";

export default function BusinessHoursRow({
  entry,
  onChange,
}: {
  entry: DayHours;
  onChange: (patch: Partial<DayHours>) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function hourFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round((fraction * 24) / SNAP_HOURS) * SNAP_HOURS;
  }

  // drag the edges to resize, drag the bar itself to slide the whole range
  function startDrag(mode: "move" | "start" | "end") {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (entry.closed) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const initStart = entry.start;
      const initEnd = entry.end;
      const startClientX = e.clientX;
      const trackWidth = trackRef.current?.getBoundingClientRect().width ?? 1;

      function handleMove(ev: PointerEvent) {
        if (mode === "move") {
          const duration = initEnd - initStart;
          const rawDeltaHour = ((ev.clientX - startClientX) / trackWidth) * 24;
          let start = Math.round((initStart + rawDeltaHour) / SNAP_HOURS) * SNAP_HOURS;
          start = Math.max(0, Math.min(24 - duration, start));
          onChange({ start, end: start + duration });
        } else if (mode === "start") {
          const hour = hourFromClientX(ev.clientX);
          onChange({ start: Math.max(0, Math.min(hour, initEnd - MIN_DURATION_HOURS)) });
        } else {
          const hour = hourFromClientX(ev.clientX);
          onChange({ end: Math.min(24, Math.max(hour, initStart + MIN_DURATION_HOURS)) });
        }
      }

      function handleUp(ev: PointerEvent) {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
      }

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);
    };
  }

  const leftPct = (entry.start / 24) * 100;
  const widthPct = ((entry.end - entry.start) / 24) * 100;

  return (
      <div className="grid grid-cols-[46px_minmax(0,1fr)_260px] items-center gap-3">
      <span className="text-[12.5px] font-bold">{entry.day}</span>

      <div
        ref={trackRef}
        className={`relative h-[30px] rounded-md border ${
          entry.closed ? "border-dashed border-[#dbb082]/60" : "border-[#ecdfd7]"
        }`}
        style={
          entry.closed
            ? undefined
            : {
                // gridline every 3 hours so a position on the bar maps to a readable time
                backgroundImage:
                  "linear-gradient(to right, rgba(43,33,29,0.16) 0, rgba(43,33,29,0.16) 1px, transparent 1px)",
                backgroundRepeat: "repeat-x",
                backgroundSize: "12.5% 100%",
              }
        }
      >
        {entry.closed ? (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            Closed
          </span>
        ) : (
          <div
            onPointerDown={startDrag("move")}
            className="absolute bottom-[3px] top-[3px] flex cursor-grab items-center justify-center overflow-hidden rounded bg-[#dbb082] px-1.5 text-[10px] font-bold text-[#4a3418] active:cursor-grabbing"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            {widthPct > 10 ? `${formatHour(entry.start)} – ${formatHour(entry.end)}` : ""}
            <div
              onPointerDown={startDrag("start")}
              className="absolute -left-1.5 -top-0.5 -bottom-0.5 w-3 cursor-ew-resize"
            />
            <div
              onPointerDown={startDrag("end")}
              className="absolute -right-1.5 -top-0.5 -bottom-0.5 w-3 cursor-ew-resize"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ closed: !entry.closed })}
          className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
            entry.closed ? "bg-[#dbb082]" : "bg-[#6f8f6a]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
              entry.closed ? "left-0.5" : "left-4"
            }`}
          />
        </button>

        <input
          type="time"
          value={hourToTimeValue(entry.start)}
          disabled={entry.closed}
          onChange={(e) => {
            const hour = timeValueToHour(e.target.value);
            if (!Number.isNaN(hour)) {
              onChange({ start: Math.max(0, Math.min(hour, entry.end - MIN_DURATION_HOURS)) });
            }
          }}
          className="w-[92px] rounded border border-[#ecdfd7] px-1.5 py-1 text-xs text-gray-700 disabled:text-gray-400"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="time"
          value={hourToTimeValue(entry.end)}
          disabled={entry.closed}
          onChange={(e) => {
            const hour = timeValueToHour(e.target.value);
            if (!Number.isNaN(hour)) {
              onChange({ end: Math.min(24, Math.max(hour, entry.start + MIN_DURATION_HOURS)) });
            }
          }}
          className="w-[92px] rounded border border-[#ecdfd7] px-1.5 py-1 text-xs text-gray-700 disabled:text-gray-400"
        />
      </div>
    </div>
  );
}
