import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  like,
  lt,
  gt,
  or,
  sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  aiTagSuggestions,
  bookmarkJobs,
  bookmarks,
  bookmarkTags,
  collections,
  healthCheckSettings,
  tags,
} from "../drizzle/neonSchema.js";
import { ENV } from "./_core/env.js";
import { openCloudDatabase } from "./_core/cloudDatabase.js";

let _db: ReturnType<typeof openCloudDatabase> | null = null;

export type BookmarkTagSummary = {
  id: number;
  name: string;
  source: "automatic" | "manual" | "ai";
};

export type BookmarkRecord = typeof bookmarks.$inferSelect & {
  collectionName: string | null;
  tags: BookmarkTagSummary[];
};

export type BookmarkPage = {
  items: BookmarkRecord[];
  nextCursor: string | null;
  totalCount: number;
};

export type JobQueueSummary = {
  pending: number;
  processing: number;
  failed: number;
};

export type BookmarkInsert = Pick<
  typeof bookmarks.$inferInsert,
  "userId" | "collectionId" | "url" | "normalizedUrl" | "normalizedUrlHash" | "host"
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

export async function getDb() {
  _db ??= openCloudDatabase();
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

// Cloud identities come only from verified Neon Auth JWTs. No local-user bypass.
export async function listCollections(userId: string) {
  const db = await requireDb();
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(asc(collections.name));
}

export async function createCollection(userId: string, name: string) {
  const db = await requireDb();
  const result = await db.insert(collections).values({ userId, name }).returning({ id: collections.id });
  const id = result[0]!.id;
  return getCollection(userId, id);
}

export async function getCollection(userId: string, collectionId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);
  return result[0];
}

export async function renameCollection(
  userId: string,
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

export async function deleteCollection(userId: string, collectionId: number) {
  const db = await requireDb();
  await db
    .delete(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)));
}

export async function createBookmark(input: BookmarkInsert) {
  const db = await requireDb();
  const result = await db.insert(bookmarks).values(input).returning({ id: bookmarks.id });
  return getBookmark(input.userId, result[0]!.id);
}

export async function getBookmarkByNormalizedUrl(userId: string, normalizedUrlHash: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.normalizedUrlHash, normalizedUrlHash)))
    .limit(1);
  return hydrateBookmarks(userId, rows).then(result => result[0]);
}

export async function createBookmarkWithJob(
  input: BookmarkInsert,
  type: "scrape" | "health_check"
) {
  const db = await requireDb();
  const rows = await db.insert(bookmarks).values(input).returning({ id: bookmarks.id });
  const id = rows[0]!.id;
  try {
    await db.insert(bookmarkJobs).values({ userId: input.userId, bookmarkId: id, type, status: "pending" });
  } catch (error) {
    // Neon HTTP has no interactive transactions: roll back newly inserted item on job failure.
    await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, input.userId)));
    throw error;
  }
  return getBookmark(input.userId, id);
}

async function hydrateBookmarks(
  userId: string,
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

export async function getBookmark(userId: string, bookmarkId: number) {
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
  userId: string,
  filters: {
    collectionId?: number;
    healthStatus?: "unchecked" | "healthy" | "redirected" | "broken" | "needs_review";
  } = {},
  limit?: number
) {
  const db = await requireDb();
  const clauses = [eq(bookmarks.userId, userId)];
  if (filters.collectionId !== undefined) {
    clauses.push(eq(bookmarks.collectionId, filters.collectionId));
  }
  if (filters.healthStatus !== undefined) {
    clauses.push(eq(bookmarks.healthStatus, filters.healthStatus));
  }
  const query = db
    .select()
    .from(bookmarks)
    .where(and(...clauses))
    .orderBy(desc(bookmarks.createdAt));
  const rows = limit === undefined ? await query : await query.limit(limit);
  return hydrateBookmarks(userId, rows);
}

export async function listBookmarkIds(
  userId: string,
  afterId = 0,
  limit = 100
) {
  const db = await requireDb();
  return db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), gt(bookmarks.id, afterId)))
    .orderBy(asc(bookmarks.id))
    .limit(Math.min(Math.max(limit, 1), 100));
}

const BOOKMARK_PAGE_SIZE = 50;

function encodeBookmarkCursor(row: Pick<typeof bookmarks.$inferSelect, "createdAt" | "id">) {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

function decodeBookmarkCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || !Number.isInteger(parsed.id)) return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: Number(parsed.id) };
  } catch {
    return null;
  }
}

function bookmarkFilterClauses(
  userId: string,
  filters: {
    collectionId?: number;
    healthStatus?: "unchecked" | "healthy" | "redirected" | "broken" | "needs_review";
  }
) {
  const clauses = [eq(bookmarks.userId, userId)];
  if (filters.collectionId !== undefined) clauses.push(eq(bookmarks.collectionId, filters.collectionId));
  if (filters.healthStatus !== undefined) clauses.push(eq(bookmarks.healthStatus, filters.healthStatus));
  return clauses;
}

export async function listBookmarkPage(
  userId: string,
  filters: {
    collectionId?: number;
    healthStatus?: "unchecked" | "healthy" | "redirected" | "broken" | "needs_review";
    cursor?: string;
    limit?: number;
  } = {}
): Promise<BookmarkPage> {
  const db = await requireDb();
  const limit = Math.min(Math.max(filters.limit ?? BOOKMARK_PAGE_SIZE, 1), BOOKMARK_PAGE_SIZE);
  const baseClauses = bookmarkFilterClauses(userId, filters);
  const cursor = decodeBookmarkCursor(filters.cursor);
  const cursorClause = cursor
    ? or(
        lt(bookmarks.createdAt, cursor.createdAt),
        and(eq(bookmarks.createdAt, cursor.createdAt), lt(bookmarks.id, cursor.id))
      )
    : undefined;
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(...baseClauses, ...(cursorClause ? [cursorClause] : [])))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(and(...baseClauses));
  return {
    items: await hydrateBookmarks(userId, items),
    nextCursor: rows.length > limit && items[items.length - 1]
      ? encodeBookmarkCursor(items[items.length - 1])
      : null,
    totalCount: Number(totalRows[0]?.count ?? 0),
  };
}

export async function countBookmarkHealthStatuses(userId: string) {
  const db = await requireDb();
  const rows = await db
    .select({ status: bookmarks.healthStatus, count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .groupBy(bookmarks.healthStatus);
  const counts = { unchecked: 0, healthy: 0, redirected: 0, broken: 0, needs_review: 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}

export function normalizeSearchTerms(query: string) {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
}

function fullTextTerm(term: string) {
  return term.replace(/[^A-Za-z0-9_-]/g, "");
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

export async function searchBookmarkPage(
  userId: string,
  query: string,
  cursor?: string,
  limit = BOOKMARK_PAGE_SIZE
): Promise<BookmarkPage> {
  const terms = normalizeSearchTerms(query);
  if (!terms.length) return listBookmarkPage(userId, { cursor, limit });
  const db = await requireDb();
  const safeTerms = terms.map(term => term.replace(/[\\%_]/g, "\\$&"));
  const searchClauses = safeTerms.map(term => {
    const pattern = `%${term}%`;
    return or(
      ilike(bookmarks.title, pattern),
      ilike(bookmarks.description, pattern),
      ilike(bookmarks.notes, pattern),
      ilike(bookmarks.contentText, pattern),
      ilike(bookmarks.host, pattern),
      sql`exists (select 1 from fihrist.bookmark_tags bt inner join fihrist.tags t on t.id = bt.tag_id
        where bt.bookmark_id = ${bookmarks.id} and bt.user_id = ${userId} and t.user_id = ${userId} and t.name ilike ${pattern})`
    );
  });
  const baseClauses = [eq(bookmarks.userId, userId), ...searchClauses];
  const decodedCursor = decodeBookmarkCursor(cursor);
  if (decodedCursor) {
    baseClauses.push(
      or(
        lt(bookmarks.createdAt, decodedCursor.createdAt),
        and(eq(bookmarks.createdAt, decodedCursor.createdAt), lt(bookmarks.id, decodedCursor.id))
      )
    );
  }
  const pageSize = Math.min(Math.max(limit, 1), BOOKMARK_PAGE_SIZE);
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(...baseClauses))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .limit(pageSize + 1);
  const items = rows.slice(0, pageSize);
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), ...searchClauses));
  return {
    items: await hydrateBookmarks(userId, items),
    nextCursor: rows.length > pageSize && items[items.length - 1]
      ? encodeBookmarkCursor(items[items.length - 1])
      : null,
    totalCount: Number(totalRows[0]?.count ?? 0),
  };
}

export async function updateBookmarkNotes(
  userId: string,
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
  userId: string,
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
  userId: string,
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
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids))).returning({ id: bookmarks.id });
  return result.length;
}

export async function deleteBookmark(userId: string, bookmarkId: number) {
  const db = await requireDb();
  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
}

export async function bulkDeleteBookmarks(userId: string, bookmarkIds: number[]) {
  const ids = normalizeBookmarkIds(bookmarkIds);
  if (!ids.length) return 0;
  const db = await requireDb();
  const result = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids))).returning({ id: bookmarks.id });
  return result.length;
}

export async function updateBookmarkMetadata(
  userId: string,
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
  userId: string,
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
  userId: string,
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

async function getOrCreateTag(userId: string, name: string) {
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
      .values({ userId, name: name.trim(), normalizedName }).returning({ id: tags.id });
    const id = result[0]!.id;
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
  userId: string,
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
      .values({ userId, bookmarkId, tagId: tag.id, source: "automatic" })
      .onConflictDoNothing();
  }
  return getBookmark(userId, bookmarkId);
}

export async function addManualTag(
  userId: string,
  bookmarkId: number,
  tagName: string
) {
  const db = await requireDb();
  if (!(await getBookmark(userId, bookmarkId))) throw new Error("Bookmark not found");
  const tag = await getOrCreateTag(userId, tagName);
  await db
    .insert(bookmarkTags)
    .values({ userId, bookmarkId, tagId: tag.id, source: "manual" })
    .onConflictDoUpdate({
      target: [bookmarkTags.bookmarkId, bookmarkTags.tagId],
      set: { source: "manual" },
    });
  return getBookmark(userId, bookmarkId);
}

// ---------------------------------------------------------------------------
// AI tag suggestions (BYOK) — pending approval, never auto-applied.
// ---------------------------------------------------------------------------

export type AiTagSuggestionRecord = typeof aiTagSuggestions.$inferSelect;

/** Store AI suggestions as PENDING. Skips tags the bookmark already has. */
export async function createAiTagSuggestions(
  userId: string,
  bookmarkId: number,
  suggestions: Array<{ tagName: string; promptTokens: number | null; completionTokens: number | null }>
) {
  const db = await requireDb();
  const bookmark = await getBookmark(userId, bookmarkId);
  if (!bookmark) throw new Error("Bookmark not found");
  const existingNames = new Set(
    (bookmark.tags ?? []).map(tag => tag.name.trim().toLocaleLowerCase())
  );
  let created = 0;
  for (const suggestion of suggestions) {
    const normalizedName = suggestion.tagName.trim().toLocaleLowerCase();
    if (!normalizedName || existingNames.has(normalizedName)) continue;
    try {
      await db.insert(aiTagSuggestions).values({
        userId,
        bookmarkId,
        tagName: suggestion.tagName.trim(),
        normalizedName,
        promptTokens: suggestion.promptTokens,
        completionTokens: suggestion.completionTokens,
      });
      created += 1;
    } catch {
      // Duplicate suggestion for this bookmark — skip silently.
    }
  }
  return created;
}

export async function listPendingAiTagSuggestions(userId: string, bookmarkId?: number) {
  const db = await requireDb();
  const clauses = [
    eq(aiTagSuggestions.userId, userId),
    eq(aiTagSuggestions.status, "pending"),
  ];
  if (bookmarkId !== undefined) clauses.push(eq(aiTagSuggestions.bookmarkId, bookmarkId));
  return db
    .select()
    .from(aiTagSuggestions)
    .where(and(...clauses))
    .orderBy(desc(aiTagSuggestions.createdAt))
    .limit(200);
}

export async function countPendingAiTagSuggestions(userId: string) {
  const db = await requireDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiTagSuggestions)
    .where(
      and(eq(aiTagSuggestions.userId, userId), eq(aiTagSuggestions.status, "pending"))
    );
  return Number(rows[0]?.count ?? 0);
}

/** Approve one suggestion: creates/links the tag (source "ai") and marks approved. */
export async function approveAiTagSuggestion(userId: string, suggestionId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(aiTagSuggestions)
    .where(
      and(
        eq(aiTagSuggestions.id, suggestionId),
        eq(aiTagSuggestions.userId, userId),
        eq(aiTagSuggestions.status, "pending")
      )
    )
    .limit(1);
  const suggestion = rows[0];
  if (!suggestion) throw new Error("Suggestion not found");
  const tag = await getOrCreateTag(userId, suggestion.tagName);
  await db
    .insert(bookmarkTags)
    .values({ userId, bookmarkId: suggestion.bookmarkId, tagId: tag.id, source: "ai" })
    .onConflictDoNothing();
  await db
    .update(aiTagSuggestions)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(aiTagSuggestions.id, suggestionId));
  return getBookmark(userId, suggestion.bookmarkId);
}

export async function rejectAiTagSuggestion(userId: string, suggestionId: number) {
  const db = await requireDb();
  await db
    .update(aiTagSuggestions)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(aiTagSuggestions.id, suggestionId),
        eq(aiTagSuggestions.userId, userId),
        eq(aiTagSuggestions.status, "pending")
      )
    );
}

export async function bulkAddManualTag(
  userId: string,
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
      .values({ userId, bookmarkId: bookmark.id, tagId: tag.id, source: "manual" })
    .onConflictDoUpdate({
      target: [bookmarkTags.bookmarkId, bookmarkTags.tagId],
      set: { source: "manual" },
    });
  }
  return ownedBookmarks.length;
}

export async function removeTagFromBookmark(
  userId: string,
  bookmarkId: number,
  tagId: number
) {
  const db = await requireDb();
  if (!(await getBookmark(userId, bookmarkId))) throw new Error("Bookmark not found");
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
  userId: string,
  bookmarkId: number,
  type: "scrape" | "health_check"
) {
  const db = await requireDb();
  const result = await db
    .insert(bookmarkJobs)
    .values({ userId, bookmarkId, type, status: "pending" }).returning({ id: bookmarkJobs.id });
  const id = result[0]!.id;
  const job = await db
    .select()
    .from(bookmarkJobs)
    .where(eq(bookmarkJobs.id, id))
    .limit(1);
  return job[0];
}

export async function hasActiveBookmarkJob(
  userId: string,
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

export async function countPendingJobsForUser(
  userId: string,
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

export async function getJobQueueSummary(userId: string): Promise<JobQueueSummary> {
  const db = await requireDb();
  const rows = await db
    .select({ status: bookmarkJobs.status, count: sql<number>`count(*)` })
    .from(bookmarkJobs)
    .where(
      and(
        eq(bookmarkJobs.userId, userId),
        inArray(bookmarkJobs.status, ["pending", "processing", "failed"])
      )
    )
    .groupBy(bookmarkJobs.status);
  const summary: JobQueueSummary = { pending: 0, processing: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "pending" || row.status === "processing" || row.status === "failed") {
      summary[row.status] = Number(row.count);
    }
  }
  return summary;
}

export async function retryFailedJobsForUser(userId: string, limit = 1000) {
  const db = await requireDb();
  const ids = await db
    .select({ id: bookmarkJobs.id })
    .from(bookmarkJobs)
    .where(and(eq(bookmarkJobs.userId, userId), eq(bookmarkJobs.status, "failed")))
    .orderBy(asc(bookmarkJobs.id))
    .limit(Math.min(Math.max(limit, 1), 10000));
  if (!ids.length) return 0;
  const now = new Date();
  const result = await db
    .update(bookmarkJobs)
    .set({
      status: "pending",
      attemptCount: 0,
      error: null,
      availableAt: now,
      queuedAt: now,
      startedAt: null,
      leaseUntil: null,
      leaseToken: null,
      completedAt: null,
    })
    .where(
      and(
        eq(bookmarkJobs.userId, userId),
        eq(bookmarkJobs.status, "failed"),
        inArray(bookmarkJobs.id, ids.map(job => job.id))
      )
    ).returning({ id: bookmarkJobs.id });
  return result.length;
}

const JOB_LEASE_MS = 60_000;
const MAX_JOB_ATTEMPTS = 3;

export async function recoverProcessingJobs() {
  const db = await requireDb();
  const now = new Date();
  const result = await db
    .update(bookmarkJobs)
    .set({
      status: "pending",
      availableAt: now,
      startedAt: null,
      leaseUntil: null,
      leaseToken: null,
    })
    .where(eq(bookmarkJobs.status, "processing")).returning({ id: bookmarkJobs.id });
  return result.length;
}

export function jobRetryDelayMs(attemptCount: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attemptCount - 1));
}

export async function listAvailableJobs(
  type?: "scrape" | "health_check",
  limit = 20
) {
  const db = await requireDb();
  const now = new Date();
  const clauses = [
    or(
      and(eq(bookmarkJobs.status, "pending"), lte(bookmarkJobs.availableAt, now)),
      and(
        eq(bookmarkJobs.status, "processing"),
        or(isNull(bookmarkJobs.leaseUntil), lte(bookmarkJobs.leaseUntil, now))
      )
    ),
  ];
  if (type) clauses.push(eq(bookmarkJobs.type, type));
  return db
    .select()
    .from(bookmarkJobs)
    .where(and(...clauses))
    .orderBy(asc(bookmarkJobs.queuedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function claimBookmarkJob(jobId: number) {
  const db = await requireDb();
  const now = new Date();
  const leaseToken = randomUUID();
  const result = await db
    .update(bookmarkJobs)
    .set({
      status: "processing",
      startedAt: now,
      attemptCount: sql`${bookmarkJobs.attemptCount} + 1`,
      error: null,
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
      leaseToken,
    })
    .where(
      and(
        eq(bookmarkJobs.id, jobId),
        or(
          and(eq(bookmarkJobs.status, "pending"), lte(bookmarkJobs.availableAt, now)),
          and(
            eq(bookmarkJobs.status, "processing"),
            or(isNull(bookmarkJobs.leaseUntil), lte(bookmarkJobs.leaseUntil, now))
          )
        )
      )
    ).returning({ id: bookmarkJobs.id });
  if (result.length !== 1) return null;
  const rows = await db
    .select()
    .from(bookmarkJobs)
    .where(and(eq(bookmarkJobs.id, jobId), eq(bookmarkJobs.leaseToken, leaseToken)))
    .limit(1);
  const job = rows[0];
  if (!job?.leaseToken) return null;
  return { ...job, leaseToken: job.leaseToken };
}

export async function markJobCompleted(jobId: number, leaseToken: string) {
  const db = await requireDb();
  await db
    .update(bookmarkJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      error: null,
      leaseUntil: null,
      leaseToken: null,
    })
    .where(
      and(
        eq(bookmarkJobs.id, jobId),
        eq(bookmarkJobs.status, "processing"),
        eq(bookmarkJobs.leaseToken, leaseToken)
      )
    );
}

export async function markJobFailed(jobId: number, leaseToken: string, error: string) {
  const db = await requireDb();
  const rows = await db
    .select({ attemptCount: bookmarkJobs.attemptCount })
    .from(bookmarkJobs)
    .where(
      and(
        eq(bookmarkJobs.id, jobId),
        eq(bookmarkJobs.status, "processing"),
        eq(bookmarkJobs.leaseToken, leaseToken)
      )
    )
    .limit(1);
  const job = rows[0];
  if (!job) return;
  const retry = job.attemptCount < MAX_JOB_ATTEMPTS;
  await db
    .update(bookmarkJobs)
    .set(
      retry
        ? {
            status: "pending",
            availableAt: new Date(Date.now() + jobRetryDelayMs(job.attemptCount)),
            completedAt: null,
            startedAt: null,
            leaseUntil: null,
            leaseToken: null,
            error: error.slice(0, 2000),
          }
        : {
            status: "failed",
            completedAt: new Date(),
            leaseUntil: null,
            leaseToken: null,
            error: error.slice(0, 2000),
          }
    )
    .where(
      and(
        eq(bookmarkJobs.id, jobId),
        eq(bookmarkJobs.status, "processing"),
        eq(bookmarkJobs.leaseToken, leaseToken)
      )
    );
}

export async function getHealthSettings(userId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(healthCheckSettings)
    .where(eq(healthCheckSettings.userId, userId))
    .limit(1);
  return rows[0];
}

export async function ensureHealthSettings(userId: string) {
  const existing = await getHealthSettings(userId);
  if (existing) return existing;
  const db = await requireDb();
  const result = await db.insert(healthCheckSettings).values({ userId }).returning({ id: healthCheckSettings.id });
  const id = result[0]!.id;
  const rows = await db
    .select()
    .from(healthCheckSettings)
    .where(eq(healthCheckSettings.id, id))
    .limit(1);
  return rows[0];
}

export async function updateHealthSettings(
  userId: string,
  update: Pick<
    typeof healthCheckSettings.$inferInsert,
    "enabled" | "lastRunAt" | "lastRunStartedAt" | "lastRunTotal" | "lastRunCompletedAt"
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

export type HealthRunProgress = {
  total: number;
  checked: number;
  pending: number;
  processing: number;
  failed: number;
  startedAt: Date | null;
  completedAt: Date | null;
};

/** Active (non-terminal) health_check job counts for one user. */
export async function getHealthJobCounts(userId: string, since?: Date) {
  const db = await requireDb();
  const filters = [
    eq(bookmarkJobs.userId, userId),
    eq(bookmarkJobs.type, "health_check"),
    inArray(bookmarkJobs.status, ["pending", "processing", "failed"]),
  ];
  if (since) filters.push(gte(bookmarkJobs.queuedAt, since));
  const rows = await db
    .select({ status: bookmarkJobs.status, count: sql<number>`count(*)` })
    .from(bookmarkJobs)
    .where(and(...filters))
    .groupBy(bookmarkJobs.status);
  const counts = { pending: 0, processing: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "pending" || row.status === "processing" || row.status === "failed") {
      counts[row.status] = Number(row.count);
    }
  }
  return counts;
}

/**
 * Progress of the current/last health run. `checked` counts bookmarks whose
 * last check happened after the run started — the number the owner cares about.
 */
export async function getHealthRunProgress(userId: string): Promise<HealthRunProgress> {
  const settings = await ensureHealthSettings(userId);
  const jobCounts = await getHealthJobCounts(userId, settings.lastRunStartedAt ?? undefined);
  const db = await requireDb();
  let checked = 0;
  if (settings.lastRunStartedAt) {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          gte(bookmarks.lastCheckedAt, settings.lastRunStartedAt)
        )
      );
    checked = Number(rows[0]?.count ?? 0);
  }
  return {
    total: settings.lastRunTotal ?? 0,
    checked: Math.min(checked, settings.lastRunTotal ?? 0),
    pending: jobCounts.pending,
    processing: jobCounts.processing,
    failed: jobCounts.failed,
    startedAt: settings.lastRunStartedAt,
    completedAt: settings.lastRunCompletedAt,
  };
}

/** Mark a health run as started (call right after queueing). */
export async function startHealthRun(userId: string, total: number, startedAt = new Date()) {
  return updateHealthSettings(userId, {
    lastRunStartedAt: startedAt,
    lastRunTotal: total,
    lastRunCompletedAt: null,
  });
}

/** Mark the run complete when no health_check jobs remain active. */
export async function completeHealthRunIfDrained(userId: string) {
  const settings = await getHealthSettings(userId);
  if (!settings?.lastRunStartedAt || settings.lastRunCompletedAt) return false;
  const counts = await getHealthJobCounts(userId, settings.lastRunStartedAt);
  // Failed jobs are terminal for this run: finish it and report the failures.
  if (counts.pending === 0 && counts.processing === 0) {
    await updateHealthSettings(userId, { lastRunCompletedAt: new Date() });
    return true;
  }
  return false;
}
