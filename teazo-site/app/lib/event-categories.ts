import "server-only";

import type { AdminEvent, EventCategory, EventItem } from "@/app/types/admin-event";

/** Resolve only categories used by the public events; no browser request needed. */
export async function getEventCategories(events: AdminEvent[]): Promise<EventCategory[]> {
  const selectedIds = new Set(
    events.filter((event) => !event.appliesToAll).flatMap((event) => event.categoryIds),
  );
  if (selectedIds.size === 0) return [];

  const { squareClient } = await import("@/app/lib/square");
  const result = await squareClient.catalog.list({ types: "CATEGORY" });
  const categories: EventCategory[] = [];
  for await (const category of result) {
    if (category.type !== "CATEGORY" || !category.id || !selectedIds.has(category.id)) continue;
    const name = category.categoryData?.name?.trim();
    if (name) categories.push({ id: category.id, name });
  }
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve explicitly selected items, separately from category membership. */
export async function getEventItems(events: AdminEvent[]): Promise<EventItem[]> {
  const selectedIds = new Set(
    events.filter((event) => !event.appliesToAll).flatMap((event) => event.itemIds),
  );
  if (selectedIds.size === 0) return [];

  const { squareClient } = await import("@/app/lib/square");
  const result = await squareClient.catalog.list({ types: "ITEM" });
  const items: EventItem[] = [];
  for await (const item of result) {
    if (item.type !== "ITEM" || !item.id || !selectedIds.has(item.id)) continue;
    const name = item.itemData?.name?.trim();
    if (name) items.push({ id: item.id, name });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}
