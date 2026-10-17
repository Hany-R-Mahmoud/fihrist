import { pgSchema, bigint, boolean, index, integer, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

const fihrist = pgSchema("fihrist");
const pk = (name: string) => bigint(name, { mode: "number" }).primaryKey().generatedByDefaultAsIdentity();
const created = (name: string) => timestamp(name, { withTimezone: true, mode: "date" }).notNull().defaultNow();
const nullableTime = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const collections = fihrist.table("collections", {
  id: pk("id"), userId: uuid("user_id").notNull(), name: text("name").notNull(),
  createdAt: created("created_at"), updatedAt: created("updated_at"),
}, t => [index("collections_user_idx").on(t.userId), uniqueIndex("collections_user_name_unique").on(t.userId, t.name)]);

export const bookmarks = fihrist.table("bookmarks", {
  id: pk("id"), userId: uuid("user_id").notNull(), collectionId: bigint("collection_id", { mode: "number" }),
  url: text("url").notNull(), normalizedUrl: text("normalized_url").notNull(),
  normalizedUrlHash: text("normalized_url_hash").notNull(), host: text("host").notNull(),
  title: text("title"), description: text("description"), faviconUrl: text("favicon_url"),
  imageUrl: text("image_url"), notes: text("notes"), contentText: text("content_text"),
  language: text("language"), contentDirection: text("content_direction", { enum: ["ltr","rtl"] }).notNull().default("ltr"),
  analysisSummary: text("analysis_summary"), savedReason: text("saved_reason"),
  savingBenefit: text("saving_benefit"), analysisStatus: text("analysis_status", { enum: ["pending","processing","ready","failed"] }).notNull().default("pending"),
  analysisError: text("analysis_error"), analyzedAt: nullableTime("analyzed_at"),
  ingestionStatus: text("ingestion_status", { enum: ["pending","processing","ready","failed"] }).notNull().default("pending"),
  scrapeError: text("scrape_error"), healthStatus: text("health_status", { enum: ["unchecked","healthy","redirected","broken","needs_review"] }).notNull().default("unchecked"),
  httpStatus: integer("http_status"), lastCheckedAt: nullableTime("last_checked_at"), healthError: text("health_error"),
  createdAt: created("created_at"), updatedAt: created("updated_at"),
}, t => [index("bookmarks_user_idx").on(t.userId), index("bookmarks_collection_idx").on(t.collectionId),
  uniqueIndex("bookmarks_user_normalized_hash_unique").on(t.userId,t.normalizedUrlHash)]);

export const tags = fihrist.table("tags", {
  id: pk("id"), userId: uuid("user_id").notNull(), name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(), createdAt: created("created_at"),
}, t => [uniqueIndex("tags_user_normalized_unique").on(t.userId,t.normalizedName)]);

export const bookmarkTags = fihrist.table("bookmark_tags", {
  id: pk("id"), userId: uuid("user_id").notNull(), bookmarkId: bigint("bookmark_id",{mode:"number"}).notNull(),
  tagId: bigint("tag_id",{mode:"number"}).notNull(),
  source: text("source",{enum:["automatic","manual","ai"]}).notNull().default("automatic"),
  createdAt: created("created_at"),
}, t => [uniqueIndex("bookmark_tags_unique").on(t.bookmarkId,t.tagId)]);

export const bookmarkJobs = fihrist.table("bookmark_jobs", {
  id: pk("id"), userId: uuid("user_id").notNull(), bookmarkId: bigint("bookmark_id",{mode:"number"}).notNull(),
  type: text("type",{enum:["scrape","health_check"]}).notNull(),
  status: text("status",{enum:["pending","processing","completed","failed"]}).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0), error: text("error"),
  availableAt: created("available_at"), queuedAt: created("queued_at"),
  startedAt: nullableTime("started_at"), leaseUntil: nullableTime("lease_until"),
  leaseToken: text("lease_token"), completedAt: nullableTime("completed_at"),
});

export const aiTagSuggestions = fihrist.table("ai_tag_suggestions", {
  id: pk("id"), userId: uuid("user_id").notNull(), bookmarkId: bigint("bookmark_id",{mode:"number"}).notNull(),
  tagName: text("tag_name").notNull(), normalizedName: text("normalized_name").notNull(),
  status: text("status",{enum:["pending","approved","rejected"]}).notNull().default("pending"),
  promptTokens: integer("prompt_tokens"), completionTokens: integer("completion_tokens"),
  createdAt: created("created_at"), updatedAt: created("updated_at"),
}, t => [uniqueIndex("ai_tag_suggestions_unique").on(t.userId,t.bookmarkId,t.normalizedName)]);

export const healthCheckSettings = fihrist.table("health_check_settings", {
  id: pk("id"), userId: uuid("user_id").notNull().unique(), enabled: boolean("enabled").notNull().default(true),
  lastRunAt: nullableTime("last_run_at"), lastRunStartedAt: nullableTime("last_run_started_at"),
  lastRunTotal: integer("last_run_total"), lastRunCompletedAt: nullableTime("last_run_completed_at"),
  createdAt: created("created_at"), updatedAt: created("updated_at"),
});
export type BookmarkJob = typeof bookmarkJobs.$inferSelect;
