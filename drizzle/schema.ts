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
      enum: ["unchecked", "healthy", "redirected", "broken"],
    })
      .notNull()
      .default("unchecked"),
    httpStatus: integer("httpStatus"),
    lastCheckedAt: integer("lastCheckedAt", { mode: "timestamp_ms" }),
    healthError: text("healthError"),
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
    source: text("source", { enum: ["automatic", "manual"] })
      .notNull()
      .default("automatic"),
    createdAt: timestamp("createdAt"),
  },
  table => [
    index("bookmark_tags_bookmark_idx").on(table.bookmarkId),
    uniqueIndex("bookmark_tags_unique").on(table.bookmarkId, table.tagId),
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

export const healthCheckSettings = sqliteTable(
  "healthCheckSettings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastRunAt: integer("lastRunAt", { mode: "timestamp_ms" }),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
  },
  table => [
    uniqueIndex("health_settings_user_unique").on(table.userId),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type BookmarkJob = typeof bookmarkJobs.$inferSelect;
