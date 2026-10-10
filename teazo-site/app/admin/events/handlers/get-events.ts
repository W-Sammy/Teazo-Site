import type { AdminEvent } from "@/app/types/admin-event";
import { listEvents } from "@/app/lib/queries/events";

/**
 * Loads the initial events for the admin page from D1.
 */
export async function getEvents(): Promise<AdminEvent[]> {
  return listEvents();
}
