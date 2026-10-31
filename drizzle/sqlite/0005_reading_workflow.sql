ALTER TABLE bookmarks ADD COLUMN readingStatus text NOT NULL DEFAULT 'unread' CHECK (readingStatus IN ('unread', 'reading', 'read', 'archived'));
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN starred integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN pinned integer NOT NULL DEFAULT 0;
