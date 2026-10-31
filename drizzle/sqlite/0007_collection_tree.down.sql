-- Fails safely if nested siblings have duplicate names; resolve those names before rollback.
BEGIN;
CREATE UNIQUE INDEX collections_user_name_unique ON collections(userId,name);
DROP INDEX collections_user_parent_name_unique;
ALTER TABLE collections DROP COLUMN parentId;
COMMIT;
