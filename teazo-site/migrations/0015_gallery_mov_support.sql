-- Gallery MOV support without rebuilding the referenced media_asset table.
--
-- The original media_asset.mime_type CHECK constraint allows video/mp4 and
-- video/webm, but not video/quicktime. SQLite cannot replace that CHECK in
-- place. Rebuilding media_asset would affect multiple ON DELETE RESTRICT
-- foreign keys, so preserve the original table and every existing media ID.
--
-- New QuickTime uploads keep the legacy-compatible video/mp4 value in
-- mime_type and store their actual type in mime_type_override. R2 receives
-- the actual video/quicktime Content-Type, and Gallery queries use
-- COALESCE(mime_type_override, mime_type) to expose the real media type.
-- Existing rows default to NULL and retain their original meaning.

ALTER TABLE media_asset
  ADD COLUMN mime_type_override TEXT DEFAULT NULL
  CHECK (
    mime_type_override IS NULL
    OR mime_type_override = 'video/quicktime'
  );
