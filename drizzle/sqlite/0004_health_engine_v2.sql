ALTER TABLE bookmarks ADD COLUMN failureClass TEXT;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN moveClass TEXT;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN checksDisabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN healthNote TEXT;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN originalUrl TEXT;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN archiveUrl TEXT;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN archiveTimestamp INTEGER;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN archiveCheckedAt INTEGER;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN archiveLookupRunId INTEGER;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN soft404Streak INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN soft404LastRunId INTEGER;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN persistentFailure INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN persistentFailureClass TEXT;
--> statement-breakpoint
ALTER TABLE bookmarks ADD COLUMN persistentFailureStreak INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN failureClass TEXT;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN networkCode TEXT;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN redirectChain TEXT;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN finalHost TEXT;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN titleSnapshot TEXT;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN bodyHash TEXT;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN contentLength INTEGER;
--> statement-breakpoint
ALTER TABLE health_checks ADD COLUMN moveClass TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS domainPacing (host TEXT PRIMARY KEY, lastCheckedAt INTEGER, leaseUntil INTEGER, leaseToken TEXT);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hostProbes (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT NOT NULL, runId INTEGER NOT NULL, resultStatus INTEGER, finalUrl TEXT, title TEXT, bodyHash TEXT, bodySample TEXT, sampledAt INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS host_probes_host_run_unique ON hostProbes(host,runId);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS healthRollups (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, bookmarkId INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE, prunedCheckCount INTEGER NOT NULL DEFAULT 0, firstCheckedAt INTEGER, firstBrokenAt INTEGER, lastPrunedStatus TEXT, lastPrunedAt INTEGER, statusSince INTEGER, openStreak INTEGER NOT NULL DEFAULT 0, brokenSince INTEGER);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS health_rollups_user_bookmark_unique ON healthRollups(userId,bookmarkId);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS topicDismissals (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, bookmarkId INTEGER NOT NULL DEFAULT 0, normalizedName TEXT NOT NULL, createdAt INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS topic_dismissals_key_unique ON topicDismissals(userId,bookmarkId,normalizedName);
