BEGIN;
CREATE UNIQUE INDEX collections_user_name_unique ON fihrist.collections(user_id,name);
DROP INDEX fihrist.collections_user_parent_name_unique;
ALTER TABLE fihrist.collections DROP COLUMN parent_id;
COMMIT;
