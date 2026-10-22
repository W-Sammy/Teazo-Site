import { batch, prepare } from "@/app/lib/d1";
import { toPublicUrl, type StoredMedia } from "@/app/lib/media";
import type { AdminEvent } from "@/app/types/admin-event";

type EventRow = {
  id: string;
  name: string;
  description: string;
  start_at: string;
  end_at: string;
  applies_to_all: number;
  image_r2_key: string | null;
};

type TargetRow = {
  event_id: string;
  target_id: string;
  target_type: "item" | "category";
};

type EventMediaRow = {
  image_media_id: string | null;
};

export type EventInput = {
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  appliesToAll: boolean;
  categoryIds: string[];
  itemIds: string[];
};

const fallbackImage = "/admin_icons/admin_svg/teazo_dash_icon.svg";

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function mapEvent(row: EventRow, targets: TargetRow[]): AdminEvent {
  const eventTargets = targets.filter((target) => target.event_id === row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_r2_key ? toPublicUrl(row.image_r2_key) : fallbackImage,
    startAt: row.start_at,
    endAt: row.end_at,
    appliesToAll: row.applies_to_all === 1,
    categoryIds: eventTargets
      .filter((target) => target.target_type === "category")
      .map((target) => target.target_id),
    itemIds: eventTargets
      .filter((target) => target.target_type === "item")
      .map((target) => target.target_id),
  };
}

export async function listEvents(): Promise<AdminEvent[]> {
  const [eventResult, targetResult] = await Promise.all([
    prepare(
      `SELECT event.id, event.name, event.description, event.start_at,
              event.end_at, event.applies_to_all, media.r2_key AS image_r2_key
         FROM event
         LEFT JOIN media_asset AS media
           ON media.id = event.image_media_id
          AND media.deleted_at IS NULL
        WHERE event.deleted_at IS NULL
        ORDER BY event.start_at ASC, event.id ASC`,
    ).all<EventRow>(),
    prepare(
      `SELECT event_id, square_catalog_object_id AS target_id, 'item' AS target_type
         FROM event_item
        WHERE square_env = 'sandbox'
        UNION ALL
       SELECT event_id, square_category_id AS target_id, 'category' AS target_type
         FROM event_category`,
    ).all<TargetRow>(),
  ]);

  return eventResult.results.map((row) => mapEvent(row, targetResult.results));
}

export async function listActiveEvents(): Promise<AdminEvent[]> {
  const events = await listEvents();
  const now = Date.now();
  return events.filter((event) => Date.parse(event.startAt) <= now && Date.parse(event.endAt) >= now);
}

export async function eventExists(id: string): Promise<boolean> {
  const row = await prepare(
    "SELECT id FROM event WHERE id = ?1 AND deleted_at IS NULL",
  ).bind(id).first<{ id: string }>();
  return row !== null;
}

function targetInsertStatements(
  eventId: string,
  input: EventInput,
  squareEnv: "sandbox" | "production",
) {
  const statements = [] as ReturnType<typeof prepare>[];
  const categoryIds = normalizeIds(input.categoryIds);
  const itemIds = normalizeIds(input.itemIds);

  if (categoryIds.length > 0) {
    const placeholders = categoryIds.map((_, index) => `(?${index * 3 + 1}, ?${index * 3 + 2}, ?${index * 3 + 3})`).join(",");
    statements.push(
      prepare(
        `INSERT INTO event_category (event_id, square_category_id, square_env) VALUES ${placeholders}`,
      ).bind(...categoryIds.flatMap((id) => [eventId, id, squareEnv])),
    );
  }

  if (itemIds.length > 0) {
    const placeholders = itemIds.map((_, index) => `(?${index * 3 + 1}, ?${index * 3 + 2}, ?${index * 3 + 3})`).join(",");
    statements.push(
      prepare(
        `INSERT INTO event_item (event_id, square_catalog_object_id, square_env) VALUES ${placeholders}`,
      ).bind(...itemIds.flatMap((id) => [eventId, id, squareEnv])),
    );
  }

  return statements;
}

export async function createEvent(
  input: EventInput,
  adminId: string,
  media?: { id: string; stored: StoredMedia; mimeType: string; originalFilename: string; adminId: string },
  squareEnv: "sandbox" | "production" = "sandbox",
) {
  const id = crypto.randomUUID();
  const statements = [
    ...(media
      ? [
          prepare(
            `INSERT INTO media_asset
              (id, r2_bucket, r2_key, mime_type, byte_size, original_filename, purpose, uploaded_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'event', ?7)`,
          ).bind(
            media.id,
            media.stored.bucket,
            media.stored.key,
            media.mimeType,
            media.stored.size,
            media.originalFilename,
            adminId,
          ),
        ]
      : []),
    prepare(
      `INSERT INTO event
        (id, name, description, image_media_id, start_at, end_at, applies_to_all, created_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(
      id,
      input.name,
      input.description,
      media?.id ?? null,
      input.startAt,
      input.endAt,
      input.appliesToAll ? 1 : 0,
      adminId,
    ),
    ...(!input.appliesToAll ? targetInsertStatements(id, input, squareEnv) : []),
  ];
  await batch(statements);
  return id;
}

export async function updateEvent(
  id: string,
  input: EventInput,
  media?: { id: string; stored: StoredMedia; mimeType: string; originalFilename: string; adminId: string },
  squareEnv: "sandbox" | "production" = "sandbox",
) {
  const previous = await prepare(
    "SELECT image_media_id FROM event WHERE id = ?1 AND deleted_at IS NULL",
  ).bind(id).first<EventMediaRow>();
  if (!previous) return false;

  const statements = [
    ...(media
      ? [
          prepare(
            `INSERT INTO media_asset
              (id, r2_bucket, r2_key, mime_type, byte_size, original_filename, purpose, uploaded_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'event', ?7)`,
          ).bind(
            media.id,
            media.stored.bucket,
            media.stored.key,
            media.mimeType,
            media.stored.size,
            media.originalFilename,
            media.adminId,
          ),
        ]
      : []),
    prepare(
      `UPDATE event
          SET name = ?1, description = ?2, image_media_id = COALESCE(?3, image_media_id),
              start_at = ?4, end_at = ?5, applies_to_all = ?6
        WHERE id = ?7 AND deleted_at IS NULL`,
    ).bind(
      input.name,
      input.description,
      media?.id ?? null,
      input.startAt,
      input.endAt,
      input.appliesToAll ? 1 : 0,
      id,
    ),
    prepare("DELETE FROM event_category WHERE event_id = ?1").bind(id),
    prepare("DELETE FROM event_item WHERE event_id = ?1").bind(id),
    ...(!input.appliesToAll ? targetInsertStatements(id, input, squareEnv) : []),
  ];
  if (media?.id && previous.image_media_id && previous.image_media_id !== media.id) {
    statements.push(
      prepare(
        `UPDATE media_asset
            SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?1 AND deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM event WHERE image_media_id = ?1 AND deleted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM gallery_image WHERE media_id = ?1 AND deleted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM carousel_slide WHERE media_id = ?1)
            AND NOT EXISTS (SELECT 1 FROM menu_document WHERE media_id = ?1)
            AND NOT EXISTS (SELECT 1 FROM content_block WHERE media_id = ?1)
            AND NOT EXISTS (SELECT 1 FROM site_link WHERE icon_media_id = ?1)
            AND NOT EXISTS (SELECT 1 FROM admin_user WHERE avatar_media_id = ?1 AND deleted_at IS NULL)`,
      ).bind(previous.image_media_id),
    );
    statements.push(
      prepare(
        `INSERT INTO pending_r2_deletion (r2_bucket, r2_key)
         SELECT media.r2_bucket, media.r2_key
           FROM media_asset AS media
          WHERE media.id = ?1 AND media.deleted_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM pending_r2_deletion AS pending
               WHERE pending.r2_bucket = media.r2_bucket
                 AND pending.r2_key = media.r2_key
                 AND pending.deleted_at IS NULL
            )`,
      ).bind(previous.image_media_id),
    );
  }
  await batch(statements);
  return true;
}

export async function softDeleteEvent(id: string): Promise<boolean> {
  const result = await prepare(
    `UPDATE event SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1 AND deleted_at IS NULL`,
  ).bind(id).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function softDeleteEndedEvents(): Promise<void> {
  await prepare(
    `UPDATE event SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE deleted_at IS NULL AND end_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run();
}
