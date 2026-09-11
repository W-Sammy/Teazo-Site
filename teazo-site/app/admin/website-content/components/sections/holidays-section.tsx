"use client";

import { AccordionItem } from "../section-shell";
import { IconHolidays } from "../icons";
import type { Holiday } from "../types";
import { isValidHolidayDay } from "../validators";
import HolidayCard from "./holiday-card";

function countValidDates(holidays: Holiday[]) {
  const counts = new Map<string, number>();
  for (const holiday of holidays) {
    const [m, d] = holiday.date.split("-").map(Number);
    if (isValidHolidayDay(m || null, d || null)) {
      counts.set(holiday.date, (counts.get(holiday.date) ?? 0) + 1);
    }
  }
  return counts;
}

export default function HolidaysSection({
  holidays,
  isOpen,
  onToggle,
  setRef,
  onUpdateHoliday,
  onRemoveHoliday,
  onAddHoliday,
}: {
  holidays: Holiday[];
  isOpen: boolean;
  onToggle: () => void;
  setRef: (el: HTMLDivElement | null) => void;
  onUpdateHoliday: (id: string, patch: Partial<Holiday>) => void;
  onRemoveHoliday: (id: string) => void;
  onAddHoliday: () => void;
}) {
  const validDateCounts = countValidDates(holidays);

  return (
    <AccordionItem id="holidays" label="Holiday Exceptions" icon={<IconHolidays />} isOpen={isOpen} onToggle={onToggle} setRef={setRef}>
      <p className="mb-3 text-xs text-gray-400">Dates the business is closed, shown on the homepage hours.</p>
      <div className="mb-5 flex flex-wrap gap-3">
        {holidays.map((holiday) => (
          <HolidayCard
            key={holiday.id}
            holiday={holiday}
            isDuplicateDate={(validDateCounts.get(holiday.date) ?? 0) > 1}
            onChange={(patch) => onUpdateHoliday(holiday.id, patch)}
            onRemove={() => onRemoveHoliday(holiday.id)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAddHoliday}
        className="cursor-pointer rounded-2xl bg-[#FFBDC7] px-[18px] py-2 text-[13px] font-semibold text-white hover:bg-[#F59AA3]"
      >
        New Holiday +
      </button>
    </AccordionItem>
  );
}
