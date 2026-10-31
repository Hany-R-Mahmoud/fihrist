BEGIN;
ALTER TABLE fihrist.collections ADD COLUMN parent_id bigint REFERENCES fihrist.collections(id) ON DELETE SET NULL;
DROP INDEX fihrist.collections_user_name_unique;
CREATE UNIQUE INDEX collections_user_parent_name_unique ON fihrist.collections(user_id,COALESCE(parent_id,0),lower(name));
COMMIT;
