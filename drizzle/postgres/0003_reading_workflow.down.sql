BEGIN;
ALTER TABLE fihrist.bookmarks DROP COLUMN pinned;
ALTER TABLE fihrist.bookmarks DROP COLUMN starred;
ALTER TABLE fihrist.bookmarks DROP COLUMN reading_status;
COMMIT;
