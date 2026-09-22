// Server code only. Never import this file into a client component.
import { batch, prepare } from "@/app/lib/d1";
import type { StoredMedia } from "@/app/lib/media";

export type CurrentMenuDocument = {
  id: string;
  r2_key: string;
};

/** Read the current PDF, excluding retired media. No menu means use the fallback. */
export function getCurrentMenuDocument(): Promise<CurrentMenuDocument | null> {
  return prepare(
    `SELECT document.id, media.r2_key
       FROM menu_document AS document
       JOIN media_asset AS media ON media.id = document.media_id
      WHERE document.is_current = 1
        AND media.deleted_at IS NULL
        AND media.mime_type = 'application/pdf'
        AND media.purpose = 'document'
      ORDER BY document.published_at DESC, document.id
      LIMIT 1`,
  ).first<CurrentMenuDocument>();
}

/** Call only after the upload handler has checked getAdmin(2) and stored the PDF. */
export async function publishMenuDocument(input: {
  documentId: string;
  mediaId: string;
  stored: StoredMedia;
  originalFilename: string;
  adminId: string;
}): Promise<void> {
  const { documentId, mediaId, stored, originalFilename, adminId } = input;

  // One transaction: a failed insert must not unset the previous current menu.
  // Keep previous versions and their files; do not delete referenced media.
  await batch([
    prepare(
      `INSERT INTO media_asset
         (id, r2_bucket, r2_key, mime_type, byte_size,
          original_filename, purpose, uploaded_by)
       VALUES (?1, ?2, ?3, 'application/pdf', ?4, ?5, 'document', ?6)`,
    ).bind(mediaId, stored.bucket, stored.key, stored.size, originalFilename, adminId),
    prepare("UPDATE menu_document SET is_current = 0 WHERE is_current = 1"),
    prepare(
      `INSERT INTO menu_document
         (id, media_id, title, is_current, uploaded_by)
       VALUES (?1, ?2, 'TEAZO Menu', 1, ?3)`,
    ).bind(documentId, mediaId, adminId),
  ]);
}
