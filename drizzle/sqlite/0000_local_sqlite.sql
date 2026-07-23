CREATE TABLE `bookmarkJobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bookmarkId` integer NOT NULL,
	`userId` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attemptCount` integer DEFAULT 0 NOT NULL,
	`error` text,
	`availableAt` integer NOT NULL,
	`queuedAt` integer NOT NULL,
	`startedAt` integer,
	`leaseUntil` integer,
	`leaseToken` text,
	`completedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_jobs_pending_idx` ON `bookmarkJobs` (`status`,`type`,`availableAt`,`queuedAt`);--> statement-breakpoint
CREATE INDEX `bookmark_jobs_lease_idx` ON `bookmarkJobs` (`status`,`leaseUntil`);--> statement-breakpoint
CREATE INDEX `bookmark_jobs_user_idx` ON `bookmarkJobs` (`userId`);--> statement-breakpoint
CREATE TABLE `bookmarkTags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bookmarkId` integer NOT NULL,
	`tagId` integer NOT NULL,
	`source` text DEFAULT 'automatic' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_tags_bookmark_idx` ON `bookmarkTags` (`bookmarkId`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_tags_unique` ON `bookmarkTags` (`bookmarkId`,`tagId`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`collectionId` integer,
	`url` text NOT NULL,
	`normalizedUrl` text NOT NULL,
	`normalizedUrlHash` text NOT NULL,
	`host` text NOT NULL,
	`title` text,
	`description` text,
	`faviconUrl` text,
	`imageUrl` text,
	`notes` text,
	`contentText` text,
	`language` text,
	`contentDirection` text DEFAULT 'ltr' NOT NULL,
	`analysisSummary` text,
	`savedReason` text,
	`savingBenefit` text,
	`analysisStatus` text DEFAULT 'pending' NOT NULL,
	`analysisError` text,
	`analyzedAt` integer,
	`ingestionStatus` text DEFAULT 'pending' NOT NULL,
	`scrapeError` text,
	`healthStatus` text DEFAULT 'unchecked' NOT NULL,
	`httpStatus` integer,
	`lastCheckedAt` integer,
	`healthError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookmarks_user_idx` ON `bookmarks` (`userId`);--> statement-breakpoint
CREATE INDEX `bookmarks_collection_idx` ON `bookmarks` (`collectionId`);--> statement-breakpoint
CREATE INDEX `bookmarks_health_idx` ON `bookmarks` (`userId`,`healthStatus`);--> statement-breakpoint
CREATE INDEX `bookmarks_analysis_idx` ON `bookmarks` (`userId`,`analysisStatus`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_normalized_url_hash_unique` ON `bookmarks` (`userId`,`normalizedUrlHash`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collections_user_idx` ON `collections` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `collections_user_name_unique` ON `collections` (`userId`,`name`);--> statement-breakpoint
CREATE TABLE `healthCheckSettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`lastRunAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_settings_user_unique` ON `healthCheckSettings` (`userId`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_user_idx` ON `tags` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_normalized_name_unique` ON `tags` (`userId`,`normalizedName`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'admin' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);