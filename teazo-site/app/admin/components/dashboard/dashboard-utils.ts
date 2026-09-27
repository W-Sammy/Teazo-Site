import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { MenuItemMetric } from "@/app/types/dashboard";

const SHOP_TIME_ZONE = "America/Los_Angeles";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatHour(hour: number) {
  const wholeHour = Math.floor(hour) % 24;
  const minutes = Math.round((hour % 1) * 60);
  const period = wholeHour >= 12 ? "pm" : "am";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")}${period}`;
}

export function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(new Date(date));
}

export function isEventActive(event: AdminEvent) {
  const now = Date.now();
  return new Date(event.startAt).getTime() <= now && now <= new Date(event.endAt).getTime();
}

export function getTodayHours(content: WebsiteContent) {
  return content.hours[shopToday().dayIndex] ?? content.hours[0];
}

export function getTodayHoliday(content: WebsiteContent) {
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
