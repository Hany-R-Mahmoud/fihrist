CREATE TABLE `health_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`bookmarkId` integer NOT NULL,
	`runId` integer,
	`jobId` integer,
	`checkedAt` integer NOT NULL,
	`status` text NOT NULL,
	`httpStatus` integer,
	`finalUrl` text,
	`durationMs` integer,
	`error` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`runId`) REFERENCES `health_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`jobId`) REFERENCES `bookmarkJobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `health_checks_bookmark_idx` ON `health_checks` (`bookmarkId`,`checkedAt`);--> statement-breakpoint
CREATE INDEX `health_checks_run_idx` ON `health_checks` (`runId`);--> statement-breakpoint
CREATE TABLE `health_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`trigger` text DEFAULT 'weekly' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`startedAt` integer,
	`completedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `health_runs_user_idx` ON `health_runs` (`userId`,`startedAt`);--> statement-breakpoint
CREATE TABLE `rot_digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`runId` integer NOT NULL,
	`facts` text NOT NULL,
	`narrative` text,
	`narrativeStatus` text DEFAULT 'none' NOT NULL,
	`model` text,
	`promptTokens` integer,
	`completionTokens` integer,
	`estimatedPromptTokens` integer,
	`readAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`runId`) REFERENCES `health_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rot_digests_run_unique` ON `rot_digests` (`runId`);--> statement-breakpoint
CREATE INDEX `rot_digests_user_idx` ON `rot_digests` (`userId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `bookmarkJobs` ADD `runId` integer REFERENCES health_runs(id);--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `healthAlertDismissedAt` integer;--> statement-breakpoint
ALTER TABLE `healthCheckSettings` ADD `lastRunId` integer REFERENCES health_runs(id);