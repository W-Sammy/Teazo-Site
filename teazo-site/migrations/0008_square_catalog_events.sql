-- Event identity determines deduplication; timestamps and ID ordering do not.
CREATE TABLE square_catalog_event (
  square_env TEXT NOT NULL CHECK (square_env IN ('sandbox', 'production')),
  event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revision TEXT NOT NULL,
  PRIMARY KEY (square_env, event_id)
);

-- Preserve deduplication of the last event recorded before this migration.
-- Legacy revisions have the form YYYY-MM-DDTHH:mm:ss.sssZ:event-id.
INSERT INTO square_catalog_event (square_env, event_id, created_at, revision)
SELECT square_env, substr(revision, 26), substr(revision, 1, 24), revision
FROM square_catalog_revision
WHERE substr(revision, 25, 1) = ':' AND length(revision) > 25;
