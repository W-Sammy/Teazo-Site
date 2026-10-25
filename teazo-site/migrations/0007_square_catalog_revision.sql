-- A webhook change marker, separate from the catalog's item cache/sync state.
CREATE TABLE square_catalog_revision (
  square_env TEXT PRIMARY KEY CHECK (square_env IN ('sandbox', 'production')),
  revision TEXT NOT NULL
);
