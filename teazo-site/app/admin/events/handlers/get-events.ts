import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AdminEvent } from "@/app/types/admin-event";
import { prepare } from "@/app/lib/d1";
import { toPublicUrl } from "@/app/lib/media";

const FALLBACK_EVENT_IMAGE = "/carousel_images/fresh_leaf.jpg";

type EventRow = {
  id: string;
  name: string;
  description: string;
  start_at: string;
  end_at: string;
  applies_to_all: number;
  image_key: string | null;
  category_ids: string | null;
  item_ids: string | null;
};

/**
 * Loads the initial events for the admin page.
 * Replace this local file read with the database/API request later.
 */
export async function getEvents(): Promise<AdminEvent[]> {
  if (process.env.D1_PROXY_URL && process.env.PROXY_TOKEN) {
    const { results } = await prepare(
      `SELECT
         e.id,
         e.name,
         e.description,
         e.start_at,
         e.end_at,
         e.applies_to_all,
         media.r2_key AS image_key,
         GROUP_CONCAT(DISTINCT ec.square_category_id) AS category_ids,
         GROUP_CONCAT(DISTINCT ei.square_catalog_object_id) AS item_ids
       FROM event AS e
       LEFT JOIN media_asset AS media
         ON media.id = e.image_media_id AND media.deleted_at IS NULL
       LEFT JOIN event_category AS ec ON ec.event_id = e.id
       LEFT JOIN event_item AS ei ON ei.event_id = e.id
       WHERE e.deleted_at IS NULL
       GROUP BY e.id
       ORDER BY e.start_at ASC, e.id ASC`,
    ).all<EventRow>();

    return results.map((event) => ({
      id: event.id,
      name: event.name,
      description: event.description,
      imageUrl: event.image_key && process.env.R2_PUBLIC_BASE
        ? toPublicUrl(event.image_key)
        : FALLBACK_EVENT_IMAGE,
      startAt: event.start_at,
      endAt: event.end_at,
      appliesToAll: Boolean(event.applies_to_all),
      categoryIds: event.category_ids ? event.category_ids.split(",") : [],
      itemIds: event.item_ids ? event.item_ids.split(",") : [],
    }));
  }

  const filePath = path.join(
    process.cwd(),
    "app",
    "admin",
    "events",
    "components",
    "sample-events.txt",
  );
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as AdminEvent[];
}

/** Events that are live at request time for the public site. */
export async function getLiveEvents(): Promise<AdminEvent[]> {
  const now = Date.now();
  const events = await getEvents();

  return events.filter(
    (event) => Date.parse(event.startAt) <= now && now <= Date.parse(event.endAt),
  );
}
