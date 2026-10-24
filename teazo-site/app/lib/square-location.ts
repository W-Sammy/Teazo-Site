import { squareClient } from "@/app/lib/square";
import { getSquareEnvironment } from "@/app/lib/square-config";

let cachedLocationId: string | null = null;
let pendingDiscovery: Promise<string> | null = null;

/**
 * Resolves the active Square location ID for orders, fulfillments, and hosted checkout payment links.
 *
 * Resolution hierarchy:
 * 1. Environment variable: `process.env.SQUARE_LOCATION_ID` (required in production)
 * 2. In-memory process cache: `cachedLocationId` (sandbox only)
 * 3. Dynamic Square API lookup (sandbox only), shared by concurrent callers
 */
export async function resolveSquareLocationId(): Promise<string> {
  const envLocationId = process.env.SQUARE_LOCATION_ID?.trim();
  if (envLocationId) {
    return envLocationId;
  }

  if (getSquareEnvironment() === "production") {
    throw new Error(
      'SQUARE_LOCATION_ID is required when SQUARE_ENVIRONMENT is "production".',
    );
  }

  if (cachedLocationId) {
    return cachedLocationId;
  }

  if (!pendingDiscovery) {
    pendingDiscovery = squareClient.locations.list().then((response) => {
      const locations = response.locations ?? [];
      const activeLocation =
        locations.find((l) => l.status === "ACTIVE") ?? locations[0];

      if (!activeLocation?.id) {
        throw new Error(
          "No active Square location found for the configured merchant account.",
        );
      }

      return activeLocation.id;
    });
  }

  const discovery = pendingDiscovery;
  try {
    const locationId = await discovery;
    // A lookup started before a cache clear must not repopulate the cache.
    if (pendingDiscovery === discovery) cachedLocationId = locationId;
    return locationId;
  } finally {
    // Failed lookups can be retried; an older lookup cannot clear a newer one.
    if (pendingDiscovery === discovery) pendingDiscovery = null;
  }
}

/**
 * Clears the in-memory cached location ID.
 * Useful for automated tests or when switching accounts/locations dynamically.
 */
export function clearCachedSquareLocationId(): void {
  cachedLocationId = null;
  pendingDiscovery = null;
}
