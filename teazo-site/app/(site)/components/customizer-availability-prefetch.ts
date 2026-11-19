import type { MenuItem } from "@/app/types/menu-item";

// Also bounds reuse of a cart Edit response on subsequent openings.
const PREFETCH_TTL_MS = 10_000;

export interface ItemAvailabilitySnapshot {
  item: MenuItem;
  fetchedAt: number;
}

export function isFreshItemAvailability(
  snapshot: ItemAvailabilitySnapshot | null | undefined,
  catalogObjectId: string,
): snapshot is ItemAvailabilitySnapshot {
  const age = snapshot ? Date.now() - snapshot.fetchedAt : NaN;
  return snapshot?.item.catalogObjectId === catalogObjectId && age >= 0 && age <= PREFETCH_TTL_MS;
}

/** Parse once; both the cart and customizer use the resulting data, never a shared body. */
export async function readItemAvailability(
  catalogObjectId: string,
  response: Response,
): Promise<ItemAvailabilitySnapshot> {
  if (!response.ok) throw new Error("Unable to load drink options from Square.");
  const item: MenuItem = await response.json();
  if (item.catalogObjectId !== catalogObjectId) throw new Error("Square returned a different drink. Please try again.");
  return { item, fetchedAt: Date.now() };
}

export async function fetchItemAvailability(
  catalogObjectId: string,
  signal: AbortSignal,
): Promise<ItemAvailabilitySnapshot> {
  return readItemAvailability(catalogObjectId, await fetch(availabilityUrl(catalogObjectId), { cache: "no-store", signal }));
}

const pending = new Map<string, { response: Promise<Response>; startedAt: number }>();

export function availabilityUrl(catalogObjectId: string): string {
  return `/api/square/products/${encodeURIComponent(catalogObjectId)}`;
}

export function prefetchItemAvailability(catalogObjectId: string): void {
  const response = fetch(availabilityUrl(catalogObjectId), { cache: "no-store" });
  pending.set(catalogObjectId, { response, startedAt: Date.now() });
  response.catch(() => {
    // The customizer shows the failure if it consumes this request; otherwise it is dropped.
    if (pending.get(catalogObjectId)?.response === response) pending.delete(catalogObjectId);
  });
}

/** Returns the early request for this item once, or null if absent or older than the TTL. */
export function takePrefetchedAvailability(catalogObjectId: string): Promise<Response> | null {
  const entry = pending.get(catalogObjectId);
  pending.delete(catalogObjectId);
  if (!entry || Date.now() - entry.startedAt > PREFETCH_TTL_MS) return null;
  return entry.response;
}
