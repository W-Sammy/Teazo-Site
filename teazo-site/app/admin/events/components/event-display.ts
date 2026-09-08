import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
  EventStatus,
} from "@/app/types/admin-event";

export const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function getEventStatus(event: AdminEvent, now = Date.now()): EventStatus {
  if (now < Date.parse(event.startAt)) return "upcoming";
  if (now > Date.parse(event.endAt)) return "ended";
  return "active";
}

export function formatEventDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : eventDateFormatter.format(date);
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
      `${event.categoryIds.length} ${event.categoryIds.length === 1 ? "category" : "categories"}`,
    );
  }
  if (event.itemIds.length > 0) {
    parts.push(`${event.itemIds.length} ${event.itemIds.length === 1 ? "item" : "items"}`);
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
