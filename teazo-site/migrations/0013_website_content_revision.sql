-- Serialize collection changes across admin sessions. A stale revision aborts
-- the entire D1 batch, including any deletes/inserts that follow this update.
CREATE TABLE website_content_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO website_content_revision (id, revision) VALUES (1, 0);

CREATE TRIGGER website_content_revision_conflict
BEFORE UPDATE OF revision ON website_content_revision
WHEN NEW.revision != OLD.revision + 1
BEGIN
  SELECT RAISE(ABORT, 'website_content_conflict');
END;
