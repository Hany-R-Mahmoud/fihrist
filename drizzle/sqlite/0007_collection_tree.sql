ALTER TABLE collections ADD COLUMN parentId integer REFERENCES collections(id) ON DELETE SET NULL;
--> statement-breakpoint
DROP INDEX collections_user_name_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX collections_user_parent_name_unique ON collections(userId,COALESCE(parentId,0),lower(name));
