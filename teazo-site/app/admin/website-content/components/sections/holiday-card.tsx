"use client";

import { useState } from "react";
import type { Holiday } from "@/app/types/website-content";
import { fieldClass, ErrorText } from "../field-controls";
import { daysInMonth } from "../validators";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatHolidayDate(value: string) {
  const [m, d] = value.split("-").map(Number);
  if (!m || !d) return "No date set";
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

export default function HolidayCard({
  holiday,
  isDuplicateDate,
  onChange,
  onRemove,
}: {
  holiday: Holiday;
  isDuplicateDate: boolean;
  onChange: (patch: Partial<Holiday>) => void;
  onRemove: () => void;
}) {
  const [nameTouched, setNameTouched] = useState(false);
  const [month, day] = holiday.date.split("-");

  const nameError = nameTouched && !holiday.name.trim() ? "Name is required" : undefined;

  const monthNum = month ? Number(month) : null;
  const dayCount = daysInMonth(monthNum);
  const hasAnyDatePart = Boolean(month || day);
  const dateComplete = Boolean(month && day);

  let dateError: string | undefined;
  if (dateComplete) {
    if (isDuplicateDate) dateError = "Another holiday already uses this date";
  } else if (hasAnyDatePart) {
    dateError = "Select both a month and a day";
  }

  function setMonth(newMonth: string) {
    const newMonthNum = newMonth ? Number(newMonth) : null;
    const clampedDay = day ? Math.min(Number(day), daysInMonth(newMonthNum)) : null;
    onChange({ date: `${newMonth}-${clampedDay ? String(clampedDay).padStart(2, "0") : ""}` });
  }

  function setDay(newDay: string) {
    onChange({ date: `${month || ""}-${newDay}` });
  }

  return (
    <div className="flex w-[220px] flex-col gap-2.5 rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#a99584]">
          {formatHolidayDate(holiday.date)} · repeats yearly
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#c0553f] transition-colors hover:bg-[#f3d9d2]"
        >
          <span className="text-[10px] leading-none">✕</span>
        </button>
      </div>

      <div>
        <input
          type="text"
          value={holiday.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => setNameTouched(true)}
          placeholder="Holiday name"
          className={`${fieldClass(Boolean(nameError))} bg-white font-semibold text-[#4a3418]`}
        />
        {nameError && <ErrorText>{nameError}</ErrorText>}
      </div>

      <div>
        <div className="flex gap-2">
          <select
            value={month || ""}
            onChange={(e) => setMonth(e.target.value)}
            className={`${fieldClass(Boolean(dateError))} bg-white`}
          >
            <option value="" disabled>
              Month
            </option>
            {MONTH_NAMES.map((label, i) => (
              <option key={label} value={String(i + 1).padStart(2, "0")}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={day || ""}
            onChange={(e) => setDay(e.target.value)}
            disabled={!month}
            className={`${fieldClass(Boolean(dateError))} !w-[70px] bg-white disabled:text-gray-400`}
          >
            <option value="" disabled>
              Day
            </option>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d).padStart(2, "0")}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {dateError && <ErrorText>{dateError}</ErrorText>}
      </div>
    </div>
  );
}
