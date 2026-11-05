/**
 * Tests the Business Hours administration date and time helpers.
 *
 * Covers time formatting, time-input conversions, weekly
 * calendar calculations, and recurring/one-time holiday dates.
 *
 * These are pure functions. No database, network, or production
 * website settings are accessed.
 */

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AXIS_LABELS,
  SNAP_HOURS,
  MIN_DURATION_HOURS,
  formatHour,
  hourToTimeValue,
  timeValueToHour,
  getWeekDates,
  toMonthDay,
  toIsoDate,
  getCurrentWeekLabel,
} from "./hours-utils";

function localDate(
  year: number,
  month: number,
  day: number,
): Date {
  // Month is one-based for readability.
  // Noon avoids local midnight/DST ambiguities.
  return new Date(year, month - 1, day, 12);
}

function dateParts(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ];
}

describe("Admin Business Hours utilities", () => {
  describe("Time formatting", () => {
    it("formats midnight, morning, noon, and evening correctly", () => {
      expect(formatHour(0)).toBe("12:00am");
      expect(formatHour(9)).toBe("9:00am");
      expect(formatHour(12)).toBe("12:00pm");
      expect(formatHour(15)).toBe("3:00pm");
      expect(formatHour(23.5)).toBe("11:30pm");
    });

    it("formats half-hour and quarter-hour values", () => {
      expect(formatHour(8.5)).toBe("8:30am");
      expect(formatHour(14.25)).toBe("2:15pm");
      expect(formatHour(17.75)).toBe("5:45pm");
    });

    it("converts numeric hours into HTML time-input values", () => {
      expect(hourToTimeValue(0)).toBe("00:00");
      expect(hourToTimeValue(8.5)).toBe("08:30");
      expect(hourToTimeValue(12)).toBe("12:00");
      expect(hourToTimeValue(19.75)).toBe("19:45");
      expect(hourToTimeValue(23.5)).toBe("23:30");
    });

    it("converts HTML time-input values into numeric hours", () => {
      expect(timeValueToHour("00:00")).toBe(0);
      expect(timeValueToHour("08:30")).toBe(8.5);
      expect(timeValueToHour("12:00")).toBe(12);
      expect(timeValueToHour("19:45")).toBe(19.75);
      expect(timeValueToHour("23:30")).toBe(23.5);
    });

    it("round-trips valid half-hour business times", () => {
      for (let hour = 0; hour < 24; hour += SNAP_HOURS) {
        const value = hourToTimeValue(hour);
        expect(timeValueToHour(value)).toBe(hour);
      }
    });

    it("retains the intended timeline configuration", () => {
      expect(SNAP_HOURS).toBe(0.5);
      expect(MIN_DURATION_HOURS).toBe(0.5);

      expect(AXIS_LABELS).toEqual([
        "12a",
        "3a",
        "6a",
        "9a",
        "12p",
        "3p",
        "6p",
        "9p",
        "12a",
      ]);
    });
  });

  describe("Weekly calendar", () => {
    it("returns seven dates in Sunday-first order", () => {
      // October 28, 2026 is a Wednesday.
      const week = getWeekDates(
        localDate(2026, 10, 28),
      );

      expect(week).toHaveLength(7);

      expect(week.map((date) => date.getDay())).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);

      expect(week.map(dateParts)).toEqual([
        [2026, 10, 25],
        [2026, 10, 26],
        [2026, 10, 27],
        [2026, 10, 28],
        [2026, 10, 29],
        [2026, 10, 30],
        [2026, 10, 31],
      ]);
    });

    it("returns the same week for every day in that week", () => {
      const sunday = getWeekDates(
        localDate(2026, 10, 25),
      );

      const saturday = getWeekDates(
        localDate(2026, 10, 31),
      );

      expect(sunday.map(toIsoDate)).toEqual(
        saturday.map(toIsoDate),
      );
    });

    it("handles a week crossing a month boundary", () => {
      const week = getWeekDates(
        localDate(2026, 11, 1),
      );

      expect(week.map(toIsoDate)).toEqual([
        "2026-11-01",
        "2026-11-02",
        "2026-11-03",
        "2026-11-04",
        "2026-11-05",
        "2026-11-06",
        "2026-11-07",
      ]);

      const previousWeek = getWeekDates(
        localDate(2026, 10, 31),
      );

      expect(previousWeek[0].getDate()).toBe(25);
      expect(previousWeek[6].getDate()).toBe(31);
    });

    it("handles a week crossing a year boundary", () => {
      // January 1, 2027 is a Friday.
      const week = getWeekDates(
        localDate(2027, 1, 1),
      );

      expect(week.map(toIsoDate)).toEqual([
        "2026-12-27",
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
      ]);
    });

    it("produces the correct displayed week label", () => {
      expect(
        getCurrentWeekLabel(localDate(2026, 10, 28)),
      ).toBe("10/25 - 10/31");

      expect(
        getCurrentWeekLabel(localDate(2027, 1, 1)),
      ).toBe("12/27 - 01/02");
    });

    it("does not modify the supplied reference date", () => {
      const reference = localDate(2026, 10, 28);
      const originalTime = reference.getTime();

      getWeekDates(reference);
      getCurrentWeekLabel(reference);

      expect(reference.getTime()).toBe(originalTime);
    });
  });

  describe("Holiday date formatting", () => {
    it("formats recurring holidays as MM-DD", () => {
      expect(
        toMonthDay(localDate(2026, 12, 25)),
      ).toBe("12-25");

      expect(
        toMonthDay(localDate(2026, 1, 1)),
      ).toBe("01-01");
    });

    it("formats one-time holidays as YYYY-MM-DD", () => {
      expect(
        toIsoDate(localDate(2026, 12, 25)),
      ).toBe("2026-12-25");

      expect(
        toIsoDate(localDate(2027, 1, 1)),
      ).toBe("2027-01-01");
    });

    it("preserves February 29 for a leap-year holiday", () => {
      const leapDay = localDate(2028, 2, 29);

      expect(toMonthDay(leapDay)).toBe("02-29");
      expect(toIsoDate(leapDay)).toBe("2028-02-29");
    });

    it("keeps recurring holiday identifiers year-independent", () => {
      const first = localDate(2026, 12, 25);
      const second = localDate(2027, 12, 25);

      expect(toMonthDay(first)).toBe(
        toMonthDay(second),
      );

      expect(toIsoDate(first)).not.toBe(
        toIsoDate(second),
      );
    });
  });
});
