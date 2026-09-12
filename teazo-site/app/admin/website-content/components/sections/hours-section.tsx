"use client";

import { AccordionItem } from "../section-shell";
import { IconHours } from "../icons";
import { AXIS_LABELS } from "../hours-utils";
import type { DayHours } from "@/app/types/website-content";
import BusinessHoursRow from "./business-hours-row";

export default function HoursSection({
  hours,
  isOpen,
  onToggle,
  setRef,
  onUpdateDay,
}: {
  hours: DayHours[];
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateDay: (index: number, patch: Partial<DayHours>) => void;
}) {
  return (
    <AccordionItem id="hours" label="Business Hours" icon={<IconHours />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      {/* placeholder date range; hours aren't week-specific yet, this'll need real data once the backend lands */}
      <p className="mb-3.5 text-[15px] font-semibold text-blue-500">Week: 02/21 - 02/27</p>

      {/* grid-cols must match BusinessHoursRow's so axis labels line up with the drag bars below */}
      <div className="mb-2 grid grid-cols-[46px_minmax(0,1fr)_260px] gap-3">
        <span />
        <div className="flex justify-between font-mono text-[9.5px] text-gray-400">
          {AXIS_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <span />
      </div>

      <div className="flex flex-col gap-2.5">
        {hours.map((entry, i) => (
          <BusinessHoursRow key={entry.day} entry={entry} onChange={(patch) => onUpdateDay(i, patch)} />
        ))}
      </div>
    </AccordionItem>
  );
}
