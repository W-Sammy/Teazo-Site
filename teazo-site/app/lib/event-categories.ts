import "server-only";

import { unstable_cache } from "next/cache";

import type { AdminEvent, EventCategory, EventItem } from "@/app/types/admin-event";

// Square accepts up to 1,000 object IDs per BatchRetrieveCatalogObjects call.
const BATCH_GET_LIMIT = 1000;
// Event names only appear in the modal; a minute of staleness matches the menu catalog cache.
const NAME_CACHE_SECONDS = 60;

type CatalogName = { id: string; type: "CATEGORY" | "ITEM"; name: string };

/* Fetch only the selected catalog objects by ID, since listing the whole catalog is slower as it grows.
   Only slim rows are returned so the result is safe to cache (raw Square objects hold bigint values). */
const getCatalogNames = unstable_cache(
  async (ids: string[]): Promise<CatalogName[]> => {
    const { squareClient } = await import("@/app/lib/square");
    const batches: string[][] = [];
    for (let start = 0; start < ids.length; start += BATCH_GET_LIMIT) {
      batches.push(ids.slice(start, start + BATCH_GET_LIMIT));
    }
    const responses = await Promise.all(
      batches.map((objectIds) => squareClient.catalog.batchGet({ objectIds })),
    );

    const names: CatalogName[] = [];
    for (const object of responses.flatMap((response) => response.objects ?? [])) {
      if (object.isDeleted || !object.id) continue;
      if (object.type === "CATEGORY") {
        const name = object.categoryData?.name?.trim();
        if (name) names.push({ id: object.id, type: "CATEGORY", name });
      } else if (object.type === "ITEM") {
        const name = object.itemData?.name?.trim();
        if (name) names.push({ id: object.id, type: "ITEM", name });
      }
    }
    return names;
  },
  ["event-catalog-names"],
  { revalidate: NAME_CACHE_SECONDS },
);

/** Sorted so the same selection always produces the same cache key. */
function selectedIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Resolve only categories used by the public events; no browser request needed. */
export async function getEventCategories(events: AdminEvent[]): Promise<EventCategory[]> {
  const ids = selectedIds(
    events.filter((event) => !event.appliesToAll).flatMap((event) => event.categoryIds),
  );
  if (ids.length === 0) return [];

  const wanted = new Set(ids);
  const categories = (await getCatalogNames(ids))
    .filter((entry) => entry.type === "CATEGORY" && wanted.has(entry.id))
    .map(({ id, name }) => ({ id, name }));
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve explicitly selected items, separately from category membership. */
export async function getEventItems(events: AdminEvent[]): Promise<EventItem[]> {
  const ids = selectedIds(
    events.filter((event) => !event.appliesToAll).flatMap((event) => event.itemIds),
  );
  if (ids.length === 0) return [];

  const wanted = new Set(ids);
  const items = (await getCatalogNames(ids))
    .filter((entry) => entry.type === "ITEM" && wanted.has(entry.id))
    .map(({ id, name }) => ({ id, name }));
  return items.sort((a, b) => a.name.localeCompare(b.name));
}
