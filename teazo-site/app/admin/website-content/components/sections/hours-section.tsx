"use client";

import { AccordionItem } from "../section-shell";
import { IconHours } from "../icons";
import {
  AXIS_LABELS,
  getCurrentWeekLabel,
  getWeekDates,
  toMonthDay,
} from "../hours-utils";
import type { DayHours, Holiday } from "@/app/types/website-content";
import BusinessHoursRow from "./business-hours-row";

export default function HoursSection({
  hours,
  holidays,
  isOpen,
  onToggle,
  setRef,
  onUpdateDay,
}: {
  hours: DayHours[];
  holidays: Holiday[];
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateDay: (index: number, patch: Partial<DayHours>) => void;
}) {
  const now = new Date();
  const weekLabel = getCurrentWeekLabel(now);
  const weekDates = getWeekDates(now);

  return (
    <AccordionItem
      id="hours"
      label="Business Hours"
      icon={<IconHours />}
      isOpen={isOpen}
      onToggle={onToggle}
      setRef={setRef}
    >
      <p className="mb-3.5 break-words text-[15px] font-semibold text-blue-500">
        Week: {weekLabel}
      </p>

      {/* grid-cols must match BusinessHoursRow's so axis labels line up with the drag bars below */}
      {/* The shared axis is only shown with the desktop three-column rows. */}
      <div className="mb-2 hidden grid-cols-[46px_minmax(0,1fr)_260px] gap-3 lg:grid">
        <span />
        <div className="flex justify-between font-mono text-[9.5px] text-gray-400">
          {AXIS_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <span />
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:gap-2.5">
        {hours.map((entry, i) => {
          // groundwork for Holiday Exceptions overriding Business Hours: flag which row falls
          // on a holiday this week so it can be visually called out (edit still happens on the
          // Holiday Exceptions card; actual override-on-save merge needs the backend to land)
          const holiday = holidays.find(
            (h) => h.date === toMonthDay(weekDates[i])
          );

          return (
            <BusinessHoursRow
              key={entry.day}
              entry={entry}
              holiday={holiday}
              onChange={(patch) => onUpdateDay(i, patch)}
            />
          );
        })}
      </div>
    </AccordionItem>
  );
} 