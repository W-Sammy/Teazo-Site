import type { PickupTiming } from "@/app/types/checkout";
import type {
  WebsiteContent,
  Holiday,
  ContactHour,
} from "@/app/types/website-content";

export const STORE_TIMEZONE = "America/Los_Angeles";
export const PREP_LEAD_TIME_MINUTES = 25;
export const PREP_LEAD_TIME_GRACE_MINUTES = 3;
export const ORDER_CUTOFF_MINUTES_BEFORE_CLOSE = 30;

export interface PacificDateParts {
  date: Date;
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  dayOfWeekIndex: number; // 0=Sunday .. 6=Saturday
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  minuteOfDay: number; // hour * 60 + minute
  isoDateString: string; // "YYYY-MM-DD"
  monthDayString: string; // "MM-DD" for holiday matching
}

export interface DaySchedule {
  closed: boolean;
  openMinuteOfDay: number;
  closeMinuteOfDay: number;
  cutoffMinuteOfDay: number;
  openHour: number;
  closeHour: number;
  holiday?: Holiday;
}

export interface TimeValidationResult {
  valid: boolean;
  error?: string;
  pickupTimeIsoUtc?: string;
}

/**
 * Formats a minute of the day (0-1439) into a readable 12-hour string (e.g. 660 -> "11:00 AM").
 */
export function formatMinuteOfDay(minuteOfDay: number): string {
  const totalMinutes = ((minuteOfDay % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

/**
 * Parses a 12-hour or 24-hour time string into a decimal hour (e.g. "1:00 PM" -> 13, "9:30 AM" -> 9.5).
 */
export function parse12HourToDecimal(timeStr: string | null | undefined): number | undefined {
  if (!timeStr) return undefined;
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed.toLowerCase() === "closed") return undefined;

  // 12-hour format: "1:00 AM", "05:30 PM", "1pm"
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = match12[2] ? parseInt(match12[2], 10) : 0;
    const period = match12[3].toUpperCase();
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    return hour + minute / 60;
  }

  // 24-hour format: "13:00", "09:30"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    const minute = parseInt(match24[2], 10);
    return hour + minute / 60;
  }

  return undefined;
}

/**
 * Parses a display time range string like "1:00 AM - 5:00 PM" into decimal start/end hours.
 */
export function parseDisplayTextRange(displayText: string | null | undefined): {
  start?: number;
  end?: number;
} {
  if (!displayText) return {};
  const cleaned = displayText.trim();
  if (!cleaned || cleaned.toLowerCase() === "closed") return {};

  const parts = cleaned.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return {};

  const start = parse12HourToDecimal(parts[0]);
  const end = parse12HourToDecimal(parts[1]);

  if (start !== undefined && end !== undefined) {
    return { start, end };
  }
  return {};
}

/**
 * Extracts date and time components formatted in Pacific Time (America/Los_Angeles).
 */
export function getPacificParts(date: Date = new Date()): PacificDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeekIndex = Math.max(0, WEEKDAYS.indexOf(weekdayShort));

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const second = getPart("second");

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoDateString = `${year}-${pad(month)}-${pad(day)}`;
  const monthDayString = `${pad(month)}-${pad(day)}`;

  return {
    date,
    year,
    month,
    day,
    dayOfWeekIndex,
    hour,
    minute,
    second,
    minuteOfDay: hour * 60 + minute,
    isoDateString,
    monthDayString,
  };
}

/**
 * Converts a Pacific Time date and time into a precise UTC Date object,
 * properly accounting for Daylight Saving Time (PDT vs PST).
 */
export function pacificToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guessUtc);

  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const localAsUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour"),
    getPart("minute"),
    getPart("second"),
  );
  const offsetMs = localAsUtc - guessUtc.getTime();

  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offsetMs);
}

/**
 * Resolves the effective operating hours for a given date from website content,
 * evaluating holiday exceptions first and falling back to weekly day-of-week hours.
 */
export function getStoreScheduleForDate(
  date: Date,
  content: WebsiteContent,
): DaySchedule {
  const parts = getPacificParts(date);

  // 1. Check for holiday exception matching MM-DD
  const holiday = content.holidays?.find((h) => h.date === parts.monthDayString);
  if (holiday) {
    if (holiday.closed) {
      return {
        closed: true,
        openMinuteOfDay: 0,
        closeMinuteOfDay: 0,
        cutoffMinuteOfDay: 0,
        openHour: 0,
        closeHour: 0,
        holiday,
      };
    }

    let startHour = holiday.start;
    let endHour = holiday.end;

    // If start or end are missing, parse from displayText if available
    if ((startHour === undefined || endHour === undefined) && holiday.displayText) {
      const parsed = parseDisplayTextRange(holiday.displayText);
      if (parsed.start !== undefined) startHour = parsed.start;
      if (parsed.end !== undefined) endHour = parsed.end;
    }

    startHour = startHour ?? 9;
    endHour = endHour ?? 17;

    const openMinuteOfDay = Math.round(startHour * 60);
    const closeMinuteOfDay = Math.round(endHour * 60);
    const cutoffMinuteOfDay = Math.max(
      openMinuteOfDay,
      closeMinuteOfDay - ORDER_CUTOFF_MINUTES_BEFORE_CLOSE,
    );
    return {
      closed: false,
      openMinuteOfDay,
      closeMinuteOfDay,
      cutoffMinuteOfDay,
      openHour: startHour,
      closeHour: endHour,
      holiday,
    };
  }

  // 2. Weekly hours (0=Sun .. 6=Sat)
  const dayHours = content.hours[parts.dayOfWeekIndex] ?? content.hours[0];
  if (!dayHours || dayHours.closed) {
    return {
      closed: true,
      openMinuteOfDay: 0,
      closeMinuteOfDay: 0,
      cutoffMinuteOfDay: 0,
      openHour: 0,
      closeHour: 0,
    };
  }

  const startHour = dayHours.start;
  const endHour = dayHours.end;
  const openMinuteOfDay = Math.round(startHour * 60);
  const closeMinuteOfDay = Math.round(endHour * 60);
  const cutoffMinuteOfDay = Math.max(
    openMinuteOfDay,
    closeMinuteOfDay - ORDER_CUTOFF_MINUTES_BEFORE_CLOSE,
  );

  return {
    closed: false,
    openMinuteOfDay,
    closeMinuteOfDay,
    cutoffMinuteOfDay,
    openHour: startHour,
    closeHour: endHour,
  };
}

/**
 * Checks whether the physical store is currently accepting online pickup orders
 * based on the database schedule and order cutoff time.
 */
export function isStoreOpenForOrders(
  content: WebsiteContent,
  referenceNow: Date = new Date(),
): boolean {
  const parts = getPacificParts(referenceNow);
  const schedule = getStoreScheduleForDate(referenceNow, content);
  if (schedule.closed) return false;
  return (
    parts.minuteOfDay >= schedule.openMinuteOfDay &&
    parts.minuteOfDay <= schedule.cutoffMinuteOfDay
  );
}

/**
 * Validates requested pickup timing (ASAP or SCHEDULED) against database store hours
 * and holiday exceptions. Automatically queries `getWebsiteContent()` if not provided.
 */
export async function validatePickupTiming(
  timing: PickupTiming,
  options?: {
    content?: WebsiteContent;
    referenceNow?: Date;
  },
): Promise<TimeValidationResult> {
  const referenceNow = options?.referenceNow ?? new Date();
  let content = options?.content;
  if (!content) {
    const { getWebsiteContent } = await import("@/app/lib/website-content");
    content = await getWebsiteContent();
  }
  const nowParts = getPacificParts(referenceNow);
  const todaySchedule = getStoreScheduleForDate(referenceNow, content);

  if (timing.type === "ASAP") {
    if (todaySchedule.closed) {
      const holidayMsg = todaySchedule.holiday ? ` for ${todaySchedule.holiday.name}` : "";
      return {
        valid: false,
        error: `Store is currently closed${holidayMsg}. Online ordering is unavailable today.`,
      };
    }

    if (nowParts.minuteOfDay < todaySchedule.openMinuteOfDay) {
      return {
        valid: false,
        error: `Store is currently closed for online ordering. Orders open at ${formatMinuteOfDay(todaySchedule.openMinuteOfDay)} PT.`,
      };
    }

    if (nowParts.minuteOfDay > todaySchedule.cutoffMinuteOfDay) {
      return {
        valid: false,
        error: `Store is closed for new orders. Same-day online ordering cutoff is ${formatMinuteOfDay(todaySchedule.cutoffMinuteOfDay)} PT (closing at ${formatMinuteOfDay(todaySchedule.closeMinuteOfDay)} PT).`,
      };
    }

    const asapTimeUtc = new Date(referenceNow.getTime() + PREP_LEAD_TIME_MINUTES * 60 * 1000);
    return {
      valid: true,
      pickupTimeIsoUtc: asapTimeUtc.toISOString(),
    };
  }

  if (timing.type === "SCHEDULED") {
    if (!timing.pickupAt || typeof timing.pickupAt !== "string" || !timing.pickupAt.trim()) {
      return {
        valid: false,
        error: "Scheduled pickup time (pickupAt) is required.",
      };
    }

    const pickupDate = new Date(timing.pickupAt);
    if (Number.isNaN(pickupDate.getTime())) {
      return {
        valid: false,
        error: "Scheduled pickup time must be a valid ISO-8601 date timestamp.",
      };
    }

    const pickupParts = getPacificParts(pickupDate);

    // Enforce same-day pickup
    if (pickupParts.isoDateString !== nowParts.isoDateString) {
      return {
        valid: false,
        error: "Scheduled pickup orders are only available for same-day pickup.",
      };
    }

    if (todaySchedule.closed) {
      const holidayMsg = todaySchedule.holiday ? ` for ${todaySchedule.holiday.name}` : "";
      return {
        valid: false,
        error: `Store is closed today${holidayMsg}. Pickup orders are unavailable.`,
      };
    }

    // Enforce prep lead time with a grace buffer for form submission delay.
    // Allows slots selected within the session (~22-25m) without false 400 rejection,
    // while strictly ensuring the pickup time is in the future.
    const effectiveLeadTimeMinutes = Math.max(1, PREP_LEAD_TIME_MINUTES - PREP_LEAD_TIME_GRACE_MINUTES);
    const minPickupTimeMs = referenceNow.getTime() + effectiveLeadTimeMinutes * 60 * 1000;
    if (pickupDate.getTime() < minPickupTimeMs) {
      return {
        valid: false,
        error: `Scheduled pickup must be at least ${PREP_LEAD_TIME_MINUTES} minutes from now. Please select an updated pickup time.`,
      };
    }

    // Enforce store operating window [openMinuteOfDay, cutoffMinuteOfDay]
    if (pickupParts.minuteOfDay < todaySchedule.openMinuteOfDay) {
      return {
        valid: false,
        error: `Scheduled pickup cannot be earlier than store opening (${formatMinuteOfDay(todaySchedule.openMinuteOfDay)} PT).`,
      };
    }

    if (pickupParts.minuteOfDay > todaySchedule.cutoffMinuteOfDay) {
      return {
        valid: false,
        error: `Scheduled pickup cannot be later than ${formatMinuteOfDay(todaySchedule.cutoffMinuteOfDay)} PT (store closes at ${formatMinuteOfDay(todaySchedule.closeMinuteOfDay)} PT).`,
      };
    }

    return {
      valid: true,
      pickupTimeIsoUtc: pickupDate.toISOString(),
    };
  }

  return {
    valid: false,
    error: 'Invalid pickup timing type. Expected "ASAP" or "SCHEDULED".',
  };
}

/**
 * Returns available 15-minute pickup slots for today in ISO-8601 UTC format
 * based on the database-backed schedule and order cutoff time.
 */
export function getAvailablePickupSlots(
  content: WebsiteContent,
  referenceNow: Date = new Date(),
): string[] {
  const nowParts = getPacificParts(referenceNow);
  const todaySchedule = getStoreScheduleForDate(referenceNow, content);

  if (todaySchedule.closed || nowParts.minuteOfDay > todaySchedule.cutoffMinuteOfDay) {
    return [];
  }

  // Earliest pickup is at least now + 25m prep time
  const minLeadTimeMs = referenceNow.getTime() + PREP_LEAD_TIME_MINUTES * 60 * 1000;
  const minLeadParts = getPacificParts(new Date(minLeadTimeMs));

  const earliestMinuteRaw = Math.max(todaySchedule.openMinuteOfDay, minLeadParts.minuteOfDay);
  const roundedMinute = Math.ceil(earliestMinuteRaw / 15) * 15;

  const slots: string[] = [];
  for (let m = roundedMinute; m <= todaySchedule.cutoffMinuteOfDay; m += 15) {
    const slotHour = Math.floor(m / 60);
    const slotMin = m % 60;
    const slotUtc = pacificToUtc(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      slotHour,
      slotMin,
    );
    slots.push(slotUtc.toISOString());
  }

  return slots;
}

export const WEEKDAY_NAMES_FROM_MONDAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Returns formatted weekly customer hours for Monday through Sunday.
 * Automatically checks for any holiday exceptions falling in the current week (or reference week)
 * and adjusts the operating hours and holiday tags accordingly.
 */
export function getWeeklyCustomerHours(
  content: WebsiteContent,
  referenceDate: Date = new Date(),
): ContactHour[] {
  const nowParts = getPacificParts(referenceDate);
  // dayOfWeekIndex: 0=Sunday, 1=Monday, ..., 6=Saturday
  // In Monday-first week: Monday is offset 0, Sunday is offset 6
  const daysSinceMonday = (nowParts.dayOfWeekIndex + 6) % 7;

  return WEEKDAY_NAMES_FROM_MONDAY.map((dayName, monIdx) => {
    const dayOffset = monIdx - daysSinceMonday;

    // Midday in Pacific Time on referenceDate
    const basePacificMidday = pacificToUtc(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      12,
      0,
    );

    const dayDate = new Date(
      basePacificMidday.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const schedule = getStoreScheduleForDate(dayDate, content);

    const isHoliday = Boolean(schedule.holiday);
    const holidayName = schedule.holiday?.name;

    let hoursText: string;
    if (schedule.closed) {
      hoursText = "Closed";
    } else {
      hoursText = `${formatMinuteOfDay(schedule.openMinuteOfDay)} - ${formatMinuteOfDay(schedule.closeMinuteOfDay)}`;
    }

    return {
      day: dayName,
      hours: hoursText,
      isHoliday,
      holidayName,
    };
  });
}

/**
 * Returns the effective schedule for today in Pacific Time,
 * taking into account holiday exceptions and regular weekly hours.
 */
export function getTodayStoreSchedule(
  content: WebsiteContent,
  referenceNow: Date = new Date(),
): DaySchedule {
  return getStoreScheduleForDate(referenceNow, content);
}
