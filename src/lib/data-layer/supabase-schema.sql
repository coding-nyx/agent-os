-- AraDataLayer — Supabase schema
--
-- A single generic table stores all collections.  The `collection` column acts
-- as a namespace; subcollection-style paths (e.g. "sessions/s1/messages") are
-- treated as plain string keys, exactly like the InMemoryDataLayer does.
--
-- Apply once per environment:
--   psql $DATABASE_URL -f supabase-schema.sql
-- Or paste into the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS nexus_documents (
  collection  TEXT        NOT NULL,
  id          TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

-- Fast collection-scoped scans
CREATE INDEX IF NOT EXISTS nexus_documents_collection_idx
  ON nexus_documents (collection);

-- Keep updated_at current on every write
CREATE OR REPLACE FUNCTION nexus_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_documents_updated_at ON nexus_documents;
CREATE TRIGGER nexus_documents_updated_at
  BEFORE UPDATE ON nexus_documents
  FOR EACH ROW EXECUTE FUNCTION nexus_set_updated_at();

-- Enable Supabase Realtime so subscribeToDocument / subscribeToQuery work.
-- Run this as a superuser or via Supabase dashboard > Database > Replication.
-- ALTER PUBLICATION supabase_realtime ADD TABLE nexus_documents;
