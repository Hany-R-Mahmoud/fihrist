import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const collections = mysqlTable(
  "collections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("collections_user_idx").on(table.userId),
    uniqueIndex("collections_user_name_unique").on(table.userId, table.name),
  ]
);

export const bookmarks = mysqlTable(
  "bookmarks",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    collectionId: int("collectionId").references(() => collections.id, {
      onDelete: "set null",
    }),
    url: varchar("url", { length: 2048 }).notNull(),
    normalizedUrl: varchar("normalizedUrl", { length: 2048 }).notNull(),
    host: varchar("host", { length: 255 }).notNull(),
    title: varchar("title", { length: 512 }),
    description: text("description"),
    faviconUrl: varchar("faviconUrl", { length: 2048 }),
    imageUrl: varchar("imageUrl", { length: 2048 }),
    notes: text("notes"),
    contentText: text("contentText"),
    language: varchar("language", { length: 35 }),
    contentDirection: mysqlEnum("contentDirection", ["ltr", "rtl"])
      .default("ltr")
      .notNull(),
    analysisSummary: text("analysisSummary"),
    savedReason: text("savedReason"),
    savingBenefit: text("savingBenefit"),
    analysisStatus: mysqlEnum("analysisStatus", [
      "pending",
      "processing",
      "ready",
      "failed",
    ])
      .default("pending")
      .notNull(),
    analysisError: text("analysisError"),
    analyzedAt: timestamp("analyzedAt"),
    ingestionStatus: mysqlEnum("ingestionStatus", [
      "pending",
      "processing",
      "ready",
      "failed",
    ])
      .default("pending")
      .notNull(),
    scrapeError: text("scrapeError"),
    healthStatus: mysqlEnum("healthStatus", [
      "unchecked",
      "healthy",
      "redirected",
      "broken",
    ])
      .default("unchecked")
      .notNull(),
    httpStatus: int("httpStatus"),
    lastCheckedAt: timestamp("lastCheckedAt"),
    healthError: text("healthError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("bookmarks_user_idx").on(table.userId),
    index("bookmarks_collection_idx").on(table.collectionId),
    index("bookmarks_health_idx").on(table.userId, table.healthStatus),
    index("bookmarks_analysis_idx").on(table.userId, table.analysisStatus),
  ]
);

export const tags = mysqlTable(
  "tags",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 96 }).notNull(),
    normalizedName: varchar("normalizedName", { length: 96 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("tags_user_idx").on(table.userId),
    uniqueIndex("tags_user_normalized_name_unique").on(
      table.userId,
      table.normalizedName
    ),
  ]
);

export const bookmarkTags = mysqlTable(
  "bookmarkTags",
  {
    id: int("id").autoincrement().primaryKey(),
    bookmarkId: int("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: int("tagId")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: mysqlEnum("source", ["automatic", "manual"])
      .default("automatic")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("bookmark_tags_bookmark_idx").on(table.bookmarkId),
    uniqueIndex("bookmark_tags_unique").on(table.bookmarkId, table.tagId),
  ]
);

export const bookmarkJobs = mysqlTable(
  "bookmarkJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    bookmarkId: int("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ["scrape", "health_check"]).notNull(),
    status: mysqlEnum("status", ["pending", "processing", "completed", "failed"])
      .default("pending")
      .notNull(),
    attemptCount: int("attemptCount").default(0).notNull(),
    error: text("error"),
    queuedAt: timestamp("queuedAt").defaultNow().notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
  },
  table => [
    index("bookmark_jobs_pending_idx").on(table.status, table.type, table.queuedAt),
    index("bookmark_jobs_user_idx").on(table.userId),
  ]
);

export const healthCheckSettings = mysqlTable(
  "healthCheckSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
    enabled: boolean("enabled").default(true).notNull(),
    lastRunAt: timestamp("lastRunAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("health_settings_user_unique").on(table.userId),
    index("health_settings_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type BookmarkJob = typeof bookmarkJobs.$inferSelect;
