import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  libraryBatch,
  librarySql,
  saveLibraryRecord,
  listLibraryRecords,
  removeLibraryRecord,
} from "./libraryRecords.js";
import { db } from "./data.js";
import { candidateGroups } from "../shared/duplicates.js";
export { duplicateUrl } from "../shared/duplicates.js";

const cloud = () => process.env.FIHRIST_MODE === "cloud";
const table = (name: string) => sql.raw((cloud() ? "fihrist." : "") + name);
const column = (local: string, remote: string) =>
  sql.raw('"' + (cloud() ? remote : local) + '"');
const owner = () => column("userId", "user_id");
const tagId = () => column("tagId", "tag_id");
const bookmarkId = () => column("bookmarkId", "bookmark_id");
const links = () => table(cloud() ? "bookmark_tags" : "bookmarkTags");
export async function createNestedCollection(
  userId: number,
  name: string,
  parentId: number | null
) {
  if (parentId !== null && !(await db.getCollection(userId, parentId)))
    throw new Error("Parent collection not found");
  const now = cloud() ? new Date().toISOString() : Date.now();
  const rows = await librarySql(
    sql`insert into ${table("collections")}(${owner()},name,${column("parentId", "parent_id")},${column("createdAt", "created_at")},${column("updatedAt", "updated_at")}) values(${userId},${name},${parentId},${now},${now}) returning id`
  );
  return db.getCollection(userId, Number(rows[0].id));
}
export async function moveCollection(
  userId: number,
  id: number,
  parentId: number | null
) {
  const rows = await db.listCollections(userId);
  const byId = new Map(rows.map(c => [c.id, c]));
  if (!byId.has(id)) throw new Error("Collection not found");
  let cursor = parentId;
  const seen = new Set<number>();
  while (cursor !== null) {
    if (cursor === id || seen.has(cursor))
      throw new Error("A collection cannot contain itself or its parent");
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) throw new Error("Parent collection not found");
    cursor = parent.parentId;
  }
  await librarySql(
    sql`update ${table("collections")} set ${column("parentId", "parent_id")}=${parentId} where id=${id} and ${owner()}=${userId} returning id`
  );
}
export async function undoImport(userId: number, id: string) {
  const receipt = (await listLibraryRecords(userId, "import")).find(
    r => r.id === id
  );
  if (!receipt) throw new Error("Import not found");
  const ids = Array.isArray(receipt.payload.bookmarkIds)
    ? receipt.payload.bookmarkIds.map(Number)
    : [];
  for (const bookmarkId of ids) await db.deleteBookmark(userId, bookmarkId);
  const collections = Array.isArray(receipt.payload.collectionIds)
    ? receipt.payload.collectionIds.map(Number).reverse()
    : [];
  for (const collectionId of collections) {
    await librarySql(
      sql`delete from ${table("collections")} where id=${collectionId} and ${owner()}=${userId} and not exists(select 1 from ${table("bookmarks")} where ${column("collectionId", "collection_id")}=${collectionId}) and not exists(select 1 from ${table("collections")} child where child.${column("parentId", "parent_id")}=${collectionId}) returning id`
    );
  }
  await removeLibraryRecord(userId, "import", id);
  return { removedCount: ids.length };
}
export async function tagList(userId: number) {
  return librarySql(
    sql`select t.id,t.name,t.${column("normalizedName", "normalized_name")} as normalized, count(distinct l.${bookmarkId()}) as count from ${table("tags")} t left join ${links()} l on l.${tagId()}=t.id where t.${owner()}=${userId} group by t.id,t.name,t.${column("normalizedName", "normalized_name")} order by t.name`
  );
}
export async function governTag(
  userId: number,
  id: number,
  action: "rename" | "delete" | "merge",
  name?: string,
  targetId?: number
) {
  const tags = await tagList(userId);
  const source = tags.find(t => Number(t.id) === id);
  if (!source) throw new Error("Tag not found");
  if (action === "rename") {
    if (!name?.trim()) throw new Error("Name required");
    await librarySql(
      sql`update ${table("tags")} set name=${name.trim()},${column("normalizedName", "normalized_name")}=${name.trim().toLocaleLowerCase()} where id=${id} and ${owner()}=${userId} returning id`
    );
    return;
  }
  const statements = [];
  if (action === "merge") {
    if (targetId === id || !tags.some(t => Number(t.id) === targetId))
      throw new Error("Target tag not found");
    const extra = cloud() ? sql`,user_id` : sql``;
    const extraValue = cloud() ? sql`,${userId}` : sql``;
    const created = column("createdAt", "created_at");
    statements.push(
      sql`insert into ${links()}(${bookmarkId()},${tagId()},source,${created}${extra}) select ${bookmarkId()},${targetId},source,${created}${extraValue} from ${links()} where ${tagId()}=${id} on conflict(${bookmarkId()},${tagId()}) do nothing returning id`
    );
  }
  statements.push(
    sql`insert into ${table("library_records")}(id,owner,kind,name,payload) values(${randomUUID()},${String(userId)},'blocked-tag',${String(source.normalized)},'{}')`
  );
  statements.push(sql`delete from ${links()} where ${tagId()}=${id}`);
  statements.push(
    sql`delete from ${table("tags")} where id=${id} and ${owner()}=${userId}`
  );
  await libraryBatch(statements);
}
export async function duplicateGroups(userId: number) {
  const rows = await db.listBookmarks(userId, {}, 10001);
  if (rows.length > 10000)
    throw new Error("Review supports up to 10000 links per library");
  return candidateGroups(rows);
}
export async function mergeDuplicates(userId: number, ids: number[]) {
  const groups = await duplicateGroups(userId);
  const group = groups.find(
    g => ids.length === g.items.length && g.items.every(b => ids.includes(b.id))
  );
  if (!group) throw new Error("Duplicate group changed. Review again.");
  const [keep, ...others] = group.items;
  const statements = [];
  const notes = [keep.notes, ...others.map(b => b.notes)]
    .filter(Boolean)
    .join("\n\n");
  if (notes.length > 20000)
    throw new Error(
      "Combined notes exceed 20000 characters; shorten notes before merging"
    );
  for (const other of others) {
    const created = column("createdAt", "created_at");
    const extra = cloud() ? sql`,user_id` : sql``;
    const extraValue = cloud() ? sql`,${userId}` : sql``;
    // TOKEN_POLICY_BATCHED_EXECUTION: tag union and deletion commit together.
    statements.push(
      sql`insert into ${links()}(${bookmarkId()},${tagId()},source,${created}${extra}) select ${keep.id},${tagId()},source,${created}${extraValue} from ${links()} where ${bookmarkId()}=${other.id} on conflict(${bookmarkId()},${tagId()}) do nothing returning id`
    );
  }
  statements.push(
    sql`update ${table("bookmarks")} set notes=${notes || null} where id=${keep.id} and ${owner()}=${userId}`
  );
  for (const other of others)
    statements.push(
      sql`delete from ${table("bookmarks")} where id=${other.id} and ${owner()}=${userId}`
    );
  await libraryBatch(statements);
  return { id: keep.id };
}
