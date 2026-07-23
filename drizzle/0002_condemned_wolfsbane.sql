ALTER TABLE `bookmarks` ADD `analysisSummary` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `savedReason` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `savingBenefit` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `analysisStatus` enum('pending','processing','ready','failed') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `analysisError` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `analyzedAt` timestamp;--> statement-breakpoint
CREATE INDEX `bookmarks_analysis_idx` ON `bookmarks` (`userId`,`analysisStatus`);
