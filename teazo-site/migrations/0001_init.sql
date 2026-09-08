-- TEAZO — Cloudflare D1 initial schema
-- Target: D1 (SQLite). Conventions used throughout:
--   * ids are TEXT (hex(randomblob(16))) so they can also be minted client-side
--     with crypto.randomUUID(), which the gallery admin already does.
--   * booleans are INTEGER 0/1 with a CHECK; SQLite has no BOOLEAN.
--   * enums are TEXT with a CHECK; SQLite has no ENUM and ALTER TABLE cannot
--     add a CHECK later without a full table rebuild, so they are declared now.
--   * timestamps are ISO-8601 TEXT in UTC.
--   * every table keyed on a Square object carries square_env, because sandbox
--     and production catalogs share no object ids. Without it, the production
--     cutover silently orphans every curation row.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 1. Identity & access
-- ---------------------------------------------------------------------------

CREATE TABLE role (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  rank        INTEGER NOT NULL          -- lower rank = more privilege
);

CREATE TABLE admin_user (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email            TEXT NOT NULL,
  -- SQLite's NOCASE collation folds ASCII only, so normalization is explicit.
  email_normalized TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  role_id          INTEGER NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  avatar_media_id  TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
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
-- that guard belongs in the delete/demote handler.
CREATE UNIQUE INDEX ux_admin_user_single_owner
  ON admin_user (role_id) WHERE role_id = 1 AND deleted_at IS NULL;

-- Google SSO identity only. Deliberately stores no access/refresh token:
-- the app never calls a Google API on the user's behalf, it only needs `sub`.
CREATE TABLE oauth_account (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admin_user_id       TEXT NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL CHECK (provider IN ('google')),
  provider_account_id TEXT NOT NULL,        -- Google `sub`
  email_at_provider   TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_oauth_provider_account
  ON oauth_account (provider, provider_account_id);
CREATE INDEX ix_oauth_user ON oauth_account (admin_user_id);

-- Session rows are deliberately write-light: there is no last_seen_at, because
-- one UPDATE per authenticated request is the canonical D1 anti-pattern.
-- Revocation is what this table exists for (Settings > delete admin).
CREATE TABLE admin_session (
  id            TEXT PRIMARY KEY,          -- SHA-256 of the cookie value
  admin_user_id TEXT NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);

CREATE INDEX ix_session_user ON admin_session (admin_user_id);
CREATE INDEX ix_session_expiry ON admin_session (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE admin_invitation (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email         TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  token_hash    TEXT NOT NULL UNIQUE,
  invited_by    TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT NOT NULL,
  accepted_at   TEXT,
  revoked_at    TEXT
);

-- One live invite per address.
CREATE UNIQUE INDEX ux_invitation_pending
  ON admin_invitation (email_normalized)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Media — D1 holds the metadata, R2 holds the bytes
-- ---------------------------------------------------------------------------

CREATE TABLE media_asset (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  r2_bucket         TEXT NOT NULL,
  r2_key            TEXT NOT NULL,
  mime_type         TEXT NOT NULL
                      CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size         INTEGER NOT NULL CHECK (byte_size > 0),
  width             INTEGER,             -- null for PDFs
  height            INTEGER,
  original_filename TEXT,
  alt               TEXT,
  purpose           TEXT NOT NULL DEFAULT 'gallery'
                      CHECK (purpose IN ('gallery','menu_item','event','document','branding','carousel')),
  uploaded_by       TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);

-- Partial so that deleting and re-uploading the same key succeeds.
CREATE UNIQUE INDEX ux_media_key
  ON media_asset (r2_bucket, r2_key) WHERE deleted_at IS NULL;
CREATE INDEX ix_media_purpose ON media_asset (purpose, created_at DESC)
  WHERE deleted_at IS NULL;

-- Bytes to reap from R2 after a row is soft-deleted. D1 has no TTL and no
-- scheduled jobs of its own, so a cron-triggered Worker drains this.
CREATE TABLE pending_r2_deletion (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  r2_bucket   TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  queued_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT,
  last_error  TEXT
);

CREATE INDEX ix_pending_deletion_open ON pending_r2_deletion (queued_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Gallery
-- ---------------------------------------------------------------------------

CREATE TABLE gallery_image (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  media_id      TEXT NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  -- Precomputed with Intl.Collator in the Worker. SQLite ships only BINARY /
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
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE TABLE business_hours (
  day_of_week  INTEGER PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Monday
  display_text TEXT NOT NULL,          -- "11:00 AM - 8:00 PM", rendered verbatim
  opens_at     TEXT,                   -- "11:00" — populate only if a feature computes open/closed
  closes_at    TEXT,
  is_closed    INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0,1)),
  note         TEXT
);

-- Holiday closures and one-off early closes: the most common hours edit a
-- shop owner makes, and unrepresentable in business_hours alone.
CREATE TABLE hours_exception (
  date         TEXT PRIMARY KEY,        -- ISO date, YYYY-MM-DD
  is_closed    INTEGER NOT NULL DEFAULT 1 CHECK (is_closed IN (0,1)),
  display_text TEXT,
  note         TEXT
);

-- One table for social + delivery + any other outbound link. These were four
-- competing tables in the draft for what is, in total, about eight URLs.
CREATE TABLE site_link (
  key           TEXT PRIMARY KEY,       -- 'instagram', 'doordash', ...
  link_group    TEXT NOT NULL CHECK (link_group IN ('social','delivery','other')),
  label         TEXT NOT NULL,
  url           TEXT NOT NULL,
  aria_label    TEXT,
  icon_media_id TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE INDEX ix_site_link_group ON site_link (link_group, sort_order, key)
  WHERE is_active = 1;

-- Editable copy. Natural key `page_key.slot_key` keeps reads a single lookup
-- and makes the seed self-documenting.
CREATE TABLE content_block (
  key        TEXT PRIMARY KEY,          -- 'home.hero_heading'
  page_key   TEXT NOT NULL,             -- 'home', 'contact', 'delivery', ...
  slot_key   TEXT NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'text'
               CHECK (block_type IN ('text','richtext','url','media','number')),
  value      TEXT,
  media_id   TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES admin_user(id) ON DELETE SET NULL
);

CREATE INDEX ix_content_block_page ON content_block (page_key, slot_key);

-- Home-page carousel. Currently a bare string[] of /carousel_images paths.
CREATE TABLE carousel_slide (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  media_id   TEXT NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
  alt        TEXT,
  caption    TEXT,
  link_url   TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE INDEX ix_carousel_active ON carousel_slide (sort_order, id) WHERE is_active = 1;

-- The downloadable PDF menu behind /static-menu. Versioned so replacing it is
-- an insert, not a destructive overwrite of a live URL.
CREATE TABLE menu_document (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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
-- categories, modifier lists, per-category ordinal, sold-out state and online
-- visibility. Nothing below may be edited as a competing source of truth.
-- These tables exist so the public menu renders fast and still renders when
-- Square is unreachable, and so the shop can curate presentation Square
-- genuinely cannot express (section subtitles, the synthetic "TEAZO Special"
-- grouping, and the 65 curated local photographs).
-- ---------------------------------------------------------------------------

CREATE TABLE square_sync_state (
  key                  TEXT PRIMARY KEY,   -- 'catalog'
  square_env           TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  last_catalog_version INTEGER,
  last_synced_at       TEXT,
  last_error           TEXT
);

CREATE TABLE catalog_item_cache (
  square_object_id  TEXT NOT NULL,
  square_env        TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  square_version    INTEGER,              -- optimistic-concurrency token; staleness check
  name              TEXT,
  description       TEXT,
  variation_id      TEXT,
  price_cents       INTEGER,
  currency          TEXT NOT NULL DEFAULT 'USD',
  square_image_url  TEXT,
  categories_json   TEXT CHECK (categories_json IS NULL OR json_valid(categories_json)),
  modifiers_json    TEXT CHECK (modifiers_json IS NULL OR json_valid(modifiers_json)),
  is_deleted        INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  synced_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (square_object_id, square_env)
);

CREATE INDEX ix_catalog_live ON catalog_item_cache (square_env, name) WHERE is_deleted = 0;

-- Sections on the public menu. square_category_id is NULLABLE precisely so the
-- synthetic "TEAZO Special" block — which has no Square CATEGORY object — is
-- representable.
CREATE TABLE menu_section (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  square_category_id TEXT,
  square_env         TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  title              TEXT NOT NULL,
  subtitle           TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_published       INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1))
);

CREATE UNIQUE INDEX ux_menu_section_category
  ON menu_section (square_category_id, square_env) WHERE square_category_id IS NOT NULL;
CREATE INDEX ix_menu_section_order ON menu_section (sort_order, id) WHERE is_published = 1;

CREATE TABLE menu_section_item (
  section_id               TEXT NOT NULL REFERENCES menu_section(id) ON DELETE CASCADE,
  square_catalog_object_id TEXT NOT NULL,
  square_env               TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  position                 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (section_id, square_catalog_object_id, square_env)
);

CREATE INDEX ix_menu_section_item_order ON menu_section_item (section_id, position, square_catalog_object_id);

-- Presentation-only overlay. One row per catalog object per environment.
-- Deliberately holds NO price, name, availability or modifier data — those
-- would drift against the register.
CREATE TABLE menu_item_display (
  square_catalog_object_id TEXT NOT NULL,
  square_env               TEXT NOT NULL CHECK (square_env IN ('sandbox','production')),
  image_media_id           TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
  badge                    TEXT CHECK (badge IS NULL OR badge IN ('new','seasonal','popular','limited')),
  is_featured              INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  hide_on_website          INTEGER NOT NULL DEFAULT 0 CHECK (hide_on_website IN (0,1)),
  allergen_note            TEXT,
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by               TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  PRIMARY KEY (square_catalog_object_id, square_env)
);

CREATE INDEX ix_menu_item_featured ON menu_item_display (square_env)
  WHERE is_featured = 1;

-- ---------------------------------------------------------------------------
-- 6. Events & inquiries
-- ---------------------------------------------------------------------------

CREATE TABLE event (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL,
  description    TEXT,
  starts_at      TEXT NOT NULL,
  ends_at        TEXT,
  location_text  TEXT,
  flyer_media_id TEXT REFERENCES media_asset(id) ON DELETE SET NULL,
  is_published   INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by     TEXT REFERENCES admin_user(id) ON DELETE SET NULL,
  deleted_at     TEXT
);

CREATE UNIQUE INDEX ux_event_slug ON event (slug) WHERE deleted_at IS NULL;
CREATE INDEX ix_event_schedule ON event (starts_at DESC, id)
  WHERE is_published = 1 AND deleted_at IS NULL;

-- The contact form currently posts to a mailto: with encType="text/plain",
-- which most browsers drop silently — every inquiry sent so far is lost.
-- Columns match the five inputs the form actually collects.
CREATE TABLE contact_message (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT,
  last_name  TEXT,
  email      TEXT,
  subject    TEXT,
  message    TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_contact_unread ON contact_message (created_at DESC) WHERE is_read = 0;
