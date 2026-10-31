BEGIN;
CREATE TABLE fihrist.library_records (id text PRIMARY KEY NOT NULL, owner text NOT NULL, kind text NOT NULL, name text NOT NULL, payload text NOT NULL);
CREATE INDEX library_records_owner_kind ON fihrist.library_records(owner,kind);
ALTER TABLE fihrist.library_records ENABLE ROW LEVEL SECURITY;
COMMIT;
