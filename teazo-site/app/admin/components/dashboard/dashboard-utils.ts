import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { MenuItemMetric } from "@/app/types/dashboard";

export function formatHour(hour: number) {
  const wholeHour = Math.floor(hour) % 24;
  const minutes = Math.round((hour % 1) * 60);
  const period = wholeHour >= 12 ? "pm" : "am";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")}${period}`;
}

export function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }).format(new Date(date));
}

export function isEventActive(event: AdminEvent) {
  const now = Date.now();
  return new Date(event.startAt).getTime() <= now && now <= new Date(event.endAt).getTime();
}

export function getTodayHours(content: WebsiteContent) {
  return content.hours[new Date().getDay()] ?? content.hours[0];
}

export function getTodayHoliday(content: WebsiteContent) {
  const today = new Date();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return content.holidays.find((holiday) => holiday.date === monthDay);
}

export function sortMetrics(metrics: MenuItemMetric[]) {
  return [...metrics].sort((a, b) => b.event_count - a.event_count).slice(0, 5);
}
