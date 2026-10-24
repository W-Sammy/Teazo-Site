// Server code only. Never import this file into a client component.
import { batch, D1Error, prepare, type D1Result } from "@/app/lib/d1";
import type { MediaType, StoredMedia } from "@/app/lib/media";

/** A live gallery image with its stored file's key and its tag names. */
export type GalleryImageRecord = {
  id: string;
  name: string;
  caption: string | null;
  alt: string | null;
  isPublished: boolean;
  createdAt: string;
  r2Key: string;
  mediaId: string;
  r2Bucket: string;
  width: number | null;
  height: number | null;
  tags: string[];
};

/** The most tags one image can have. Matches the admin gallery form. */
export const MAX_GALLERY_TAGS = 12;

type ImageRow = {
  id: string;
  name: string;
  caption: string | null;
  alt: string | null;
  is_published: number;
  created_at: string;
  r2_key: string;
  media_id: string;
  r2_bucket: string;
  width: number | null;
  height: number | null;
  tags: string;
};

// Tags come back as a JSON array, sorted, so one query returns everything.
const IMAGE_SELECT = `
  SELECT g.id, g.name, g.caption, g.alt, g.is_published, g.created_at,
         g.media_id, m.r2_bucket,
         m.r2_key, m.width, m.height,
         (SELECT json_group_array(name) FROM (
            SELECT t.name
              FROM gallery_image_tag AS it
              JOIN gallery_tag AS t ON t.id = it.tag_id
             WHERE it.image_id = g.id
             ORDER BY t.name_normalized, t.id)) AS tags
    FROM gallery_image AS g
    JOIN media_asset AS m ON m.id = g.media_id
   WHERE g.deleted_at IS NULL
     AND m.deleted_at IS NULL`;

function toRecord(row: ImageRow): GalleryImageRecord {
  return {
    id: row.id,
    name: row.name,
    caption: row.caption,
    alt: row.alt,
    isPublished: row.is_published === 1,
    createdAt: row.created_at,
    r2Key: row.r2_key,
    mediaId: row.media_id,
    r2Bucket: row.r2_bucket,
    width: row.width,
    height: row.height,
    tags: JSON.parse(row.tags) as string[],
  };
}

/** Every live image, for the admin gallery. Newest first. */
export async function listGalleryImages(): Promise<GalleryImageRecord[]> {
  const { results } = await prepare(
    `${IMAGE_SELECT}
     ORDER BY g.created_at DESC, g.id`,
  ).all<ImageRow>();

  return results.map(toRecord);
}

/** Published images for the public gallery, in the owner's order, newest first within it. */
export async function listPublishedGalleryImages(): Promise<GalleryImageRecord[]> {
  const { results } = await prepare(
    `${IMAGE_SELECT}
       AND g.is_published = 1
     ORDER BY g.sort_order, g.created_at DESC, g.id`,
  ).all<ImageRow>();

  return results.map(toRecord);
}

/** One live image, or null. */
export async function getGalleryImage(
  id: string,
): Promise<GalleryImageRecord | null> {
  const row = await prepare(`${IMAGE_SELECT} AND g.id = ?1`)
    .bind(id)
    .first<ImageRow>();

  return row ? toRecord(row) : null;
}

/** How gallery names sort: accents removed and lowercased, so "Éclair" sorts with "eclair". */
export function sortKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** How tags are compared: trimmed, runs of spaces collapsed, lowercased. Same as 0002_seed.sql. */
export function normalizeTag(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Links are only written while the image is live, so a tag is never linked
// to a removed image.
const IMAGE_IS_LIVE =
  "EXISTS (SELECT 1 FROM gallery_image WHERE id = ?1 AND deleted_at IS NULL)";

// Two statements per tag: add the tag if it is new, then link it. Tags that
// differ only in case or spacing become one tag, spelled as first added.
function tagStatements(imageId: string, tags: string[]) {
  return tags.flatMap((tag) => {
    const normalized = normalizeTag(tag);

    return [
      prepare(
        `INSERT INTO gallery_tag (name, name_normalized) VALUES (?1, ?2)
         ON CONFLICT (name_normalized) DO NOTHING`,
      ).bind(tag, normalized),
      prepare(
        `INSERT INTO gallery_image_tag (image_id, tag_id)
         SELECT ?1, id FROM gallery_tag
          WHERE name_normalized = ?2 AND ${IMAGE_IS_LIVE}
         ON CONFLICT (image_id, tag_id) DO NOTHING`,
      ).bind(imageId, normalized),
    ];
  });
}

/**
 * Record a stored file as a gallery image with its tags, all in one
 * transaction. Call only after requireAdminApi(request, 2) and putMedia().
 * Tags must already be cleaned: unique by normalizeTag(), at most MAX_GALLERY_TAGS.
 */
export async function recordGalleryImage(input: {
  imageId: string;
  mediaId: string;
  stored: StoredMedia;
  mimeType: MediaType;
  width: number;
  height: number;
  originalFilename: string;
  name: string;
  tags: string[];
  adminId: string;
}): Promise<void> {
  const {
    imageId,
    mediaId,
    stored,
    mimeType,
    width,
    height,
    originalFilename,
    name,
    tags,
    adminId,
  } = input;

  await batch([
    prepare(
      `INSERT INTO media_asset
         (id, r2_bucket, r2_key, mime_type, byte_size, width, height,
          original_filename, purpose, uploaded_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'gallery', ?9)`,
    ).bind(
      mediaId,
      stored.bucket,
      stored.key,
      mimeType,
      stored.size,
      width,
      height,
      originalFilename,
      adminId,
    ),
    prepare(
      `INSERT INTO gallery_image (id, media_id, name, name_sort_key)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind(imageId, mediaId, name, sortKey(name)),
    ...tagStatements(imageId, tags),
  ]);
}

/**
 * Replace a live image's name and tags in one transaction.
 * The media reference, creation date, caption and publication settings stay intact.
 * Call only after authorization and input validation in the gallery service.
 * Returns null when the image or its media is no longer live.
 */
export async function updateGalleryImageMetadata(input: {
  id: string;
  name: string;
  tags: string[];
}): Promise<GalleryImageRecord | null> {
  const { id, name, tags } = input;

  if (tags.length > MAX_GALLERY_TAGS) {
    throw new D1Error(
      `A gallery image cannot have more than ${MAX_GALLERY_TAGS} tags.`,
    );
  }

  // Guard every write, not just a preliminary read. A deletion that commits
  // before this transaction must not allow edits or new tag associations.
  const editableImageExists = `EXISTS (
    SELECT 1
      FROM gallery_image AS g
      JOIN media_asset AS m ON m.id = g.media_id
     WHERE g.id = ?1
       AND g.deleted_at IS NULL
       AND m.deleted_at IS NULL
  )`;

  const statements = [
    prepare(
      `UPDATE gallery_image
          SET name = ?2, name_sort_key = ?3
        WHERE id = ?1 AND ${editableImageExists}`,
    ).bind(id, name, sortKey(name)),
    prepare(
      `DELETE FROM gallery_image_tag
        WHERE image_id = ?1 AND ${editableImageExists}`,
    ).bind(id),
    ...tags.flatMap((tag) => {
      const normalized = normalizeTag(tag);

      return [
        prepare(
          `INSERT INTO gallery_tag (name, name_normalized)
           SELECT ?2, ?3 WHERE ${editableImageExists}
           ON CONFLICT (name_normalized) DO NOTHING`,
        ).bind(id, tag, normalized),
        prepare(
          `INSERT INTO gallery_image_tag (image_id, tag_id)
           SELECT ?1, id FROM gallery_tag
            WHERE name_normalized = ?2 AND ${editableImageExists}
           ON CONFLICT (image_id, tag_id) DO NOTHING`,
        ).bind(id, normalized),
      ];
    }),
    // Read the stored values inside the same transaction. Existing tags keep
    // their canonical spelling, and no separate post-save read is needed.
    prepare(`${IMAGE_SELECT} AND g.id = ?1`).bind(id),
  ];

  // At most 27 statements for 12 tags, below the proxy's limit of 40.
  const { results } = await batch(statements);

  const readResult = results[results.length - 1] as
    | D1Result<ImageRow>
    | undefined;

  if (
    results.length !== statements.length ||
    !readResult ||
    readResult.success !== true ||
    !Array.isArray(readResult.results)
  ) {
    throw new D1Error(
      "The gallery update result could not be confirmed.",
    );
  }

  const row = readResult.results[0];

  return row ? toRecord(row) : null;
}

/**
 * Atomically swap a live gallery image to a newly uploaded media object.
 * All writes, including the old-file cleanup queue, are one D1 transaction.
 * The old media ID guards against another replacement changing that reference.
 * If another replacement or deletion won, no media record is created and
 * null is returned.
 */
export async function replaceGalleryImageMedia(input: {
  id: string;
  expectedMediaId: string;
  newMediaId: string;
  stored: StoredMedia;
  width: number;
  height: number;
  originalFilename: string;
  adminId: string;
  name: string;
  tags: string[];
}): Promise<GalleryImageRecord | null> {
  const {
    id,
    expectedMediaId,
    newMediaId,
    stored,
    width,
    height,
    originalFilename,
    adminId,
    name,
    tags,
  } = input;

  if (tags.length > MAX_GALLERY_TAGS) {
    throw new D1Error(
      `A gallery image cannot have more than ${MAX_GALLERY_TAGS} tags.`,
    );
  }

  // The first statement only inserts if the image still references the
  // expected live media. Subsequent statements require that new row.
  const inserted = `EXISTS (
    SELECT 1 FROM media_asset WHERE id = ?2 AND deleted_at IS NULL
  )`;

  const statements = [
    prepare(
      `INSERT INTO media_asset
         (id, r2_bucket, r2_key, mime_type, byte_size, width, height,
          original_filename, purpose, uploaded_by)
       SELECT ?1, ?2, ?3, 'image/webp', ?4, ?5, ?6, ?7, 'gallery', ?8
        WHERE EXISTS (
          SELECT 1
            FROM gallery_image AS g
            JOIN media_asset AS m ON m.id = g.media_id
           WHERE g.id = ?9
             AND g.media_id = ?10
             AND g.deleted_at IS NULL
             AND m.deleted_at IS NULL
        )`,
    ).bind(
      newMediaId,
      stored.bucket,
      stored.key,
      stored.size,
      width,
      height,
      originalFilename,
      adminId,
      id,
      expectedMediaId,
    ),
    prepare(
      `UPDATE gallery_image
          SET media_id = ?2, name = ?4, name_sort_key = ?5
        WHERE id = ?1
          AND media_id = ?3
          AND deleted_at IS NULL
          AND ${inserted}`,
    ).bind(
      id,
      newMediaId,
      expectedMediaId,
      name,
      sortKey(name),
    ),
    prepare(
      `DELETE FROM gallery_image_tag
        WHERE image_id = ?1 AND ${inserted}`,
    ).bind(id, newMediaId),
    ...tags.flatMap((tag) => {
      const normalized = normalizeTag(tag);

      return [
        prepare(
          `INSERT INTO gallery_tag (name, name_normalized)
           SELECT ?3, ?4 WHERE ${inserted}
           ON CONFLICT (name_normalized) DO NOTHING`,
        ).bind(id, newMediaId, tag, normalized),
        prepare(
          `INSERT INTO gallery_image_tag (image_id, tag_id)
           SELECT ?1, t.id FROM gallery_tag AS t
            WHERE t.name_normalized = ?4 AND ${inserted}
           ON CONFLICT (image_id, tag_id) DO NOTHING`,
        ).bind(id, newMediaId, expectedMediaId, normalized),
      ];
    }),
    // Never retire media still referenced by any live gallery image.
    prepare(
      `UPDATE media_asset
          SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?3
          AND deleted_at IS NULL
          AND ${inserted}
          AND NOT EXISTS (
            SELECT 1 FROM gallery_image
             WHERE media_id = ?3 AND deleted_at IS NULL
          )`,
    ).bind(id, newMediaId, expectedMediaId),
    prepare(
      `INSERT INTO pending_r2_deletion (r2_bucket, r2_key)
       SELECT m.r2_bucket, m.r2_key FROM media_asset AS m
        WHERE m.id = ?3
          AND m.deleted_at IS NOT NULL
          AND ${inserted}
          AND NOT EXISTS (
            SELECT 1 FROM pending_r2_deletion AS p
             WHERE p.r2_bucket = m.r2_bucket
               AND p.r2_key = m.r2_key
               AND p.deleted_at IS NULL
          )`,
    ).bind(id, newMediaId, expectedMediaId),
    prepare(`${IMAGE_SELECT} AND g.id = ?1`).bind(id),
  ];

  // At most 30 statements for 12 tags.
  const { results } = await batch(statements);

  const readResult = results[results.length - 1] as
    | D1Result<ImageRow>
    | undefined;

  if (
    results.length !== statements.length ||
    !readResult ||
    readResult.success !== true ||
    !Array.isArray(readResult.results)
  ) {
    throw new D1Error(
      "The image replacement transaction could not be confirmed.",
    );
  }

  const row = readResult.results[0];

  if (!row || row.media_id !== newMediaId) {
    return null;
  }

  return toRecord(row);
}

/**
 * Retire a live image and queue its file for removal. The Worker's sweeper
 * removes the bytes 24 hours later, which leaves a day to undo a mistake
 * (DEV-GUIDE section 4.2). Returns false when there is no such image.
 * Call only after requireAdminApi(request, 2).
 */
export async function deleteGalleryImage(id: string): Promise<boolean> {
  const image = await prepare(
    `SELECT g.media_id, m.r2_bucket, m.r2_key
       FROM gallery_image AS g
       JOIN media_asset AS m ON m.id = g.media_id
      WHERE g.id = ?1 AND g.deleted_at IS NULL`,
  )
    .bind(id)
    .first<{
      media_id: string;
      r2_bucket: string;
      r2_key: string;
    }>();

  if (!image) return false;

  // The image goes first: the database refuses to retire a file that a live
  // image still uses. The queue insert skips a file that is already queued, so
  // two deletes at once queue it only once.
  await batch([
    prepare(
      `UPDATE gallery_image SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1 AND deleted_at IS NULL`,
    ).bind(id),
    prepare(
      `UPDATE media_asset SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1 AND deleted_at IS NULL`,
    ).bind(image.media_id),
    prepare(
      `INSERT INTO pending_r2_deletion (r2_bucket, r2_key)
       SELECT ?1, ?2
        WHERE NOT EXISTS (
          SELECT 1 FROM pending_r2_deletion
           WHERE r2_bucket = ?1 AND r2_key = ?2 AND deleted_at IS NULL
        )`,
    ).bind(image.r2_bucket, image.r2_key),
  ]);

  return true;
}