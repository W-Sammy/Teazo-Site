-- TEAZO - Make event start and end dates optional.
--
-- Preserve existing events, catalog associations, foreign keys,
-- indexes, timestamp maintenance, and media deletion protection.
--
-- NULL start_at means there is no scheduled start restriction.
-- NULL end_at means there is no scheduled expiration.
-- When both dates are provided, the end must not precede the start.

-- Temporarily preserve catalog associations before rebuilding
-- the event table. Dropping the original event table would
-- otherwise cascade deletions to these associated records.

CREATE TABLE event_item_backup AS
SELECT
  event_id,
  square_catalog_object_id,
  square_env
FROM event_item;

CREATE TABLE event_category_backup AS
SELECT
  event_id,
  square_category_id,
  square_env
FROM event_category;

-- Create the replacement event table with nullable dates.

CREATE TABLE event_new (
  id             TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  image_media_id TEXT REFERENCES media_asset(id) ON DELETE RESTRICT,
  start_at       TEXT,
  end_at         TEXT,
  applies_to_all INTEGER NOT NULL DEFAULT 0 CHECK (applies_to_all IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by     TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  deleted_at     TEXT,
  CHECK (
    start_at IS NULL
    OR end_at IS NULL
    OR end_at >= start_at
  )
);

-- Preserve every existing event, including soft-deleted records
-- and the original creation and modification timestamps.

INSERT INTO event_new (
  id,
  name,
  description,
  image_media_id,
  start_at,
  end_at,
  applies_to_all,
  created_at,
  updated_at,
  created_by,
  deleted_at
)
SELECT
  id,
  name,
  description,
  image_media_id,
  start_at,
  end_at,
  applies_to_all,
  created_at,
  updated_at,
  created_by,
  deleted_at
FROM event;

-- Temporarily remove the media deletion guard because it
-- references the event table. SQLite validates trigger
-- references when renaming tables, so leaving this trigger
-- in place would cause the table replacement to fail.
--
-- Its original definition is restored below.

DROP TRIGGER trg_media_soft_delete_guard;

-- Remove dependent tables before replacing the event table.

DROP TABLE event_item;
DROP TABLE event_category;

-- Replace the original event table.
-- Dropping the original table also removes its associated
-- index and timestamp trigger, which are restored below.

DROP TABLE event;

ALTER TABLE event_new RENAME TO event;

-- Restore the original event start-date index.

CREATE INDEX ix_event_start
ON event (start_at DESC, id)
WHERE deleted_at IS NULL;

-- Recreate the event-item association table.

CREATE TABLE event_item (
  event_id                 TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  square_catalog_object_id TEXT NOT NULL,
  square_env               TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  PRIMARY KEY (event_id, square_catalog_object_id, square_env)
);

-- Recreate the event-category association table.

CREATE TABLE event_category (
  event_id           TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  square_category_id TEXT NOT NULL,
  square_env         TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  PRIMARY KEY (event_id, square_category_id, square_env)
);

-- Restore existing item associations.

INSERT INTO event_item (
  event_id,
  square_catalog_object_id,
  square_env
)
SELECT
  event_id,
  square_catalog_object_id,
  square_env
FROM event_item_backup;

-- Restore existing category associations.

INSERT INTO event_category (
  event_id,
  square_category_id,
  square_env
)
SELECT
  event_id,
  square_category_id,
  square_env
FROM event_category_backup;

-- Restore the original association indexes.

CREATE INDEX ix_event_item_by_item
ON event_item (square_catalog_object_id, square_env);

CREATE INDEX ix_event_category_by_category
ON event_category (square_category_id, square_env);

-- Restore automatic updated_at maintenance.

CREATE TRIGGER trg_event_touch
AFTER UPDATE OF name, description, image_media_id, start_at, end_at,
                applies_to_all, deleted_at
ON event FOR EACH ROW
BEGIN
  UPDATE event
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = OLD.id;
END;

-- Restore the original media deletion guard.
-- Media assets must not be soft-deleted while referenced
-- by active website content or administrator accounts.

CREATE TRIGGER trg_media_soft_delete_guard
BEFORE UPDATE OF deleted_at ON media_asset
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'media_asset is still referenced')
  WHERE EXISTS (SELECT 1 FROM gallery_image     WHERE media_id       = OLD.id AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM carousel_slide    WHERE media_id       = OLD.id)
     OR EXISTS (SELECT 1 FROM menu_document     WHERE media_id       = OLD.id)
     OR EXISTS (SELECT 1 FROM content_block     WHERE media_id       = OLD.id)
     OR EXISTS (SELECT 1 FROM site_link         WHERE icon_media_id  = OLD.id)
     OR EXISTS (SELECT 1 FROM event             WHERE image_media_id = OLD.id AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM admin_user        WHERE avatar_media_id = OLD.id AND deleted_at IS NULL);
END;

-- Remove temporary backup tables after restoring associations.

DROP TABLE event_item_backup;
DROP TABLE event_category_backup;