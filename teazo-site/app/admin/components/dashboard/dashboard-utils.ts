import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { MenuItemMetric, PageMetric } from "@/app/types/dashboard";

const SHOP_TIME_ZONE = "America/Los_Angeles";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatHour(hour: number) {
  const wholeHour = Math.floor(hour) % 24;
  const minutes = Math.round((hour % 1) * 60);
  const period = wholeHour >= 12 ? "pm" : "am";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")}${period}`;
}

export function formatEventDate(date: string | null) {
  // Missing dates are intentional for events without a fixed schedule.
  if (date === null) return "";

  const parsedDate = new Date(date);

  if (!Number.isFinite(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(parsedDate);
}

// Preserve the dashboard's compact date formatting while
// supporting events with either or both dates omitted.
export function formatEventDuration(
  startAt: string | null,
  endAt: string | null,
): string {
  if (startAt !== null && endAt !== null) {
    return `${formatEventDate(startAt)} – ${formatEventDate(endAt)}`;
  }

  if (startAt !== null) {
    return `Starts ${formatEventDate(startAt)}`;
  }

  if (endAt !== null) {
    return `Ends ${formatEventDate(endAt)}`;
  }

  return "";
}

export function isEventActive(event: AdminEvent) {
  const now = Date.now();

  // A missing start date imposes no start restriction.
  // A missing end date imposes no expiration restriction.
  return (
    (event.startAt === null || Date.parse(event.startAt) <= now) &&
    (event.endAt === null || Date.parse(event.endAt) >= now)
  );
}

export function getTodayHours(content?: WebsiteContent | null) {
  if (!content?.hours?.length) return undefined;
  return content.hours[shopToday().dayIndex] ?? content.hours[0];
}

export function getTodayHoliday(content?: WebsiteContent | null) {
  if (!content?.holidays) return undefined;
  return content.holidays.find((holiday) => holiday.date === shopToday().monthDay);
}

function shopToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";

  const weekday = WEEKDAYS.indexOf(part("weekday") as typeof WEEKDAYS[number]);

  return {
    dayIndex: weekday >= 0 ? weekday : 0,
    monthDay: `${part("month")}-${part("day")}`,
  };
}

export function sortMetrics(metrics: MenuItemMetric[]) {
  return [...metrics].sort((a, b) => b.event_count - a.event_count).slice(0, 5);
}

export function sortPageMetrics(metrics: PageMetric[]) {
  return [...metrics].sort((a, b) => b.event_count - a.event_count).slice(0, 5);
}