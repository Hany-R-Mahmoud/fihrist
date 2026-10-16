CREATE TABLE `aiTagSuggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`bookmarkId` integer NOT NULL,
	`tagName` text NOT NULL,
	`normalizedName` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`promptTokens` integer,
	`completionTokens` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_tag_suggestions_user_idx` ON `aiTagSuggestions` (`userId`);--> statement-breakpoint
CREATE INDEX `ai_tag_suggestions_bookmark_idx` ON `aiTagSuggestions` (`bookmarkId`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_tag_suggestions_unique` ON `aiTagSuggestions` (`userId`,`bookmarkId`,`normalizedName`);