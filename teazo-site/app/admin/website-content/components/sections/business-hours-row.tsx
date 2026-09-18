"use client";

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DayHours, Holiday } from "@/app/types/website-content";
import {
  formatHour,
  hourToTimeValue,
  timeValueToHour,
  SNAP_HOURS,
  MIN_DURATION_HOURS,
} from "../hours-utils";

const timeInputClass =
  "block min-h-11 w-full min-w-0 max-w-full cursor-pointer rounded border border-[#ecdfd7] bg-white px-1.5 py-1 text-base text-gray-700 disabled:cursor-default disabled:text-gray-400 lg:min-h-0 lg:text-xs";

export default function BusinessHoursRow({
  entry,
  holiday,
  onChange,
}: {
  entry: DayHours;
  holiday?: Holiday;
  onChange: (patch: Partial<DayHours>) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // maps an absolute pointer X to an hour value snapped to the nearest SNAP_HOURS increment
  function hourFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();

    if (!rect || rect.width <= 0) return 0;

    const fraction = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width)
    );

    return Math.round((fraction * 24) / SNAP_HOURS) * SNAP_HOURS;
  }

  // drag the edges to resize, drag the bar itself to slide the whole range
  function startDrag(mode: "move" | "start" | "end") {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (entry.closed) return;

      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget;
      const pointerId = e.pointerId;

      target.setPointerCapture(pointerId);

      // captured once at drag start so "move" can compute an absolute new
      // position from the total pointer delta instead of drifting on relative deltas
      const initStart = entry.start;
      const initEnd = entry.end;
      const startClientX = e.clientX;

      const trackWidth = Math.max(
        1,
        trackRef.current?.getBoundingClientRect().width ?? 1
      );

      function handleMove(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return;

        if (mode === "move") {
          // preserve duration while sliding so the bar can't grow/shrink by dragging its body
          const duration = initEnd - initStart;
          const rawDeltaHour =
            ((ev.clientX - startClientX) / trackWidth) * 24;

          let start =
            Math.round((initStart + rawDeltaHour) / SNAP_HOURS) *
            SNAP_HOURS;

          start = Math.max(0, Math.min(24 - duration, start));

          onChange({
            start,
            end: start + duration,
          });
        } else if (mode === "start") {
          // clamp against the opposite edge minus MIN_DURATION_HOURS so the two handles can't cross
          const hour = hourFromClientX(ev.clientX);

          onChange({
            start: Math.max(
              0,
              Math.min(hour, initEnd - MIN_DURATION_HOURS)
            ),
          });
        } else {
          const hour = hourFromClientX(ev.clientX);

          onChange({
            end: Math.min(
              24,
              Math.max(hour, initStart + MIN_DURATION_HOURS)
            ),
          });
        }
      }

      // Mobile browsers may cancel a gesture, so clean up that path too.
      function handleEnd(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return;

        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleEnd);
        target.removeEventListener("pointercancel", handleEnd);
        target.removeEventListener("lostpointercapture", handleEnd);

        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
      }

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleEnd);
      target.addEventListener("pointercancel", handleEnd);
      target.addEventListener("lostpointercapture", handleEnd);
    };
  }

  const leftPct = (entry.start / 24) * 100;
  const widthPct = ((entry.end - entry.start) / 24) * 100;

  return (
    // grid-cols must match HoursSection's axis-label header row so the columns stay aligned
    // Apply those columns at lg and above; smaller screens use stacked cards.
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-[#ecdfd7] p-3 lg:grid-cols-[46px_minmax(0,1fr)_260px] lg:items-center lg:rounded-none lg:border-0 lg:p-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 lg:flex-col lg:items-start lg:gap-0">
        <span className="text-sm font-bold lg:text-[12.5px]">
          {entry.day}
        </span>

        {holiday && (
          <span
            className="max-w-full break-words text-xs font-semibold text-[#c0553f] lg:truncate lg:text-[8.5px]"
            title={`${holiday.name}: ${
              holiday.closed
                ? "closed"
                : `${formatHour(holiday.start ?? 0)} – ${formatHour(
                    holiday.end ?? 0
                  )}`
            }`}
          >
            {holiday.name}
          </span>
        )}
      </div>

      <div className="min-w-0">
        {/* Stacked mobile rows each get their own compact time axis. */}
        <div className="mb-1 flex justify-between font-mono text-[10px] text-gray-400 lg:hidden">
          <span>{formatHour(0)}</span>
          <span>{formatHour(12)}</span>
          <span>{formatHour(24)}</span>
        </div>

        <div
          ref={trackRef}
          className={`relative h-11 min-w-0 rounded-md border lg:h-[30px] ${
            entry.closed
              ? "border-dashed border-[#dbb082]/60"
              : "border-[#ecdfd7]"
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
              className="absolute bottom-[3px] top-[3px] flex touch-none select-none cursor-grab items-center justify-center overflow-hidden rounded bg-[#dbb082] text-[10px] font-bold text-[#4a3418] active:cursor-grabbing"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
              }}
            >
              <span className="pointer-events-none min-w-0 truncate">
                {widthPct > 10
                  ? `${formatHour(entry.start)} – ${formatHour(entry.end)}`
                  : ""}
              </span>

              <div
                onPointerDown={startDrag("start")}
                className="absolute inset-y-0 left-0 w-3 touch-none cursor-ew-resize"
              />

              <div
                onPointerDown={startDrag("end")}
                className="absolute inset-y-0 right-0 w-3 touch-none cursor-ew-resize"
              />
            </div>
          )}
        </div>
      </div>

      {/* Full-width time fields on phones; the original compact row on desktop. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:items-center lg:gap-2">
        <div className="flex items-center gap-2 sm:col-span-2 lg:shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={!entry.closed}
            aria-label={`${entry.day} open`}
            onClick={() => onChange({ closed: !entry.closed })}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-[18px] lg:w-8"
          >
            <span
              className={`relative block h-[18px] w-8 rounded-full transition-colors ${
                entry.closed ? "bg-[#dbb082]" : "bg-[#6f8f6a]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                  entry.closed ? "left-0.5" : "left-4"
                }`}
              />
            </span>
          </button>

          <span className="text-sm text-gray-600 lg:hidden">
            {entry.closed ? "Closed" : "Open"}
          </span>
        </div>

        <label className="block min-w-0 lg:w-[92px] lg:shrink-0">
          <span className="mb-1 block text-xs font-semibold text-gray-500 lg:hidden">
            Opens
          </span>

          <input
            type="time"
            aria-label={`${entry.day} opening time`}
            value={hourToTimeValue(entry.start)}
            disabled={entry.closed}
            onChange={(e) => {
              const hour = timeValueToHour(e.target.value);

              if (!Number.isNaN(hour)) {
                onChange({
                  start: Math.max(
                    0,
                    Math.min(hour, entry.end - MIN_DURATION_HOURS)
                  ),
                });
              }
            }}
            className={timeInputClass}
          />
        </label>

        <span
          aria-hidden="true"
          className="hidden text-xs text-gray-400 lg:block"
        >
          –
        </span>

        <label className="block min-w-0 lg:w-[92px] lg:shrink-0">
          <span className="mb-1 block text-xs font-semibold text-gray-500 lg:hidden">
            Closes
          </span>

          <input
            type="time"
            aria-label={`${entry.day} closing time`}
            value={hourToTimeValue(entry.end)}
            disabled={entry.closed}
            onChange={(e) => {
              const hour = timeValueToHour(e.target.value);

              if (!Number.isNaN(hour)) {
                onChange({
                  end: Math.min(
                    24,
                    Math.max(hour, entry.start + MIN_DURATION_HOURS)
                  ),
                });
              }
            }}
            className={timeInputClass}
          />
        </label>
      </div>
    </div>
  );
} 