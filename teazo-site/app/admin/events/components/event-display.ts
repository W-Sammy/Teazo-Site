import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
  EventStatus,
} from "@/app/types/admin-event";

// Display event times in Pacific time on both the server and the browser.
const EVENT_TIME_ZONE = "America/Los_Angeles";

// Use fixed month labels instead of browser-dependent abbreviations.
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
] as const;

export const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function getEventStatus(
  event: AdminEvent,
  now = Date.now(),
): EventStatus {
  if (now < Date.parse(event.startAt)) return "upcoming";
  if (now > Date.parse(event.endAt)) return "ended";
  return "active";
}

export function formatEventDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  const parts = eventDateFormatter.formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const month = MONTH_NAMES[Number(getPart("month")) - 1];
  const day = getPart("day");
  const year = getPart("year");
  const hour = getPart("hour");
  const minute = getPart("minute");

  if (!month || !day || !year || !hour || !minute) {
    return "Unknown";
  }

  // Convert the extracted 24-hour value into a consistent 12-hour display.
  const hour24 = Number(hour);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "AM" : "PM";

  // Build the string ourselves so Safari and the server use the same text.
  return `${month} ${Number(day)}, ${year} at ${hour12}:${minute.padStart(
    2,
    "0",
  )} ${period}`;
}

export function getTargetLabel(
  event: AdminEvent,
  categories: EventCategory[],
  items: EventCatalogItem[],
) {
  if (event.appliesToAll) return "All items";

  const parts: string[] = [];

  if (event.categoryIds.length > 0) {
    parts.push(
      `${event.categoryIds.length} ${
        event.categoryIds.length === 1 ? "category" : "categories"
      }`,
    );
  }

  if (event.itemIds.length > 0) {
    parts.push(
      `${event.itemIds.length} ${
        event.itemIds.length === 1 ? "item" : "items"
      }`,
    );
  }

  if (parts.length > 0) return parts.join(" + ");

  const knownIds = new Set([
    ...categories.map((category) => category.id),
    ...items.map((item) => item.id),
  ]);

  return knownIds.size > 0 ? "Nothing selected" : "Catalog unavailable";
}

export const statusClasses: Record<EventStatus, string> = {
  upcoming: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  ended: "bg-gray-100 text-gray-600",
};