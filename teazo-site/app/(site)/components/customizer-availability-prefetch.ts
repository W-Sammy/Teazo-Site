// Deep links start the availability request while the page hydrates; the customizer consumes it once.
const PREFETCH_TTL_MS = 10_000;

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
