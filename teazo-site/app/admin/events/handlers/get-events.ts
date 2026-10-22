import type { AdminEvent } from "@/app/types/admin-event";
import { listEvents } from "@/app/lib/queries/events";

/**
 * Loads the initial events for the admin page from D1.
 */
export async function getEvents(): Promise<AdminEvent[]> {
  return listEvents();
}

/** Events that are live at request time for the public site. */
export async function getLiveEvents(): Promise<AdminEvent[]> {
  const now = Date.now();
  const events = await getEvents();

  return events.filter(
    (event) => Date.parse(event.startAt) <= now && now <= Date.parse(event.endAt),
  );
}
