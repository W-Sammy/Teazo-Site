import { squareClient } from "@/app/lib/square";

let cachedLocationId: string | null = null;

/**
 * Resolves the active Square location ID for orders, fulfillments, and hosted checkout payment links.
 *
 * Resolution hierarchy:
 * 1. Environment variable: `process.env.SQUARE_LOCATION_ID`
 * 2. In-memory process cache: `cachedLocationId`
 * 3. Dynamic Square API lookup: `squareClient.locations.list()`
 */
export async function resolveSquareLocationId(): Promise<string> {
  const envLocationId = process.env.SQUARE_LOCATION_ID?.trim();
  if (envLocationId) {
    return envLocationId;
  }

  if (cachedLocationId) {
    return cachedLocationId;
  }

  const response = await squareClient.locations.list();
  const locations = response.locations ?? [];
  const activeLocation =
    locations.find((l) => l.status === "ACTIVE") ?? locations[0];

  if (!activeLocation?.id) {
    throw new Error(
      "No active Square location found for the configured merchant account.",
    );
  }

  cachedLocationId = activeLocation.id;
  return cachedLocationId;
}

/**
 * Clears the in-memory cached location ID.
 * Useful for automated tests or when switching accounts/locations dynamically.
 */
export function clearCachedSquareLocationId(): void {
  cachedLocationId = null;
}
