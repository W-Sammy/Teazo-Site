"use client";

import { useState } from "react";
import type { Holiday } from "@/app/types/website-content";
import { fieldClass, ErrorText } from "../field-controls";
import { daysInMonth, parseHolidayDate } from "../validators";
import {
  hourToTimeValue,
  timeValueToHour,
  MIN_DURATION_HOURS,
} from "../hours-utils";

const DEFAULT_START = 9;
const DEFAULT_END = 17;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const timeInputClass =
  "block min-h-11 w-full min-w-0 max-w-full cursor-pointer rounded border border-[#ecdfd7] bg-white px-1.5 py-1.5 text-base text-gray-700 sm:min-h-0 sm:text-xs";

const YEARS_AHEAD = 4;

function formatHolidayDate(value: string) {
  const { year, month, day } = parseHolidayDate(value);

  if (!month || !day) return "No date set";

  return year
    ? `${MONTH_NAMES[month - 1]} ${day}, ${year} · this year only`
    : `${MONTH_NAMES[month - 1]} ${day} · repeats yearly`;
}

// "MM-DD" repeats every year, "YYYY-MM-DD" is that one day (see Holiday.date)
function splitDate(value: string) {
  const parts = value.split("-");
  return parts.length === 3
    ? { year: parts[0], month: parts[1], day: parts[2] }
    : { year: "", month: parts[0] ?? "", day: parts[1] ?? "" };
}

function joinDate(year: string, month: string, day: string) {
  return year ? `${year}-${month}-${day}` : `${month}-${day}`;
}

// The first year in which month/day is still ahead, so a new one-time holiday isn't already over.
function nextYearFor(month: string, day: string) {
  const today = new Date();
  const thisYear = today.getFullYear();
  if (!month || !day) return thisYear;
  const thisYearsDate = new Date(thisYear, Number(month) - 1, Number(day), 23, 59);
  return thisYearsDate < today ? thisYear + 1 : thisYear;
}

export default function HolidayCard({
  holiday,
  isDuplicateDate,
  onChange,
  onRemove,
  onBlur,
}: {
  holiday: Holiday;
  isDuplicateDate: boolean;
  onChange: (patch: Partial<Holiday>) => void;
  onRemove: () => void;
  onBlur?: () => void;
}) {
  const [nameTouched, setNameTouched] = useState(false);
  const { year, month, day } = splitDate(holiday.date);
  const repeatsYearly = !year;

  const nameError =
    nameTouched && !holiday.name.trim() ? "Name is required" : undefined;

  const monthNum = month ? Number(month) : null;
  const yearNum = year ? Number(year) : null;
  const dayCount = daysInMonth(monthNum, yearNum);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: YEARS_AHEAD + 1 }, (_, i) => currentYear + i);
  if (yearNum && !yearOptions.includes(yearNum)) yearOptions.unshift(yearNum);
  const hasAnyDatePart = Boolean(month || day);
  const dateComplete = Boolean(month && day);

  let dateError: string | undefined;

  if (dateComplete) {
    if (isDuplicateDate) {
      dateError = "Another holiday already uses this date";
    }
  } else if (hasAnyDatePart) {
    dateError = "Select both a month and a day";
  }

  // re-clamp the already-picked day if the new month or year makes it invalid (e.g. 31 -> Feb, or Feb 29 -> 2027)
  function clampDay(newMonth: string, newYear: string) {
    if (!day) return "";
    const maxDay = daysInMonth(newMonth ? Number(newMonth) : null, newYear ? Number(newYear) : null);
    return String(Math.min(Number(day), maxDay)).padStart(2, "0");
  }

  function setMonth(newMonth: string) {
    onChange({ date: joinDate(year, newMonth, clampDay(newMonth, year)) });
  }

  function setDay(newDay: string) {
    onChange({ date: joinDate(year, month || "", newDay) });
  }

  function setYear(newYear: string) {
    onChange({ date: joinDate(newYear, month || "", clampDay(month, newYear)) });
  }

  function setRepeatsYearly(repeats: boolean) {
    if (repeats) {
      onChange({ date: joinDate("", month || "", day || "") });
    } else {
      const newYear = String(nextYearFor(month, day));
      onChange({ date: joinDate(newYear, month || "", clampDay(month, newYear)) });
    }
  }

  return (
    // Fill the available width on phones without changing desktop card sizing.
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3 rounded-xl border border-[#ecdfd7] bg-[#fbf3ea] p-3 sm:w-[245px] sm:gap-2.5 sm:p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 break-words text-[11px] font-semibold uppercase tracking-wide text-[#a99584]">
          {formatHolidayDate(holiday.date)}
        </span>

        <button
          type="button"
          aria-label={`Remove ${holiday.name || "holiday"}`}
          onClick={onRemove}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#c0553f] transition-colors hover:bg-[#f3d9d2] sm:h-5 sm:w-5"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <div className="min-w-0">
        <input
          type="text"
          value={holiday.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => {
            setNameTouched(true);
            onBlur?.();
          }}
          placeholder="Holiday name"
          aria-label="Holiday name"
          className={`${fieldClass(
            Boolean(nameError)
          )} bg-white font-semibold text-[#4a3418]`}
        />

        {nameError && <ErrorText>{nameError}</ErrorText>}
      </div>

      <div className="min-w-0">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_70px]">
          <select
            value={month || ""}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Holiday month"
            className={`${fieldClass(
              Boolean(dateError)
            )} cursor-pointer bg-white`}
          >
            <option value="" disabled>
              Month
            </option>

            {MONTH_NAMES.map((label, i) => (
              <option
                key={label}
                value={String(i + 1).padStart(2, "0")}
              >
                {label}
              </option>
            ))}
          </select>

          <select
            value={day || ""}
            onChange={(e) => setDay(e.target.value)}
            disabled={!month}
            aria-label="Holiday day"
            className={`${fieldClass(
              Boolean(dateError)
            )} cursor-pointer bg-white disabled:cursor-default disabled:text-gray-400`}
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

        {!repeatsYearly && (
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="Holiday year"
            className={`${fieldClass(Boolean(dateError))} mt-2 cursor-pointer bg-white`}
          >
            {yearOptions.map((option) => (
              <option key={option} value={String(option)}>
                {option}
              </option>
            ))}
          </select>
        )}

        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-xs text-gray-600 sm:min-h-0">
          <input
            type="checkbox"
            checked={repeatsYearly}
            onChange={(e) => setRepeatsYearly(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[#6f8f6a]"
          />
          Repeats every year
        </label>

        {dateError && <ErrorText>{dateError}</ErrorText>}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <span
          className={`text-right text-xs ${
            holiday.closed
              ? "font-semibold text-[#4a3418]"
              : "text-gray-400"
          }`}
        >
          Closed
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={!holiday.closed}
          aria-label={`Use adjusted hours for ${holiday.name || "holiday"}`}
          onClick={() =>
            onChange(
              holiday.closed
                ? {
                    closed: false,
                    start: holiday.start ?? DEFAULT_START,
                    end: holiday.end ?? DEFAULT_END,
                  }
                : { closed: true }
            )
          }
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg sm:h-[18px] sm:w-8"
        >
          <span
            className={`relative block h-[18px] w-8 rounded-full transition-colors ${
              holiday.closed ? "bg-[#dbb082]" : "bg-[#6f8f6a]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                holiday.closed ? "left-0.5" : "left-4"
              }`}
            />
          </span>
        </button>

        <span
          className={`text-xs ${
            holiday.closed
              ? "text-gray-400"
              : "font-semibold text-[#4a3418]"
          }`}
        >
          Adjusted Hours
        </span>
      </div>

      {!holiday.closed && (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-1.5">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold text-gray-500 sm:hidden">
              Opens
            </span>

            <input
              type="time"
              aria-label={`${holiday.name || "Holiday"} opening time`}
              value={hourToTimeValue(holiday.start ?? DEFAULT_START)}
              onChange={(e) => {
                const hour = timeValueToHour(e.target.value);

                if (!Number.isNaN(hour)) {
                  onChange({
                    start: Math.max(
                      0,
                      Math.min(
                        hour,
                        (holiday.end ?? DEFAULT_END) - MIN_DURATION_HOURS
                      )
                    ),
                  });
                }
              }}
              className={timeInputClass}
            />
          </label>

          <span
            aria-hidden="true"
            className="hidden text-xs text-gray-400 sm:block"
          >
            –
          </span>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold text-gray-500 sm:hidden">
              Closes
            </span>

            <input
              type="time"
              aria-label={`${holiday.name || "Holiday"} closing time`}
              value={hourToTimeValue(holiday.end ?? DEFAULT_END)}
              onChange={(e) => {
                const hour = timeValueToHour(e.target.value);

                if (!Number.isNaN(hour)) {
                  onChange({
                    end: Math.min(
                      24,
                      Math.max(
                        hour,
                        (holiday.start ?? DEFAULT_START) +
                          MIN_DURATION_HOURS
                      )
                    ),
                  });
                }
              }} 
              className={timeInputClass}
            />
          </label>
        </div>
      )}
    </div>
  );
}