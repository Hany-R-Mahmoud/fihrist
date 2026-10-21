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
  healthChecks,
  healthRuns,
  domainPacing,
  healthRollups,
  hostProbes,
  topicDismissals,
  rotDigests,
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
  | "userId"
  | "collectionId"
  | "url"
  | "normalizedUrl"
  | "normalizedUrlHash"
  | "host"
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
  const result = await db
    .insert(collections)
    .values({ userId, name })
    .returning({ id: collections.id });
  const id = result[0]!.id;
  return getCollection(userId, id);
}

export async function getCollection(userId: string, collectionId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(collections)
    .where(
      and(eq(collections.id, collectionId), eq(collections.userId, userId))
    )
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
    .where(
      and(eq(collections.id, collectionId), eq(collections.userId, userId))
    );
  return getCollection(userId, collectionId);
}

export async function deleteCollection(userId: string, collectionId: number) {
  const db = await requireDb();
  await db
    .delete(collections)
    .where(
      and(eq(collections.id, collectionId), eq(collections.userId, userId))
    );
}

export async function createBookmark(input: BookmarkInsert) {
  const db = await requireDb();
  const result = await db
    .insert(bookmarks)
    .values(input)
    .returning({ id: bookmarks.id });
  return getBookmark(input.userId, result[0]!.id);
}

export async function getBookmarkByNormalizedUrl(
  userId: string,
  normalizedUrlHash: string
) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.normalizedUrlHash, normalizedUrlHash)
      )
    )
    .limit(1);
  return hydrateBookmarks(userId, rows).then(result => result[0]);
}

export async function createBookmarkWithJob(
  input: BookmarkInsert,
  type: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh"
) {
  const db = await requireDb();
  const rows = await db
    .insert(bookmarks)
    .values(input)
    .returning({ id: bookmarks.id });
  const id = rows[0]!.id;
  try {
    await db
      .insert(bookmarkJobs)
      .values({
        userId: input.userId,
        bookmarkId: id,
        type,
        status: "pending",
      });
  } catch (error) {
    // Neon HTTP has no interactive transactions: roll back newly inserted item on job failure.
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, input.userId)));
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
      and(
        inArray(bookmarkTags.bookmarkId, bookmarkIds),
        eq(tags.userId, userId)
      )
    );

  const tagMap = new Map<number, BookmarkTagSummary[]>();
  for (const tagRow of tagRows) {
    if (tagRow.source === "topic") continue;
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
      row.collectionId === null
        ? null
        : (collectionMap.get(row.collectionId) ?? null),
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
    topicTagId?: number;
    healthStatus?:
      | "unchecked"
      | "healthy"
      | "redirected"
      | "broken"
      | "needs_review";
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

function encodeBookmarkCursor(
  row: Pick<typeof bookmarks.$inferSelect, "createdAt" | "id">
) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })
  ).toString("base64url");
}

function decodeBookmarkCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || !Number.isInteger(parsed.id))
      return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isNaN(createdAt.getTime())
      ? null
      : { createdAt, id: Number(parsed.id) };
  } catch {
    return null;
  }
}

function bookmarkFilterClauses(
  userId: string,
  filters: {
    collectionId?: number;
    topicTagId?: number;
    healthStatus?:
      | "unchecked"
      | "healthy"
      | "redirected"
      | "broken"
      | "needs_review";
  }
) {
  const clauses = [eq(bookmarks.userId, userId)];
  if (filters.collectionId !== undefined)
    clauses.push(eq(bookmarks.collectionId, filters.collectionId));
  if (filters.healthStatus !== undefined)
    clauses.push(eq(bookmarks.healthStatus, filters.healthStatus));
  if (filters.topicTagId !== undefined) {
    clauses.push(sql`exists (select 1 from fihrist.bookmark_tags bt
      where bt.bookmark_id = ${bookmarks.id}
        and bt.tag_id = ${filters.topicTagId} and bt.source = 'topic')`);
  }
  return clauses;
}

export async function listBookmarkPage(
  userId: string,
  filters: {
    collectionId?: number;
    topicTagId?: number;
    healthStatus?:
      | "unchecked"
      | "healthy"
      | "redirected"
      | "broken"
      | "needs_review";
    cursor?: string;
    limit?: number;
  } = {}
): Promise<BookmarkPage> {
  const db = await requireDb();
  const limit = Math.min(
    Math.max(filters.limit ?? BOOKMARK_PAGE_SIZE, 1),
    BOOKMARK_PAGE_SIZE
  );
  const baseClauses = bookmarkFilterClauses(userId, filters);
  const cursor = decodeBookmarkCursor(filters.cursor);
  const cursorClause = cursor
    ? or(
        lt(bookmarks.createdAt, cursor.createdAt),
        and(
          eq(bookmarks.createdAt, cursor.createdAt),
          lt(bookmarks.id, cursor.id)
        )
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
    nextCursor:
      rows.length > limit && items[items.length - 1]
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
  const counts = {
    unchecked: 0,
    healthy: 0,
    redirected: 0,
    broken: 0,
    needs_review: 0,
  };
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
  bookmark: Pick<
    BookmarkRecord,
    "title" | "description" | "notes" | "contentText" | "host" | "tags"
  >,
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
        and(
          eq(bookmarks.createdAt, decodedCursor.createdAt),
          lt(bookmarks.id, decodedCursor.id)
        )
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
    nextCursor:
      rows.length > pageSize && items[items.length - 1]
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
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)))
    .returning({ id: bookmarks.id });
  return result.length;
}

export async function deleteBookmark(userId: string, bookmarkId: number) {
  const db = await requireDb();
  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
}

export async function bulkDeleteBookmarks(
  userId: string,
  bookmarkIds: number[]
) {
  const ids = normalizeBookmarkIds(bookmarkIds);
  if (!ids.length) return 0;
  const db = await requireDb();
  const result = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)))
    .returning({ id: bookmarks.id });
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
    "healthStatus" | "httpStatus" | "lastCheckedAt" | "healthError" | "failureClass" | "moveClass" | "soft404Streak" | "soft404LastRunId" | "persistentFailure" | "persistentFailureStreak" | "persistentFailureClass"
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
      .values({ userId, name: name.trim(), normalizedName })
      .returning({ id: tags.id });
    const id = result[0]!.id;
    const created = await db
      .select()
      .from(tags)
      .where(eq(tags.id, id))
      .limit(1);
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
  if (!(await getBookmark(userId, bookmarkId)))
    throw new Error("Bookmark not found");
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
  suggestions: Array<{
    tagName: string;
    promptTokens: number | null;
    completionTokens: number | null;
  }>
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

export async function listPendingAiTagSuggestions(
  userId: string,
  bookmarkId?: number
) {
  const db = await requireDb();
  const clauses = [
    eq(aiTagSuggestions.userId, userId),
    eq(aiTagSuggestions.status, "pending"),
  ];
  if (bookmarkId !== undefined)
    clauses.push(eq(aiTagSuggestions.bookmarkId, bookmarkId));
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
      and(
        eq(aiTagSuggestions.userId, userId),
        eq(aiTagSuggestions.status, "pending")
      )
    );
  return Number(rows[0]?.count ?? 0);
}

/** Approve one suggestion: creates/links the tag (source "ai") and marks approved. */
export async function approveAiTagSuggestion(
  userId: string,
  suggestionId: number
) {
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
    .values({
      userId,
      bookmarkId: suggestion.bookmarkId,
      tagId: tag.id,
      source: "ai",
    })
    .onConflictDoNothing();
  await db
    .update(aiTagSuggestions)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(aiTagSuggestions.id, suggestionId));
  return getBookmark(userId, suggestion.bookmarkId);
}

export async function rejectAiTagSuggestion(
  userId: string,
  suggestionId: number
) {
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
      .values({
        userId,
        bookmarkId: bookmark.id,
        tagId: tag.id,
        source: "manual",
      })
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
  if (!(await getBookmark(userId, bookmarkId)))
    throw new Error("Bookmark not found");
  const ownedTag = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .limit(1);
  if (!ownedTag[0]) throw new Error("Tag not found");
  await db
    .delete(bookmarkTags)
    .where(
      and(
        eq(bookmarkTags.bookmarkId, bookmarkId),
        eq(bookmarkTags.tagId, tagId)
      )
    );
  return getBookmark(userId, bookmarkId);
}

export async function createBookmarkJob(
  userId: string,
  bookmarkId: number,
  type: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh",
  runId?: number | null
) {
  const db = await requireDb();
  const result = await db
    .insert(bookmarkJobs)
    .values({
      userId,
      bookmarkId,
      type,
      status: "pending",
      runId: runId ?? null,
    })
    .returning({ id: bookmarkJobs.id });
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
  type: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh"
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
  type?: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh"
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

export async function getJobQueueSummary(
  userId: string
): Promise<JobQueueSummary> {
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
    if (
      row.status === "pending" ||
      row.status === "processing" ||
      row.status === "failed"
    ) {
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
    .where(
      and(eq(bookmarkJobs.userId, userId), eq(bookmarkJobs.status, "failed"))
    )
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
        inArray(
          bookmarkJobs.id,
          ids.map(job => job.id)
        )
      )
    )
    .returning({ id: bookmarkJobs.id });
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
    .where(eq(bookmarkJobs.status, "processing"))
    .returning({ id: bookmarkJobs.id });
  return result.length;
}

export function jobRetryDelayMs(attemptCount: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attemptCount - 1));
}

export async function listAvailableJobs(
  type?: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh",
  limit = 20
) {
  const db = await requireDb();
  const now = new Date();
  const clauses = [
    or(
      and(
        eq(bookmarkJobs.status, "pending"),
        lte(bookmarkJobs.availableAt, now)
      ),
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
          and(
            eq(bookmarkJobs.status, "pending"),
            lte(bookmarkJobs.availableAt, now)
          ),
          and(
            eq(bookmarkJobs.status, "processing"),
            or(
              isNull(bookmarkJobs.leaseUntil),
              lte(bookmarkJobs.leaseUntil, now)
            )
          )
        )
      )
    )
    .returning({ id: bookmarkJobs.id });
  if (result.length !== 1) return null;
  const rows = await db
    .select()
    .from(bookmarkJobs)
    .where(
      and(eq(bookmarkJobs.id, jobId), eq(bookmarkJobs.leaseToken, leaseToken))
    )
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

export async function markJobFailed(
  jobId: number,
  leaseToken: string,
  error: string
) {
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
            availableAt: new Date(
              Date.now() + jobRetryDelayMs(job.attemptCount)
            ),
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
  const result = await db
    .insert(healthCheckSettings)
    .values({ userId })
    .returning({ id: healthCheckSettings.id });
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
    | "enabled"
    | "lastRunId"
    | "lastRunAt"
    | "lastRunStartedAt"
    | "lastRunTotal"
    | "lastRunCompletedAt"
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
    if (
      row.status === "pending" ||
      row.status === "processing" ||
      row.status === "failed"
    ) {
      counts[row.status] = Number(row.count);
    }
  }
  return counts;
}

/**
 * Progress of the current/last health run. `checked` counts bookmarks whose
 * last check happened after the run started — the number the owner cares about.
 */
export async function getHealthRunProgress(
  userId: string
): Promise<HealthRunProgress> {
  const settings = await ensureHealthSettings(userId);
  const jobCounts = await getHealthJobCounts(
    userId,
    settings.lastRunStartedAt ?? undefined
  );
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

export async function updateBookmarkUrl(
  userId: string,
  bookmarkId: number,
  update: { url: string; normalizedUrl: string; normalizedUrlHash: string; host: string }
) {
  const db = await requireDb();
  await db.update(bookmarks).set(update)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

export async function startHealthRun(
  userId: string,
  options: { trigger: "weekly" | "manual" | "single"; startedAt?: Date }
) {
  const db = await requireDb();
  const startedAt = options.startedAt ?? new Date();
  const result = await db
    .insert(healthRuns)
    .values({
      userId,
      trigger: options.trigger,
      status: "running",
      total: 0,
      startedAt,
    })
    .returning({ id: healthRuns.id });
  const id = result[0]!.id;
  const rows = await db
    .select()
    .from(healthRuns)
    .where(eq(healthRuns.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Make a run the owner's current run and record how many links it covers.
 * Called once the run actually has work — a run with no work is deleted
 * instead, so the progress banner never shows a phantom sweep.
 */
export async function activateHealthRun(
  userId: string,
  runId: number,
  total: number
) {
  const db = await requireDb();
  await db
    .update(healthRuns)
    .set({ total })
    .where(and(eq(healthRuns.id, runId), eq(healthRuns.userId, userId)));
  const run = await getHealthRun(userId, runId);
  await updateHealthSettings(userId, {
    lastRunId: runId,
    lastRunStartedAt: run?.startedAt ?? new Date(),
    lastRunTotal: total,
    lastRunCompletedAt: null,
  });
  return getHealthRun(userId, runId);
}

/** Drop a run that never got any work (nothing was queued). */
export async function deleteHealthRun(userId: string, runId: number) {
  const db = await requireDb();
  await db
    .delete(healthRuns)
    .where(and(eq(healthRuns.id, runId), eq(healthRuns.userId, userId)));
}

export async function getHealthRun(userId: string, runId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(healthRuns)
    .where(and(eq(healthRuns.id, runId), eq(healthRuns.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function listRunningHealthRuns(userId: string) {
  const db = await requireDb();
  return db
    .select()
    .from(healthRuns)
    .where(and(eq(healthRuns.userId, userId), eq(healthRuns.status, "running")))
    .orderBy(asc(healthRuns.id));
}

/** Active (non-terminal) job counts for one run. */
export async function getHealthJobCountsForRun(runId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ status: bookmarkJobs.status, count: sql<number>`count(*)` })
    .from(bookmarkJobs)
    .where(
      and(
        eq(bookmarkJobs.runId, runId),
        inArray(bookmarkJobs.status, ["pending", "processing", "failed"])
      )
    )
    .groupBy(bookmarkJobs.status);
  const counts = { pending: 0, processing: 0, failed: 0 };
  for (const row of rows) {
    if (
      row.status === "pending" ||
      row.status === "processing" ||
      row.status === "failed"
    ) {
      counts[row.status] = Number(row.count);
    }
  }
  return counts;
}

async function completeHealthRun(
  userId: string,
  runId: number,
  completedAt: Date
) {
  const db = await requireDb();
  const checkedRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(healthChecks)
    .where(eq(healthChecks.runId, runId));
  await db
    .update(healthRuns)
    .set({
      status: "completed",
      completedAt,
      checked: Number(checkedRows[0]?.count ?? 0),
    })
    .where(eq(healthRuns.id, runId));
  const settings = await getHealthSettings(userId);
  if (settings?.lastRunId === runId) {
    await updateHealthSettings(userId, { lastRunCompletedAt: completedAt });
  }
  return getHealthRun(userId, runId);
}

/**
 * Complete every running run whose jobs have drained. Failed jobs are
 * terminal for a run: the run finishes and reports the failures.
 *
 * This is the run-completion hook point.
 */
export async function completeDrainedHealthRuns(userId: string) {
  const runs = await listRunningHealthRuns(userId);
  const completed = [];
  for (const run of runs) {
    const counts = await getHealthJobCountsForRun(run.id);
    // Never complete an interrupted, unactivated run with total 0.
    // Its remaining checks are resumed by the following scheduler tick.
    if (run.total > 0 && counts.pending === 0 && counts.processing === 0) {
      completed.push(await completeHealthRun(userId, run.id, new Date()));
    }
  }
  return completed;
}

// ---------------------------------------------------------------------------
// Check history — one row per health check.
// ---------------------------------------------------------------------------

export type HealthCheckStatus =
  | "healthy"
  | "redirected"
  | "broken"
  | "needs_review";

export type HealthCheckRow = typeof healthChecks.$inferSelect;

export type HealthCheckInsert = {
  userId: string;
  bookmarkId: number;
  runId: number | null;
  jobId?: number | null;
  checkedAt: Date;
  status: HealthCheckStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  durationMs: number | null;
  error: string | null;
  failureClass?: typeof healthChecks.$inferInsert.failureClass;
  networkCode?: string | null; redirectChain?: string | null; finalHost?: string | null;
  titleSnapshot?: string | null; bodyHash?: string | null; contentLength?: number | null;
  moveClass?: typeof healthChecks.$inferInsert.moveClass;
};

export async function insertHealthCheck(input: HealthCheckInsert) {
  const db = await requireDb();
  const result = await db
    .insert(healthChecks)
    .values({
      userId: input.userId,
      bookmarkId: input.bookmarkId,
      runId: input.runId,
      jobId: input.jobId ?? null,
      checkedAt: input.checkedAt,
      status: input.status,
      httpStatus: input.httpStatus,
      finalUrl: input.finalUrl,
      durationMs: input.durationMs,
      error: input.error,
      failureClass: input.failureClass ?? "inconclusive",
    networkCode: input.networkCode ?? null, redirectChain: input.redirectChain ?? "[]",
    finalHost: input.finalHost ?? null, titleSnapshot: input.titleSnapshot ?? null,
    bodyHash: input.bodyHash ?? null, contentLength: input.contentLength ?? null,
    moveClass: input.moveClass ?? "none",
    })
    .returning({ id: healthChecks.id });
  return result[0]!.id;
}

export type TimelineEntry = {
  id: number;
  bookmarkId: number;
  runId: number | null;
  jobId: number | null;
  checkedAt: Date;
  status: HealthCheckStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  durationMs: number | null;
  error: string | null;
  runStartedAt: Date | null;
  runCompletedAt: Date | null;
  runTrigger: "weekly" | "manual" | "single" | null;
  failureClass: typeof healthChecks.$inferSelect.failureClass;
  networkCode: string | null; redirectChain: string | null;
  finalHost: string | null; titleSnapshot: string | null;
  bodyHash: string | null; contentLength: number | null;
  moveClass: typeof healthChecks.$inferSelect.moveClass;
};

/** A bookmark's checks, newest first, with the run each check belonged to. */
export async function listBookmarkTimeline(
  userId: string,
  bookmarkId: number,
  limit?: number
): Promise<TimelineEntry[]> {
  const db = await requireDb();
  const query = db
    .select({
      id: healthChecks.id,
      bookmarkId: healthChecks.bookmarkId,
      runId: healthChecks.runId,
      jobId: healthChecks.jobId,
      checkedAt: healthChecks.checkedAt,
      status: healthChecks.status,
      httpStatus: healthChecks.httpStatus,
      finalUrl: healthChecks.finalUrl,
      durationMs: healthChecks.durationMs,
      error: healthChecks.error,
      failureClass: healthChecks.failureClass,
      networkCode: healthChecks.networkCode,
      redirectChain: healthChecks.redirectChain,
      finalHost: healthChecks.finalHost,
      titleSnapshot: healthChecks.titleSnapshot,
      bodyHash: healthChecks.bodyHash,
      contentLength: healthChecks.contentLength,
      moveClass: healthChecks.moveClass,
      runStartedAt: healthRuns.startedAt,
      runCompletedAt: healthRuns.completedAt,
      runTrigger: healthRuns.trigger,
    })
    .from(healthChecks)
    .leftJoin(healthRuns, eq(healthChecks.runId, healthRuns.id))
    .where(
      and(
        eq(healthChecks.userId, userId),
        eq(healthChecks.bookmarkId, bookmarkId)
      )
    )
    .orderBy(desc(healthChecks.checkedAt), desc(healthChecks.id));
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows;
}

/** Every check recorded for a run, oldest first. */
export async function listHealthChecksForRun(userId: string, runId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(healthChecks)
    .where(and(eq(healthChecks.userId, userId), eq(healthChecks.runId, runId)))
    .orderBy(asc(healthChecks.checkedAt), asc(healthChecks.id));
}

/**
 * The last check recorded for each of these bookmarks before `before` — one
 * row per bookmark, found in the database rather than by loading the whole
 * history into memory.
 *
 * This is the "previous" a run's delta is measured against.
 */
export async function latestChecksBefore(
  userId: string,
  bookmarkIds: number[],
  before: Date
) {
  const db = await requireDb();
  const unique = Array.from(new Set(bookmarkIds));
  const latest = new Map<number, HealthCheckRow>();
  if (!unique.length) return latest;

  const rows = await db
    .selectDistinctOn([healthChecks.bookmarkId])
    .from(healthChecks)
    .where(
      and(
        eq(healthChecks.userId, userId),
        inArray(healthChecks.bookmarkId, unique),
        lt(healthChecks.checkedAt, before)
      )
    )
    .orderBy(
      healthChecks.bookmarkId,
      desc(healthChecks.checkedAt),
      desc(healthChecks.id)
    );
  for (const row of rows) latest.set(row.bookmarkId, row);
  return latest;
}

/** One bookmark's own check history, oldest first. */
export async function listChecksForBookmark(
  userId: string,
  bookmarkId: number
) {
  const db = await requireDb();
  return db
    .select()
    .from(healthChecks)
    .where(
      and(
        eq(healthChecks.userId, userId),
        eq(healthChecks.bookmarkId, bookmarkId)
      )
    )
    .orderBy(asc(healthChecks.checkedAt), asc(healthChecks.id));
}

export async function countHealthChecks(userId?: string) {
  const db = await requireDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(healthChecks)
    .where(userId === undefined ? undefined : eq(healthChecks.userId, userId));
  return Number(rows[0]?.count ?? 0);
}

/** Hide a link from the digest until its next status transition. */
export async function dismissHealthAlert(
  userId: string,
  bookmarkId: number,
  at = new Date()
) {
  const db = await requireDb();
  await db
    .update(bookmarks)
    .set({ healthAlertDismissedAt: at })
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

/** When each of these bookmarks was last dismissed from the digest. */
export async function getHealthAlertDismissals(
  userId: string,
  bookmarkIds: number[]
) {
  const db = await requireDb();
  const unique = Array.from(new Set(bookmarkIds));
  if (!unique.length) return new Map<number, Date>();
  const rows = await db
    .select({
      bookmarkId: bookmarks.id,
      dismissedAt: bookmarks.healthAlertDismissedAt,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, unique)));
  const dismissals = new Map<number, Date>();
  for (const row of rows) {
    if (row.dismissedAt) dismissals.set(row.bookmarkId, row.dismissedAt);
  }
  return dismissals;
}

// ---------------------------------------------------------------------------
// Narrative rot reports (digests).
// ---------------------------------------------------------------------------

export type RotDigestInsert = {
  userId: string;
  runId: number;
  facts: string;
  narrative: string | null;
  narrativeStatus: "none" | "ok" | "failed";
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedPromptTokens: number | null;
};

export async function insertRotDigest(input: RotDigestInsert) {
  const db = await requireDb();
  const result = await db
    .insert(rotDigests)
    .values({
      userId: input.userId,
      runId: input.runId,
      facts: input.facts,
      narrative: input.narrative,
      narrativeStatus: input.narrativeStatus,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      estimatedPromptTokens: input.estimatedPromptTokens,
    })
    .returning({ id: rotDigests.id });
  return result[0]!.id;
}

export async function updateRotDigest(
  userId: string,
  digestId: number,
  update: {
    narrative: string | null;
    narrativeStatus: "none" | "ok" | "failed";
    model: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
  }
) {
  const db = await requireDb();
  await db
    .update(rotDigests)
    .set(update)
    .where(and(eq(rotDigests.id, digestId), eq(rotDigests.userId, userId)));
  const rows = await db
    .select()
    .from(rotDigests)
    .where(and(eq(rotDigests.id, digestId), eq(rotDigests.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getRotDigestByRun(userId: string, runId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(rotDigests)
    .where(and(eq(rotDigests.userId, userId), eq(rotDigests.runId, runId)))
    .limit(1);
  return rows[0];
}

export async function listRotDigests(userId: string, limit = 20) {
  const db = await requireDb();
  return db
    .select()
    .from(rotDigests)
    .where(eq(rotDigests.userId, userId))
    .orderBy(desc(rotDigests.id))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function latestRotDigest(userId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(rotDigests)
    .where(eq(rotDigests.userId, userId))
    .orderBy(desc(rotDigests.id))
    .limit(1);
  return rows[0];
}

export async function markRotDigestRead(userId: string, digestId: number) {
  const db = await requireDb();
  await db
    .update(rotDigests)
    .set({ readAt: new Date() })
    .where(and(eq(rotDigests.id, digestId), eq(rotDigests.userId, userId)));
  const rows = await db
    .select()
    .from(rotDigests)
    .where(and(eq(rotDigests.id, digestId), eq(rotDigests.userId, userId)))
    .limit(1);
  return rows[0];
}

/** Titles, hosts and addresses of every bookmark the owner has. */
export async function listBookmarkTitleIndex(userId: string) {
  const db = await requireDb();
  const rows = await db
    .select({
      id: bookmarks.id,
      title: bookmarks.title,
      host: bookmarks.host,
      url: bookmarks.url,
      archiveUrl:bookmarks.archiveUrl,archiveCheckedAt:bookmarks.archiveCheckedAt,
      checksDisabled:bookmarks.checksDisabled,failureClass:bookmarks.failureClass,
      moveClass:bookmarks.moveClass,persistentFailure:bookmarks.persistentFailure,
    })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId));
  return rows.map(row => ({
    id: row.id,
    title: row.title?.trim() || null,
    host: row.host,
    url: row.url,
    archiveUrl:row.archiveUrl,archiveCheckedAt:row.archiveCheckedAt,
    checksDisabled:row.checksDisabled,failureClass:row.failureClass,
    moveClass:row.moveClass,persistentFailure:row.persistentFailure,
  }));
}

/** Cloud scheduler: read user IDs only from persisted health settings. */
export async function listWeeklyHealthUsers(): Promise<string[]> {
  const database = await requireDb();
  // New libraries may never have opened the Health view yet; such
  // users have no settings row. In their absence, enabled defaults true.
  const rows=await database.selectDistinct({userId:bookmarks.userId}).from(bookmarks);
  const eligible:string[]=[];
  for(const row of rows){
    const settings=await getHealthSettings(row.userId);
    if(!settings || settings.enabled)eligible.push(row.userId);
  }
  return eligible;
}

/** Completed weekly runs are the authoritative cadence, not manual runs. */
export async function latestCompletedWeeklyHealthRun(userId: string) {
  const database = await requireDb();
  const rows = await database.select().from(healthRuns)
    .where(and(eq(healthRuns.userId, userId),
      eq(healthRuns.trigger, "weekly"), eq(healthRuns.status, "completed")))
    .orderBy(desc(healthRuns.completedAt)).limit(1);
  return rows[0] ?? null;
}


/** An unactivated interrupted run can enqueue safely on a later invocation. */
export async function hasBookmarkJobInRun(userId:string,bookmarkId:number,runId:number) {
  const database=await requireDb();
  const rows=await database.select({id:bookmarkJobs.id}).from(bookmarkJobs).where(and(
    eq(bookmarkJobs.userId,userId),eq(bookmarkJobs.bookmarkId,bookmarkId),
    eq(bookmarkJobs.runId,runId),eq(bookmarkJobs.type,"health_check"))).limit(1);
  return rows.length>0;
}
export async function countJobsForRun(userId:string,runId:number) {
  const database=await requireDb();
  const rows=await database.select({count:sql<number>`count(*)`}).from(bookmarkJobs).where(and(
    eq(bookmarkJobs.userId,userId),eq(bookmarkJobs.runId,runId),
    eq(bookmarkJobs.type,"health_check")));
  return Number(rows[0]?.count??0);
}

// ------- Health Engine v2 storage: explicit, owner-scoped, additive -------

export async function updateBookmarkControls(
  userId: string, bookmarkId: number,
  update: { checksDisabled?: boolean; healthNote?: string | null }
) {
  const database = await requireDb();
  await database.update(bookmarks).set(update)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));
  return getBookmark(userId, bookmarkId);
}

export async function setBookmarkArchiveResult(
  userId: string, bookmarkId: number, archiveUrl: string | null,
  archiveTimestamp: Date | null, runId: number | null
) {
  const database = await requireDb();
  await database.update(bookmarks).set({
    archiveUrl, archiveTimestamp, archiveCheckedAt: new Date(),
    archiveLookupRunId: runId
  }).where(and(eq(bookmarks.userId,userId),eq(bookmarks.id,bookmarkId)));
  return getBookmark(userId,bookmarkId);
}

export async function recordArchiveReplacement(
  userId: string, bookmarkId: number,
  originalUrl: string, normalized: {url:string; normalizedUrl:string; normalizedUrlHash:string; host:string}
) {
  const database = await requireDb();
  await database.update(bookmarks).set({
    url:normalized.url,normalizedUrl:normalized.normalizedUrl,
    normalizedUrlHash:normalized.normalizedUrlHash,host:normalized.host,
    originalUrl, healthStatus:"unchecked", healthError:null, httpStatus:null,
    lastCheckedAt:null, failureClass:null,moveClass:null,soft404Streak:0,
    persistentFailure:false,persistentFailureStreak:0,persistentFailureClass:null,
  }).where(and(eq(bookmarks.userId,userId),eq(bookmarks.id,bookmarkId)));
  // Explicit audit check: the saved URL changed; new destination remains unchecked.
  await insertHealthCheck({
    userId,bookmarkId,runId:null,checkedAt:new Date(),status:"needs_review",
    httpStatus:null,finalUrl:normalized.normalizedUrl,durationMs:0,
    error:"Owner replaced the link with its archived copy.",
    failureClass:"inconclusive",moveClass:"none",
  });
  return getBookmark(userId,bookmarkId);
}

export async function acquireDomainSlot(host: string, leaseToken: string, now=new Date()) {
  const database = await requireDb();
  const recent = new Date(now.getTime()-750);
  const active = new Date(now.getTime()+90_000);
  const claim = await database.insert(domainPacing)
    .values({host,leaseToken,leaseUntil:active})
    .onConflictDoUpdate({
      target:domainPacing.host,
      set:{leaseToken,leaseUntil:active},
      setWhere:and(
        or(isNull(domainPacing.leaseUntil),lte(domainPacing.leaseUntil,now)),
        or(isNull(domainPacing.lastCheckedAt),lte(domainPacing.lastCheckedAt,recent))
      )
    }).returning({host:domainPacing.host});
  return claim.length===1;
}

export async function releaseDomainSlot(host: string, leaseToken: string) {
  const database = await requireDb();
  await database.update(domainPacing).set({
    leaseToken:null,leaseUntil:null,lastCheckedAt:new Date(),
  }).where(and(eq(domainPacing.host,host),eq(domainPacing.leaseToken,leaseToken)));
}

export async function delayBookmarkJob(jobId:number, millis=1000) {
  const database=await requireDb();
  await database.update(bookmarkJobs)
    .set({availableAt:new Date(Date.now()+Math.max(750,millis))})
    .where(and(eq(bookmarkJobs.id,jobId),eq(bookmarkJobs.status,"pending")));
}

export async function getHostProbe(host:string,runId:number) {
  const database=await requireDb();
  const rows=await database.select().from(hostProbes)
    .where(and(eq(hostProbes.host,host),eq(hostProbes.runId,runId))).limit(1);
  return rows[0]??null;
}

export async function saveHostProbe(input:{
 host:string;runId:number;resultStatus:number|null;finalUrl:string|null;
 title:string|null;bodyHash:string|null;bodySample:string
}) {
  const database=await requireDb();
  await database.insert(hostProbes).values(input).onConflictDoNothing();
  return getHostProbe(input.host,input.runId);
}

export async function getHealthRollup(userId:string,bookmarkId:number) {
  const database=await requireDb();
  const rows=await database.select().from(healthRollups)
    .where(and(eq(healthRollups.userId,userId),eq(healthRollups.bookmarkId,bookmarkId))).limit(1);
  return rows[0]??null;
}

export async function writeHealthRollup(
  userId:string,bookmarkId:number, summary:{
  prunedCheckCount:number; firstCheckedAt:Date|null; firstBrokenAt:Date|null;
  lastPrunedStatus:string|null;lastPrunedAt:Date|null;
  statusSince:Date|null;openStreak:number;brokenSince:Date|null;
}) {
  const database=await requireDb();
  await database.insert(healthRollups).values({userId,bookmarkId,...summary})
    .onConflictDoUpdate({target:[healthRollups.userId,healthRollups.bookmarkId],set:summary});
}

export async function listOldHealthChecks(userId:string,cutoff:Date,limit=2000) {
  const database=await requireDb();
  return database.select().from(healthChecks)
    .where(and(eq(healthChecks.userId,userId),lt(healthChecks.checkedAt,cutoff)))
    .orderBy(asc(healthChecks.bookmarkId),asc(healthChecks.checkedAt),asc(healthChecks.id))
    .limit(Math.min(5000,limit));
}

export async function deleteHealthChecksByIds(userId:string,ids:number[]) {
  if (!ids.length) return;
  const database=await requireDb();
  await database.delete(healthChecks)
    .where(and(eq(healthChecks.userId,userId),inArray(healthChecks.id,ids)));
}

/** Shelves never update collections, conventional tags or manual tag links. */
export async function listTopicDismissals(userId:string) {
  const database=await requireDb();
  return database.select().from(topicDismissals).where(eq(topicDismissals.userId,userId));
}

export async function dismissTopic(userId:string, normalizedName:string,bookmarkId=0) {
  const database=await requireDb();
  await database.insert(topicDismissals).values({userId,normalizedName,bookmarkId})
    .onConflictDoNothing();
}

export async function listTopicLinks(userId:string) {
  const database=await requireDb();
  return database.select({
    id:tags.id,name:tags.name,normalizedName:tags.normalizedName,bookmarkId:bookmarkTags.bookmarkId
  }).from(bookmarkTags).innerJoin(tags,eq(bookmarkTags.tagId,tags.id))
    .where(and(eq(tags.userId,userId),eq(bookmarkTags.source,"topic")));
}

export async function replaceTopicLinks(userId:string, shelves:Array<{
  normalizedName:string;name:string;bookmarkIds:number[]
}>) {
  const database=await requireDb();
  const owned=await database.select({id:bookmarks.id}).from(bookmarks)
    .where(eq(bookmarks.userId,userId));
  const ownedIds=new Set(owned.map(x=>x.id));
  const ids=owned.map(x=>x.id);
  if(ids.length) await database.delete(bookmarkTags).where(and(
    eq(bookmarkTags.source,"topic"),inArray(bookmarkTags.bookmarkId,ids)
  ));
  const dismissed=await listTopicDismissals(userId);
  const exclusions=new Set(dismissed.map(d=>d.bookmarkId+":"+d.normalizedName));
  for(const shelf of shelves){
    const existing = await database.select({id:tags.id}).from(tags)
      .where(and(eq(tags.userId,userId),eq(tags.normalizedName,shelf.normalizedName))).limit(1);
    let tagId=existing[0]?.id;
    if(!tagId){
      const value=await getOrCreateTopicTag(userId,shelf.normalizedName,shelf.name);
      tagId=value.id;
    }
    for(const bookmarkId of shelf.bookmarkIds){
      if(!ownedIds.has(bookmarkId) || exclusions.has("0:"+shelf.normalizedName) ||
        exclusions.has(bookmarkId+":"+shelf.normalizedName)) continue;
      await database.insert(bookmarkTags).values({
        userId,bookmarkId,tagId,source:"topic"
      }).onConflictDoNothing();
    }
  }
}

async function getOrCreateTopicTag(userId:string, normalizedName:string,name:string){
  const database=await requireDb();
  await database.insert(tags).values({userId,normalizedName,name})
    .onConflictDoNothing();
  const rows=await database.select().from(tags)
    .where(and(eq(tags.userId,userId),eq(tags.normalizedName,normalizedName))).limit(1);
  if(!rows[0])throw new Error("Topic tag creation failed");
  return rows[0];
}
