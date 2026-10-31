CREATE TABLE library_records (id text PRIMARY KEY NOT NULL, owner text NOT NULL, kind text NOT NULL, name text NOT NULL, payload text NOT NULL);
--> statement-breakpoint
CREATE INDEX library_records_owner_kind ON library_records(owner,kind);
