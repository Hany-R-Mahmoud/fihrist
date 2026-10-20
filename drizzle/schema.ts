import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("admin"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  lastSignedIn: timestamp("lastSignedIn"),
});

export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    index("collections_user_idx").on(table.userId),
    uniqueIndex("collections_user_name_unique").on(table.userId, table.name),
  ]
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    collectionId: integer("collectionId").references(() => collections.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    normalizedUrl: text("normalizedUrl").notNull(),
    normalizedUrlHash: text("normalizedUrlHash").notNull(),
    host: text("host").notNull(),
    title: text("title"),
    description: text("description"),
    faviconUrl: text("faviconUrl"),
    imageUrl: text("imageUrl"),
    notes: text("notes"),
    contentText: text("contentText"),
    language: text("language"),
    contentDirection: text("contentDirection", { enum: ["ltr", "rtl"] })
      .notNull()
      .default("ltr"),
    analysisSummary: text("analysisSummary"),
    savedReason: text("savedReason"),
    savingBenefit: text("savingBenefit"),
    analysisStatus: text("analysisStatus", {
      enum: ["pending", "processing", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    analysisError: text("analysisError"),
    analyzedAt: integer("analyzedAt", { mode: "timestamp_ms" }),
    ingestionStatus: text("ingestionStatus", {
      enum: ["pending", "processing", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    scrapeError: text("scrapeError"),
    healthStatus: text("healthStatus", {
      enum: ["unchecked", "healthy", "redirected", "broken", "needs_review"],
    })
      .notNull()
      .default("unchecked"),
    httpStatus: integer("httpStatus"),
    lastCheckedAt: integer("lastCheckedAt", { mode: "timestamp_ms" }),
    healthError: text("healthError"),
    // Set when the owner dismisses a link from the rot digest. The digest
    // hides the link until its next status transition, not until a date.
    healthAlertDismissedAt: integer("healthAlertDismissedAt", { mode: "timestamp_ms" }),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    index("bookmarks_user_idx").on(table.userId),
    index("bookmarks_collection_idx").on(table.collectionId),
    index("bookmarks_health_idx").on(table.userId, table.healthStatus),
    index("bookmarks_analysis_idx").on(table.userId, table.analysisStatus),
    uniqueIndex("bookmarks_user_normalized_url_hash_unique").on(
      table.userId,
      table.normalizedUrlHash
    ),
  ]
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalizedName").notNull(),
    createdAt: timestamp("createdAt"),
  },
  table => [
    index("tags_user_idx").on(table.userId),
    uniqueIndex("tags_user_normalized_name_unique").on(table.userId, table.normalizedName),
  ]
);

export const bookmarkTags = sqliteTable(
  "bookmarkTags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookmarkId: integer("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: integer("tagId")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["automatic", "manual", "ai"] })
      .notNull()
      .default("automatic"),
    createdAt: timestamp("createdAt"),
  },
  table => [
    index("bookmark_tags_bookmark_idx").on(table.bookmarkId),
    uniqueIndex("bookmark_tags_unique").on(table.bookmarkId, table.tagId),
  ]
);

/**
 * One row per health run. `bookmarkJobs` is one row per bookmark, so a run
 * needs its own record: `health_checks.runId` and `rot_digests.runId` both
 * point here, and the timeline groups rows under it.
 */
export const healthRuns = sqliteTable(
  "health_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["weekly", "manual", "single"] })
      .notNull()
      .default("weekly"),
    status: text("status", { enum: ["running", "completed"] })
      .notNull()
      .default("running"),
    total: integer("total").notNull().default(0),
    checked: integer("checked").notNull().default(0),
    startedAt: integer("startedAt", { mode: "timestamp_ms" }),
    completedAt: integer("completedAt", { mode: "timestamp_ms" }),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    index("health_runs_user_idx").on(table.userId, table.startedAt),
  ]
);

export const bookmarkJobs = sqliteTable(
  "bookmarkJobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookmarkId: integer("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["scrape", "health_check"] }).notNull(),
    status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
      .notNull()
      .default("pending"),
    // Explicit link to the health run this job belongs to. Attribution is
    // never inferred from timestamps.
    runId: integer("runId").references(() => healthRuns.id, { onDelete: "set null" }),
    attemptCount: integer("attemptCount").notNull().default(0),
    error: text("error"),
    availableAt: timestamp("availableAt"),
    queuedAt: timestamp("queuedAt"),
    startedAt: integer("startedAt", { mode: "timestamp_ms" }),
    leaseUntil: integer("leaseUntil", { mode: "timestamp_ms" }),
    leaseToken: text("leaseToken"),
    completedAt: integer("completedAt", { mode: "timestamp_ms" }),
  },
  table => [
    index("bookmark_jobs_pending_idx").on(
      table.status,
      table.type,
      table.availableAt,
      table.queuedAt
    ),
    index("bookmark_jobs_lease_idx").on(table.status, table.leaseUntil),
    index("bookmark_jobs_user_idx").on(table.userId),
  ]
);

export const aiTagSuggestions = sqliteTable(
  "aiTagSuggestions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookmarkId: integer("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagName: text("tagName").notNull(),
    normalizedName: text("normalizedName").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    promptTokens: integer("promptTokens"),
    completionTokens: integer("completionTokens"),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    index("ai_tag_suggestions_user_idx").on(table.userId),
    index("ai_tag_suggestions_bookmark_idx").on(table.bookmarkId, table.status),
    uniqueIndex("ai_tag_suggestions_unique").on(
      table.userId,
      table.bookmarkId,
      table.normalizedName
    ),
  ]
);

export const healthCheckSettings = sqliteTable(
  "healthCheckSettings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastRunAt: integer("lastRunAt", { mode: "timestamp_ms" }),
    lastRunId: integer("lastRunId").references(() => healthRuns.id, { onDelete: "set null" }),
    lastRunStartedAt: integer("lastRunStartedAt", { mode: "timestamp_ms" }),
    lastRunTotal: integer("lastRunTotal"),
    lastRunCompletedAt: integer("lastRunCompletedAt", { mode: "timestamp_ms" }),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    uniqueIndex("health_settings_user_unique").on(table.userId),
  ]
);

/**
 * One row per health check. This is the timeline's foundation: the bookmark
 * row keeps only the latest state, this table keeps every check.
 */
export const healthChecks = sqliteTable(
  "health_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookmarkId: integer("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    runId: integer("runId").references(() => healthRuns.id, { onDelete: "cascade" }),
    jobId: integer("jobId").references(() => bookmarkJobs.id, { onDelete: "set null" }),
    checkedAt: integer("checkedAt", { mode: "timestamp_ms" }).notNull(),
    status: text("status", {
      enum: ["healthy", "redirected", "broken", "needs_review"],
    }).notNull(),
    httpStatus: integer("httpStatus"),
    finalUrl: text("finalUrl"),
    // Measured by the recording wrapper around the check, never by the
    // classifier — the classifier does not time anything.
    durationMs: integer("durationMs"),
    error: text("error"),
    createdAt: timestamp("createdAt"),
  },
  table => [
    index("health_checks_bookmark_idx").on(table.bookmarkId, table.checkedAt),
    index("health_checks_run_idx").on(table.runId),
  ]
);

/**
 * The narrative rot report. Layer 1 (facts JSON) is always present; layer 2
 * (narrative) is optional and written only when the BYOK path succeeds.
 */
export const rotDigests = sqliteTable(
  "rot_digests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: integer("runId")
      .notNull()
      .references(() => healthRuns.id, { onDelete: "cascade" }),
    facts: text("facts").notNull(),
    narrative: text("narrative"),
    narrativeStatus: text("narrativeStatus", { enum: ["none", "ok", "failed"] })
      .notNull()
      .default("none"),
    model: text("model"),
    promptTokens: integer("promptTokens"),
    completionTokens: integer("completionTokens"),
    estimatedPromptTokens: integer("estimatedPromptTokens"),
    readAt: integer("readAt", { mode: "timestamp_ms" }),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    uniqueIndex("rot_digests_run_unique").on(table.runId),
    index("rot_digests_user_idx").on(table.userId, table.createdAt),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type BookmarkJob = typeof bookmarkJobs.$inferSelect;
export type HealthRun = typeof healthRuns.$inferSelect;
export type HealthCheck = typeof healthChecks.$inferSelect;
export type RotDigest = typeof rotDigests.$inferSelect;
