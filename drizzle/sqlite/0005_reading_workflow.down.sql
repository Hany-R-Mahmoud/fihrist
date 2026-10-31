BEGIN;
ALTER TABLE bookmarks DROP COLUMN pinned;
ALTER TABLE bookmarks DROP COLUMN starred;
ALTER TABLE bookmarks DROP COLUMN readingStatus;
COMMIT;
