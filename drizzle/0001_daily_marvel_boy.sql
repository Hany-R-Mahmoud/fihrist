CREATE TABLE `bookmarkJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookmarkId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('scrape','health_check') NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`attemptCount` int NOT NULL DEFAULT 0,
	`error` text,
	`queuedAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `bookmarkJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookmarkTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookmarkId` int NOT NULL,
	`tagId` int NOT NULL,
	`source` enum('automatic','manual') NOT NULL DEFAULT 'automatic',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookmarkTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookmark_tags_unique` UNIQUE(`bookmarkId`,`tagId`)
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`collectionId` int,
	`url` varchar(2048) NOT NULL,
	`normalizedUrl` varchar(2048) NOT NULL,
	`host` varchar(255) NOT NULL,
	`title` varchar(512),
	`description` text,
	`faviconUrl` varchar(2048),
	`imageUrl` varchar(2048),
	`notes` text,
	`contentText` text,
	`language` varchar(35),
	`contentDirection` enum('ltr','rtl') NOT NULL DEFAULT 'ltr',
	`ingestionStatus` enum('pending','processing','ready','failed') NOT NULL DEFAULT 'pending',
	`scrapeError` text,
	`healthStatus` enum('unchecked','healthy','redirected','broken') NOT NULL DEFAULT 'unchecked',
	`httpStatus` int,
	`lastCheckedAt` timestamp,
	`healthError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `collections_user_name_unique` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `healthCheckSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`enabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `healthCheckSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `health_settings_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(96) NOT NULL,
	`normalizedName` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_user_normalized_name_unique` UNIQUE(`userId`,`normalizedName`)
);
--> statement-breakpoint
ALTER TABLE `bookmarkJobs` ADD CONSTRAINT `bookmarkJobs_bookmarkId_bookmarks_id_fk` FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookmarkJobs` ADD CONSTRAINT `bookmarkJobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookmarkTags` ADD CONSTRAINT `bookmarkTags_bookmarkId_bookmarks_id_fk` FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookmarkTags` ADD CONSTRAINT `bookmarkTags_tagId_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD CONSTRAINT `bookmarks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD CONSTRAINT `bookmarks_collectionId_collections_id_fk` FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collections` ADD CONSTRAINT `collections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `healthCheckSettings` ADD CONSTRAINT `healthCheckSettings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `bookmark_jobs_pending_idx` ON `bookmarkJobs` (`status`,`type`,`queuedAt`);--> statement-breakpoint
CREATE INDEX `bookmark_jobs_user_idx` ON `bookmarkJobs` (`userId`);--> statement-breakpoint
CREATE INDEX `bookmark_tags_bookmark_idx` ON `bookmarkTags` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_idx` ON `bookmarks` (`userId`);--> statement-breakpoint
CREATE INDEX `bookmarks_collection_idx` ON `bookmarks` (`collectionId`);--> statement-breakpoint
CREATE INDEX `bookmarks_health_idx` ON `bookmarks` (`userId`,`healthStatus`);--> statement-breakpoint
CREATE INDEX `collections_user_idx` ON `collections` (`userId`);--> statement-breakpoint
CREATE INDEX `health_settings_task_uid_idx` ON `healthCheckSettings` (`schedule_cron_task_uid`);--> statement-breakpoint
CREATE INDEX `tags_user_idx` ON `tags` (`userId`);