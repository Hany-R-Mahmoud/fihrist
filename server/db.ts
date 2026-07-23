import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  bookmarkJobs,
  bookmarks,
  bookmarkTags,
  collections,
  healthCheckSettings,
  type InsertUser,
  tags,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export type BookmarkTagSummary = {
  id: number;
  name: string;
  source: "automatic" | "manual";
};

export type BookmarkRecord = typeof bookmarks.$inferSelect & {
  collectionName: string | null;
  tags: BookmarkTagSummary[];
};

export type BookmarkInsert = Pick<
  typeof bookmarks.$inferInsert,
  "userId" | "collectionId" | "url" | "normalizedUrl" | "host"
>;

export type BookmarkMetadataUpdate = Pick<
  typeof bookmarks.$inferInsert,
  | "title"
  | "description"
  | "faviconUrl"
  | "imageUrl"
  | "contentText"
  | "language"
  | "contentDirection"
  | "ingestionStatus"
  | "scrapeError"
>;

export type BookmarkAnalysisUpdate = Pick<
  typeof bookmarks.$inferInsert,
  | "analysisSummary"
  | "savedReason"
  | "savingBenefit"
  | "analysisStatus"
  | "analysisError"
  | "analyzedAt"
>;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= values.lastSignedIn;

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function listCollections(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(asc(collections.name));
}

export async function createCollection(userId: number, name: string) {
  const db = await requireDb();
  const result = await db.insert(collections).values({ userId, name });
  const id = Number(result[0].insertId);
  return getCollection(userId, id);
}

export async function getCollection(userId: number, collectionId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);
  return result[0];
}

export async function renameCollection(
  userId: number,
  collectionId: number,
  name: string
) {
  const db = await requireDb();
  await db
    .update(collections)
    .set({ name })
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)));
  return getCollection(userId, collectionId);
}

export async function deleteCollection(userId: number, collectionId: number) {
  const db = await requireDb();
  await db
    .delete(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)));
}

export async function createBookmark(input: BookmarkInsert) {
  const db = await requireDb();
  const result = await db.insert(bookmarks).values(input);
  return getBookmark(input.userId, Number(result[0].insertId));
}

async function hydrateBookmarks(
  userId: number,
  rows: (typeof bookmarks.$inferSelect)[]
): Promise<BookmarkRecord[]> {
  if (!rows.length) return [];
  const db = await requireDb();
  const bookmarkIds = rows.map(row => row.id);
  const tagRows = await db
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      id: tags.id,
      name: tags.name,
      source: bookmarkTags.source,
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(
      and(inArray(bookmarkTags.bookmarkId, bookmarkIds), eq(tags.userId, userId))
    );

  const tagMap = new Map<number, BookmarkTagSummary[]>();
  for (const tagRow of tagRows) {
    const existing = tagMap.get(tagRow.bookmarkId) ?? [];
    existing.push({
      id: tagRow.id,
      name: tagRow.name,
      source: tagRow.source,
    });
    tagMap.set(tagRow.bookmarkId, existing);
  }

  const collectionIds = Array.from(
    new Set(
      rows.flatMap(row => (row.collectionId === null ? [] : [row.collectionId]))
    )
  );
  const collectionRows = collectionIds.length
    ? await db
        .select({ id: collections.id, name: collections.name })
        .from(collections)
        .where(
          and(
            eq(collections.userId, userId),
            inArray(collections.id, collectionIds)
          )
        )
    : [];
  const collectionMap = new Map(collectionRows.map(row => [row.id, row.name]));

  return rows.map(row => ({
    ...row,
    collectionName:
      row.collectionId === null ? null : collectionMap.get(row.collectionId) ?? null,
    tags: tagMap.get(row.id) ?? [],
  }));
}

export async function getBookmark(userId: number, bookmarkId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
    .limit(1);
  const hydrated = await hydrateBookmarks(userId, rows);
  return hydrated[0];
}

export async function listBookmarks(
  userId: number,
  filters: {
    collectionId?: number;
    healthStatus?: "unchecked" | "healthy" | "redirected" | "broken";
  } = {}
) {
  const db = await requireDb();
  const clauses = [eq(bookmarks.userId, userId)];
  if (filters.collectionId !== undefined) {
    clauses.push(eq(bookmarks.collectionId, filters.collectionId));
  }
  if (filters.healthStatus !== undefined) {
    clauses.push(eq(bookmarks.healthStatus, filters.healthStatus));
  }
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(...clauses))
    .orderBy(desc(bookmarks.createdAt));
  return hydrateBookmarks(userId, rows);
}

export function normalizeSearchTerms(query: string) {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
}

export function matchesBookmarkSearch(
  bookmark: Pick<BookmarkRecord, "title" | "description" | "notes" | "contentText" | "host" | "tags">,
  terms: string[]
) {
  const haystack = [
    bookmark.title,
    bookmark.description,
    bookmark.notes,
    bookmark.contentText,
    bookmark.host,
    ...bookmark.tags.map(tag => tag.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return terms.every(term => haystack.includes(term));
}

export async function searchBookmarks(userId: number, query: string) {
  const terms = normalizeSearchTerms(query);
  if (!terms.length) return listBookmarks(userId);

  const bookmarkRows = await listBookmarks(userId);
  return bookmarkRows.filter(bookmark => matchesBookmarkSearch(bookmark, terms));
}

export async function updateBookmarkNotes(
  userId: number,
  bookmarkId: number,
  notes: string | null
) {
  const db = await requireDb();
  await db
    .update(bookmarks)
    .set({ notes })
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

export async function moveBookmark(
  userId: number,
  bookmarkId: number,
  collectionId: number | null
) {
  if (collectionId !== null && !(await getCollection(userId, collectionId))) {
    throw new Error("Collection not found");
  }
  const db = await requireDb();
  await db
    .update(bookmarks)
    .set({ collectionId })
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

export function normalizeBookmarkIds(bookmarkIds: number[]) {
  return Array.from(
    new Set(bookmarkIds.filter(id => Number.isInteger(id) && id > 0))
  ).slice(0, 1000);
}

export async function bulkMoveBookmarks(
  userId: number,
  bookmarkIds: number[],
  collectionId: number | null
) {
  const ids = normalizeBookmarkIds(bookmarkIds);
  if (!ids.length) return 0;
  if (collectionId !== null && !(await getCollection(userId, collectionId))) {
    throw new Error("Collection not found");
  }
  const db = await requireDb();
  const result = await db
    .update(bookmarks)
    .set({ collectionId })
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)));
  return Number(result[0].affectedRows ?? 0);
}

export async function deleteBookmark(userId: number, bookmarkId: number) {
  const db = await requireDb();
  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
}

export async function bulkDeleteBookmarks(userId: number, bookmarkIds: number[]) {
  const ids = normalizeBookmarkIds(bookmarkIds);
  if (!ids.length) return 0;
  const db = await requireDb();
  const result = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)));
  return Number(result[0].affectedRows ?? 0);
}

export async function updateBookmarkMetadata(
  userId: number,
  bookmarkId: number,
  update: BookmarkMetadataUpdate
) {
  const db = await requireDb();
  await db
    .update(bookmarks)
    .set(update)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

export async function updateBookmarkAnalysis(
  userId: number,
  bookmarkId: number,
  update: BookmarkAnalysisUpdate
) {
  const db = await requireDb();
  await db
    .update(bookmarks)
    .set(update)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

export async function updateBookmarkHealth(
  userId: number,
  bookmarkId: number,
  update: Pick<
    typeof bookmarks.$inferInsert,
    "healthStatus" | "httpStatus" | "lastCheckedAt" | "healthError"
  >
) {
  const db = await requireDb();
  await db
    .update(bookmarks)
    .set(update)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

async function getOrCreateTag(userId: number, name: string) {
  const normalizedName = name.trim().toLocaleLowerCase();
  const db = await requireDb();
  const existing = await db
    .select()
    .from(tags)
    .where(
      and(eq(tags.userId, userId), eq(tags.normalizedName, normalizedName))
    )
    .limit(1);
  if (existing[0]) return existing[0];
  try {
    const result = await db
      .insert(tags)
      .values({ userId, name: name.trim(), normalizedName });
    const id = Number(result[0].insertId);
    const created = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (!created[0]) throw new Error("Tag creation failed");
    return created[0];
  } catch (error) {
    const concurrent = await db
      .select()
      .from(tags)
      .where(
        and(eq(tags.userId, userId), eq(tags.normalizedName, normalizedName))
      )
      .limit(1);
    if (concurrent[0]) return concurrent[0];
    throw error;
  }
}

export async function replaceAutomaticTags(
  userId: number,
  bookmarkId: number,
  tagNames: string[]
) {
  const db = await requireDb();
  const bookmark = await getBookmark(userId, bookmarkId);
  if (!bookmark) throw new Error("Bookmark not found");

  await db
    .delete(bookmarkTags)
    .where(
      and(
        eq(bookmarkTags.bookmarkId, bookmarkId),
        eq(bookmarkTags.source, "automatic")
      )
    );

  const uniqueNames = Array.from(
    new Map(
      tagNames
        .map(name => name.trim())
        .filter(name => name.length > 1 && name.length <= 96)
        .map(name => [name.toLocaleLowerCase(), name])
    ).values()
  ).slice(0, 8);

  for (const name of uniqueNames) {
    const tag = await getOrCreateTag(userId, name);
    await db
      .insert(bookmarkTags)
      .values({ bookmarkId, tagId: tag.id, source: "automatic" })
      .onDuplicateKeyUpdate({ set: { source: sql`source` } });
  }
  return getBookmark(userId, bookmarkId);
}

export async function addManualTag(
  userId: number,
  bookmarkId: number,
  tagName: string
) {
  const db = await requireDb();
  if (!(await getBookmark(userId, bookmarkId))) throw new Error("Bookmark not found");
  const tag = await getOrCreateTag(userId, tagName);
  await db
    .insert(bookmarkTags)
    .values({ bookmarkId, tagId: tag.id, source: "manual" })
    .onDuplicateKeyUpdate({ set: { source: "manual" } });
  return getBookmark(userId, bookmarkId);
}

export async function bulkAddManualTag(
  userId: number,
  bookmarkIds: number[],
  tagName: string
) {
  const ids = normalizeBookmarkIds(bookmarkIds);
  if (!ids.length) return 0;
  const db = await requireDb();
  const ownedBookmarks = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)));
  if (!ownedBookmarks.length) return 0;
  const tag = await getOrCreateTag(userId, tagName);
  for (const bookmark of ownedBookmarks) {
    await db
      .insert(bookmarkTags)
      .values({ bookmarkId: bookmark.id, tagId: tag.id, source: "manual" })
      .onDuplicateKeyUpdate({ set: { source: "manual" } });
  }
  return ownedBookmarks.length;
}

export async function removeTagFromBookmark(
  userId: number,
  bookmarkId: number,
  tagId: number
) {
  const db = await requireDb();
  const ownedTag = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .limit(1);
  if (!ownedTag[0]) throw new Error("Tag not found");
  await db
    .delete(bookmarkTags)
    .where(and(eq(bookmarkTags.bookmarkId, bookmarkId), eq(bookmarkTags.tagId, tagId)));
  return getBookmark(userId, bookmarkId);
}

export async function createBookmarkJob(
  userId: number,
  bookmarkId: number,
  type: "scrape" | "health_check"
) {
  const db = await requireDb();
  const result = await db
    .insert(bookmarkJobs)
    .values({ userId, bookmarkId, type, status: "pending" });
  const id = Number(result[0].insertId);
  const job = await db
    .select()
    .from(bookmarkJobs)
    .where(eq(bookmarkJobs.id, id))
    .limit(1);
  return job[0];
}

export async function hasActiveBookmarkJob(
  userId: number,
  bookmarkId: number,
  type: "scrape" | "health_check"
) {
  const db = await requireDb();
  const rows = await db
    .select({ id: bookmarkJobs.id })
    .from(bookmarkJobs)
    .where(
      and(
        eq(bookmarkJobs.userId, userId),
        eq(bookmarkJobs.bookmarkId, bookmarkId),
        eq(bookmarkJobs.type, type),
        inArray(bookmarkJobs.status, ["pending", "processing"])
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function listPendingJobs(
  type?: "scrape" | "health_check",
  limit = 20
) {
  const db = await requireDb();
  const clauses = [eq(bookmarkJobs.status, "pending")];
  if (type) clauses.push(eq(bookmarkJobs.type, type));
  return db
    .select()
    .from(bookmarkJobs)
    .where(and(...clauses))
    .orderBy(asc(bookmarkJobs.queuedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function listPendingJobsForUser(
  userId: number,
  type?: "scrape" | "health_check",
  limit = 20
) {
  const db = await requireDb();
  const clauses = [
    eq(bookmarkJobs.status, "pending"),
    eq(bookmarkJobs.userId, userId),
  ];
  if (type) clauses.push(eq(bookmarkJobs.type, type));
  return db
    .select()
    .from(bookmarkJobs)
    .where(and(...clauses))
    .orderBy(asc(bookmarkJobs.queuedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function countPendingJobsForUser(
  userId: number,
  type?: "scrape" | "health_check"
) {
  const db = await requireDb();
  const clauses = [
    eq(bookmarkJobs.status, "pending"),
    eq(bookmarkJobs.userId, userId),
  ];
  if (type) clauses.push(eq(bookmarkJobs.type, type));
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarkJobs)
    .where(and(...clauses));
  return Number(rows[0]?.count ?? 0);
}

export async function markJobProcessing(jobId: number) {
  const db = await requireDb();
  const result = await db
    .update(bookmarkJobs)
    .set({
      status: "processing",
      startedAt: new Date(),
      attemptCount: sql`${bookmarkJobs.attemptCount} + 1`,
      error: null,
    })
    .where(and(eq(bookmarkJobs.id, jobId), eq(bookmarkJobs.status, "pending")));
  return Number(result[0].affectedRows) === 1;
}

export async function markJobCompleted(jobId: number) {
  const db = await requireDb();
  await db
    .update(bookmarkJobs)
    .set({ status: "completed", completedAt: new Date(), error: null })
    .where(eq(bookmarkJobs.id, jobId));
}

export async function markJobFailed(jobId: number, error: string) {
  const db = await requireDb();
  await db
    .update(bookmarkJobs)
    .set({ status: "failed", completedAt: new Date(), error: error.slice(0, 2000) })
    .where(eq(bookmarkJobs.id, jobId));
}

export async function getHealthSettings(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(healthCheckSettings)
    .where(eq(healthCheckSettings.userId, userId))
    .limit(1);
  return rows[0];
}

export async function getHealthSettingsByTaskUid(taskUid: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(healthCheckSettings)
    .where(eq(healthCheckSettings.scheduleCronTaskUid, taskUid))
    .limit(1);
  return rows[0];
}

export async function ensureHealthSettings(userId: number) {
  const existing = await getHealthSettings(userId);
  if (existing) return existing;
  const db = await requireDb();
  const result = await db.insert(healthCheckSettings).values({ userId });
  const id = Number(result[0].insertId);
  const rows = await db
    .select()
    .from(healthCheckSettings)
    .where(eq(healthCheckSettings.id, id))
    .limit(1);
  return rows[0];
}

export async function updateHealthSettings(
  userId: number,
  update: Pick<
    typeof healthCheckSettings.$inferInsert,
    "scheduleCronTaskUid" | "enabled" | "lastRunAt"
  >
) {
  const db = await requireDb();
  await ensureHealthSettings(userId);
  await db
    .update(healthCheckSettings)
    .set(update)
    .where(eq(healthCheckSettings.userId, userId));
  return getHealthSettings(userId);
}
