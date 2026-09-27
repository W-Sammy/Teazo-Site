-- TEAZO — Cloudflare D1 initial schema
--
-- Target: D1 (SQLite). Conventions used throughout:
--   * ids are TEXT (hex(randomblob(16))) so they can also be minted client-side
--     with crypto.randomUUID(), which the gallery admin already does.
--   * every single-column PK is declared NOT NULL. In SQLite only
--     INTEGER PRIMARY KEY implies NOT NULL — a bare `id TEXT PRIMARY KEY`
--     happily accepts NULL, and a helper that returns undefined then writes a
--     row that can never be looked up again.
--   * booleans are INTEGER 0/1 with a CHECK; SQLite has no BOOLEAN.
--   * enums are TEXT with a CHECK; SQLite has no ENUM and ALTER TABLE cannot
--     add a CHECK later without a full table rebuild, so they are declared now.
--   * timestamps are ISO-8601 TEXT in UTC.
--   * every table keyed on a Square object carries square_env IN ITS KEY,
--     because sandbox and production catalogs share no object ids.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. Identity & access
-- ---------------------------------------------------------------------------

CREATE TABLE role (
  id    INTEGER PRIMARY KEY,
  key   TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  rank  INTEGER NOT NULL              -- lower rank = more privilege
);

CREATE TABLE admin_user (
  id               TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  email            TEXT NOT NULL,
  -- SQLite's NOCASE collation folds ASCII only, so normalization is explicit.
  email_normalized TEXT NOT NULL,
  username         TEXT NOT NULL,          -- the label shown in Settings; sign-in is by Google email
  role_id          INTEGER NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  -- The Settings UI models this as a per-admin flag that is only meaningful
  -- for role 2 ("Can Edit"): changeRole() forces it false for any other role,
  -- and toggleInvitePermission() refuses unless role === WRITE_ROLE.
  -- See teazo-site/app/admin/settings/handlers/use-admins.ts
  can_invite_users INTEGER NOT NULL DEFAULT 0
                     CHECK (can_invite_users IN (0,1))
                     CHECK (can_invite_users = 0 OR role_id = 2),
  avatar_media_id  TEXT REFERENCES media_asset(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'invited', 'suspended')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at    TEXT,
  deleted_at       TEXT
);

-- Partial unique: a soft-deleted admin must not block re-adding the address.
CREATE UNIQUE INDEX ux_admin_user_email
  ON admin_user (email_normalized) WHERE deleted_at IS NULL;
CREATE INDEX ix_admin_user_role ON admin_user (role_id) WHERE deleted_at IS NULL;

-- At most one Owner. SQLite cannot declaratively enforce "at least one" —
-- that guard lives in the delete/demote handler, which must also refuse to
-- demote or delete the Owner (use-admins.ts:21, :53-56).
CREATE UNIQUE INDEX ux_admin_user_single_owner
  ON admin_user (role_id) WHERE role_id = 1 AND deleted_at IS NULL;

-- Sign-in is NextAuth with Google (teazo-site/auth.ts), and it keeps sessions
-- in a signed cookie. So this database holds no sessions, no OAuth links and
-- no invitation tokens -- only who is an admin and what they may do.
-- admin_user is matched to the signed-in Google account by email_normalized.
-- Adding an admin in Settings inserts a row with status 'invited'; there is
-- nothing to email, because signing in with that Google address is the invite.

-- ---------------------------------------------------------------------------
-- 2. Media — D1 holds the metadata, R2 holds the bytes
-- ---------------------------------------------------------------------------

CREATE TABLE media_asset (
  id                TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  r2_bucket         TEXT NOT NULL,
  -- No `url` column on purpose: buckets and custom domains change, and a
  -- stored absolute URL rots. Build the URL at render time from bucket + key.
  r2_key            TEXT NOT NULL,
  mime_type         TEXT NOT NULL
                      CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size         INTEGER NOT NULL CHECK (byte_size > 0),
  width             INTEGER,             -- null for PDFs
  height            INTEGER,
  original_filename TEXT,
  alt               TEXT,
  purpose           TEXT NOT NULL DEFAULT 'gallery'
                      CHECK (purpose IN ('gallery','event','document','branding','carousel')),
  uploaded_by       TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);

-- Partial so that deleting and re-uploading the same key succeeds.
CREATE UNIQUE INDEX ux_media_key
  ON media_asset (r2_bucket, r2_key) WHERE deleted_at IS NULL;
CREATE INDEX ix_media_purpose ON media_asset (purpose, created_at DESC)
  WHERE deleted_at IS NULL;

-- Media is SOFT-deleted, so ON DELETE RESTRICT on the referencing tables never
-- fires for a normal retirement. This trigger is what actually protects a file
-- that is still on the site. The delete handler should still run an explicit
-- usage query first so it can return a helpful 409 naming the holder, rather
-- than surfacing a raw constraint error to the admin.
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

-- Bytes to reap from R2 after a row is soft-deleted. D1 has no TTL and no
-- scheduled jobs of its own, so a scheduled sweeper drains this. R2 deletes
-- are not transactional with D1, which is the other reason this queue exists.
CREATE TABLE pending_r2_deletion (
  id         TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  r2_bucket  TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  queued_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  last_error TEXT
);

CREATE INDEX ix_pending_deletion_open ON pending_r2_deletion (queued_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Gallery
-- ---------------------------------------------------------------------------

CREATE TABLE gallery_image (
  id            TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  media_id      TEXT NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  -- Precomputed by the application at write time. SQLite ships only BINARY /
  -- NOCASE / RTRIM, none of which reproduce the localeCompare order the admin
  -- UI sorts by today, and the content is bilingual.
  name_sort_key TEXT NOT NULL,
  caption       TEXT,
  alt           TEXT,
  is_published  INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT
);

CREATE INDEX ix_gallery_sort_name ON gallery_image (name_sort_key)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_gallery_sort_date ON gallery_image (created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_gallery_published ON gallery_image (is_published, sort_order, id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_gallery_media ON gallery_image (media_id)
  WHERE deleted_at IS NULL;

CREATE TABLE gallery_tag (
  id              TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name            TEXT NOT NULL,          -- display form, e.g. "Milk Tea"
  name_normalized TEXT NOT NULL UNIQUE,   -- lower(trim(collapse_ws(name)))
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE gallery_image_tag (
  image_id TEXT NOT NULL REFERENCES gallery_image(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES gallery_tag(id)   ON DELETE CASCADE,
  PRIMARY KEY (image_id, tag_id)
);

-- Serves the sidebar tag counts and the OR-semantics tag filter.
CREATE INDEX ix_gallery_tag_reverse ON gallery_image_tag (tag_id, image_id);

-- ---------------------------------------------------------------------------
-- 4. Site content — replaces contact-content.ts and the inline JSX literals
-- ---------------------------------------------------------------------------

-- Singleton. Mirrors Square's Locations API where it overlaps; synced_at
-- records the last pull so drift against the POS is visible.
CREATE TABLE business_profile (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  business_name         TEXT NOT NULL,
  street_address        TEXT NOT NULL,
  locality              TEXT NOT NULL,
  phone                 TEXT,
  email                 TEXT,
  map_query             TEXT NOT NULL,
  timezone              TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  square_location_id    TEXT,
  synced_from_square_at TEXT,
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by            TEXT REFERENCES admin_user(id) ON DELETE SET NULL
);

-- day_of_week is 0 = Monday, matching the order the contact card renders.
-- NOTE: JavaScript's Date#getDay() is 0 = Sunday. Convert at the boundary.
CREATE TABLE business_hours (
  day_of_week  INTEGER PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  display_text TEXT NOT NULL,          -- "11:00 AM - 8:00 PM", rendered verbatim
  opens_at     TEXT,                   -- "11:00" — only if a feature computes open/closed
  closes_at    TEXT,
  is_closed    INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0,1)),
  note         TEXT
);

-- Holiday closures and one-off early closes: the most common hours edit a
-- shop owner makes, and unrepresentable in business_hours alone.
CREATE TABLE hours_exception (
  date         TEXT PRIMARY KEY NOT NULL,   -- ISO date, YYYY-MM-DD
  is_closed    INTEGER NOT NULL DEFAULT 1 CHECK (is_closed IN (0,1)),
  display_text TEXT,
  note         TEXT
);

-- One table for social + delivery + any other outbound link.
CREATE TABLE site_link (
  key           TEXT PRIMARY KEY NOT NULL,   -- 'instagram', 'doordash', ...
  link_group    TEXT NOT NULL CHECK (link_group IN ('social','delivery','other')),
  label         TEXT NOT NULL,
  url           TEXT NOT NULL,
  aria_label    TEXT,
  icon_media_id TEXT REFERENCES media_asset(id) ON DELETE RESTRICT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

-- Non-partial: the admin editor lists inactive links too.
CREATE INDEX ix_site_link_group ON site_link (link_group, sort_order, key);

-- Editable copy. `key` is the natural key `page_key.slot_key`; the unique
-- index below is what stops a second row claiming the same slot under a
-- different key, which would make the winning row nondeterministic.
CREATE TABLE content_block (
  key        TEXT PRIMARY KEY NOT NULL,   -- 'home.hero_heading'
  page_key   TEXT NOT NULL,               -- 'home', 'contact', 'delivery', ...
  slot_key   TEXT NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'text'
               CHECK (block_type IN ('text','richtext','url','media','number')),
  value      TEXT,
  media_id   TEXT REFERENCES media_asset(id) ON DELETE RESTRICT,
  media_alt  TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  CHECK (key = page_key || '.' || slot_key)
);

CREATE UNIQUE INDEX ux_content_block_slot ON content_block (page_key, slot_key);

-- Home-page carousel. Currently a bare string[] of /carousel_images paths.
CREATE TABLE carousel_slide (
  id         TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  media_id   TEXT NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
  alt        TEXT,
  caption    TEXT,
  link_url   TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE INDEX ix_carousel_order ON carousel_slide (sort_order, id);

-- The downloadable PDF menu behind /static-menu. Versioned so replacing it is
-- an insert, not a destructive overwrite of a live URL.
CREATE TABLE menu_document (
  id           TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  media_id     TEXT NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
  title        TEXT NOT NULL DEFAULT 'TEAZO Menu',
  is_current   INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  uploaded_by  TEXT REFERENCES admin_user(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX ux_menu_document_current ON menu_document (is_current)
  WHERE is_current = 1;

-- ---------------------------------------------------------------------------
-- 5. Square catalog — read-through cache + curation overlay
--
-- Square is authoritative for: item name, description, price, variations,
-- photos, categories, modifier lists, per-category ordinal, sold-out state and
-- online visibility. Nothing below may be edited as a competing source of truth.
-- ---------------------------------------------------------------------------

-- One watermark per environment: at cutover, production gets its own row with
-- last_synced_at NULL, which correctly forces a full initial sync while the
-- sandbox cursor survives.
CREATE TABLE square_sync_state (
  key                  TEXT NOT NULL,      -- 'catalog'
  square_env           TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  last_catalog_version INTEGER,
  last_synced_at       TEXT,
  last_error           TEXT,
  PRIMARY KEY (key, square_env)
);

CREATE TABLE catalog_item_cache (
  square_object_id TEXT NOT NULL,
  square_env       TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  square_version   INTEGER,              -- optimistic-concurrency token; staleness check
  name             TEXT,
  description      TEXT,
  square_image_url TEXT,                -- Square's own URL: a pointer to Square's copy, never a copy
  categories_json  TEXT CHECK (categories_json IS NULL OR json_valid(categories_json)),
  modifiers_json   TEXT CHECK (modifiers_json  IS NULL OR json_valid(modifiers_json)),
  is_deleted       INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  synced_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (square_object_id, square_env)
);

CREATE INDEX ix_catalog_live ON catalog_item_cache (square_env, name) WHERE is_deleted = 0;

-- Sizes live here. A boba shop's Regular/Large IS a Square ITEM_VARIATION, so
-- price cannot sit on the item row — one row per item would collapse every
-- M/L pair to whichever the sync wrote last, and show one wrong price.
-- (This is also why the variations[0] truncation in
-- app/api/square/products/[id]/route.ts:90-104 must be fixed before syncing.)
CREATE TABLE catalog_variation_cache (
  square_variation_id TEXT NOT NULL,
  square_env          TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  square_object_id    TEXT NOT NULL,
  square_version      INTEGER,
  name                TEXT,                -- "Regular", "Large"
  price_cents         INTEGER,
  currency            TEXT NOT NULL DEFAULT 'USD',
  ordinal             INTEGER NOT NULL DEFAULT 0,
  is_sold_out         INTEGER NOT NULL DEFAULT 0 CHECK (is_sold_out IN (0,1)),
  synced_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (square_variation_id, square_env),
  FOREIGN KEY (square_object_id, square_env)
    REFERENCES catalog_item_cache(square_object_id, square_env) ON DELETE CASCADE
);

CREATE INDEX ix_variation_item
  ON catalog_variation_cache (square_object_id, square_env, ordinal);

-- Categories need a cache too, or "render only sections joined to a live
-- catalog row" has nothing to join to when a category is deleted in Square.
CREATE TABLE catalog_category_cache (
  square_object_id TEXT NOT NULL,
  square_env       TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  square_version   INTEGER,
  name             TEXT,
  is_deleted       INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  synced_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (square_object_id, square_env)
);

-- Sections on the public menu. square_category_id is NULLABLE precisely so the
-- synthetic "TEAZO Special" block — which has no Square CATEGORY object — is
-- representable.
CREATE TABLE menu_section (
  id                 TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  square_env         TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  square_category_id TEXT,
  title              TEXT NOT NULL,
  subtitle           TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_published       INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1)),
  PRIMARY KEY (id)
);

-- Required so menu_section_item can carry a composite FK that pins the env.
CREATE UNIQUE INDEX ux_menu_section_id_env ON menu_section (id, square_env);
CREATE UNIQUE INDEX ux_menu_section_category
  ON menu_section (square_category_id, square_env) WHERE square_category_id IS NOT NULL;
CREATE INDEX ix_menu_section_order ON menu_section (sort_order, id);

CREATE TABLE menu_section_item (
  section_id               TEXT NOT NULL,
  square_catalog_object_id TEXT NOT NULL,
  square_env               TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  position                 INTEGER NOT NULL DEFAULT 0,
  -- Square's per-category ordinal at last sync. It SEEDS position on first
  -- sync; afterwards the admin owns position and drift is visible as
  -- position <> square_ordinal. Square's ordinal cannot be the ongoing
  -- authority because "TEAZO Special" has no Square category at all.
  square_ordinal           INTEGER,
  PRIMARY KEY (section_id, square_catalog_object_id, square_env),
  FOREIGN KEY (section_id, square_env)
    REFERENCES menu_section(id, square_env) ON DELETE CASCADE,
  FOREIGN KEY (square_catalog_object_id, square_env)
    REFERENCES catalog_item_cache(square_object_id, square_env) ON DELETE RESTRICT
);

CREATE INDEX ix_menu_section_item_order
  ON menu_section_item (section_id, position, square_catalog_object_id);

-- Presentation-only overlay. Deliberately holds NO price, name, photo,
-- availability or modifier data — those would drift against the register.
CREATE TABLE menu_item_display (
  square_catalog_object_id TEXT NOT NULL,
  square_env               TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  badge                    TEXT CHECK (badge IS NULL OR badge IN ('new','seasonal','popular','limited')),
  is_featured              INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  hide_on_website          INTEGER NOT NULL DEFAULT 0 CHECK (hide_on_website IN (0,1)),
  allergen_note            TEXT,
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by               TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  PRIMARY KEY (square_catalog_object_id, square_env),
  FOREIGN KEY (square_catalog_object_id, square_env)
    REFERENCES catalog_item_cache(square_object_id, square_env) ON DELETE RESTRICT
);

CREATE INDEX ix_menu_item_featured ON menu_item_display (square_env)
  WHERE is_featured = 1;

-- ---------------------------------------------------------------------------
-- 6. Events & inquiries
-- ---------------------------------------------------------------------------

-- Mirrors the events admin (teazo-site/app/types/admin-event.ts): an event has
-- a name, description, image, start and end, and applies either to the whole
-- menu or to chosen Square items and categories. Its status -- upcoming,
-- active or ended -- is worked out from the dates, so it is not stored.
CREATE TABLE event (
  id             TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  image_media_id TEXT REFERENCES media_asset(id) ON DELETE RESTRICT,
  start_at       TEXT NOT NULL,
  end_at         TEXT NOT NULL,
  applies_to_all INTEGER NOT NULL DEFAULT 0 CHECK (applies_to_all IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by     TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  deleted_at     TEXT,
  CHECK (end_at >= start_at)
);

-- Serves the admin's start-date sort and "what is on right now".
CREATE INDEX ix_event_start ON event (start_at DESC, id) WHERE deleted_at IS NULL;

-- The items and categories an event applies to, when applies_to_all is 0.
-- Deliberately NOT foreign-keyed to the Square cache: an event can be saved
-- before the catalog sync has ever run. When rendering, skip ids the cache
-- no longer has.
CREATE TABLE event_item (
  event_id                 TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  square_catalog_object_id TEXT NOT NULL,
  square_env               TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  PRIMARY KEY (event_id, square_catalog_object_id, square_env)
);

CREATE TABLE event_category (
  event_id           TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  square_category_id TEXT NOT NULL,
  square_env         TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  PRIMARY KEY (event_id, square_category_id, square_env)
);

-- "Which events include this item / this category?" -- asked per menu item.
CREATE INDEX ix_event_item_by_item ON event_item (square_catalog_object_id, square_env);
CREATE INDEX ix_event_category_by_category ON event_category (square_category_id, square_env);

-- The contact form currently posts to a mailto: with encType="text/plain",
-- which most browsers drop silently — every inquiry sent so far is lost.
-- Columns match the five inputs the form actually collects.
-- This is the only table an unauthenticated visitor can write to: rate-limit
-- the route and cap field lengths there.
CREATE TABLE contact_message (
  id         TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT,
  last_name  TEXT,
  email      TEXT,
  subject    TEXT,
  message    TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Non-partial: serves both the full inbox and the unread filter.
CREATE INDEX ix_contact_created ON contact_message (created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. updated_at maintenance
--
-- SQLite will not touch updated_at on its own; the DEFAULT applies only on
-- INSERT. Without these, "last edited" is really "created".
--
-- Each trigger uses AFTER UPDATE OF <content columns> and deliberately omits
-- updated_at from that column list. The trigger body updates ONLY updated_at,
-- so it cannot re-enter itself. Do not rewrite these as a bare
-- `AFTER UPDATE ... WHEN NEW.updated_at = OLD.updated_at`: that form recurses
-- to the trigger-depth limit whenever recursive_triggers is ON and two writes
-- land in the same millisecond.
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_admin_user_touch
AFTER UPDATE OF email, email_normalized, username, role_id,
                can_invite_users, avatar_media_id, status, deleted_at
ON admin_user FOR EACH ROW
BEGIN
  UPDATE admin_user SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.id;
END;

CREATE TRIGGER trg_gallery_image_touch
AFTER UPDATE OF media_id, name, name_sort_key, caption, alt,
                is_published, sort_order, deleted_at
ON gallery_image FOR EACH ROW
BEGIN
  UPDATE gallery_image SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.id;
END;

CREATE TRIGGER trg_event_touch
AFTER UPDATE OF name, description, image_media_id, start_at, end_at,
                applies_to_all, deleted_at
ON event FOR EACH ROW
BEGIN
  UPDATE event SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.id;
END;

CREATE TRIGGER trg_content_block_touch
AFTER UPDATE OF block_type, value, media_id, media_alt
ON content_block FOR EACH ROW
BEGIN
  UPDATE content_block SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = OLD.key;
END;

CREATE TRIGGER trg_menu_item_display_touch
AFTER UPDATE OF badge, is_featured, hide_on_website, allergen_note
ON menu_item_display FOR EACH ROW
BEGIN
  UPDATE menu_item_display SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
   WHERE square_catalog_object_id = OLD.square_catalog_object_id AND square_env = OLD.square_env;
END;
