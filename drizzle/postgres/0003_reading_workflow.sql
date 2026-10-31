BEGIN;
ALTER TABLE fihrist.bookmarks ADD COLUMN reading_status text NOT NULL DEFAULT 'unread' CHECK (reading_status IN ('unread', 'reading', 'read', 'archived'));
ALTER TABLE fihrist.bookmarks ADD COLUMN starred boolean NOT NULL DEFAULT false;
ALTER TABLE fihrist.bookmarks ADD COLUMN pinned boolean NOT NULL DEFAULT false;
COMMIT;
