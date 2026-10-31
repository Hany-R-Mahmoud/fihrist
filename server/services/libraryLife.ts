import { db } from "../data.js";
import { sql } from "drizzle-orm";
import {
  librarySql,
  listLibraryRecords,
  saveLibraryRecord,
} from "../libraryRecords.js";
import { habitsFacts } from "../../shared/habits.js";

export async function libraryLife(userId: number) {
  const bookmarks = [] as Awaited<
    ReturnType<typeof db.listBookmarkPage>
  >["items"];
  let cursor: string | undefined;
  do {
    const page = await db.listBookmarkPage(userId, { limit: 100, cursor });
    bookmarks.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  const cloud = process.env.FIHRIST_MODE === "cloud";
  const checks = await librarySql(
    sql`select ${sql.raw(cloud ? "bookmark_id" : '"bookmarkId"')} as bookmark, status, ${sql.raw(cloud ? "checked_at" : '"checkedAt"')} as checked from ${sql.raw(cloud ? "fihrist.health_checks" : "health_checks")} where ${sql.raw(cloud ? "user_id" : '"userId"')}=${userId} order by ${sql.raw(cloud ? "checked_at" : '"checkedAt"')},id`
  );
  const previous = new Map<number, string>();
  const transitions: Record<string, { status: string; checked: string }[]> = {};
  for (const c of checks) {
    const id = Number(c.bookmark);
    if (previous.get(id) !== c.status) {
      (transitions[id] ??= []).push({
        status: String(c.status),
        checked: new Date(c.checked as string | number).toISOString(),
      });
    }
    previous.set(id, String(c.status));
  }
  return {
    bookmarks: bookmarks.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id
    ),
    transitions,
    habits: habitsFacts(bookmarks),
  };
}
export async function generateHabitsDigest(userId: number) {
  const facts = (await libraryLife(userId)).habits;
  const existing = (await listLibraryRecords(userId, "habits")).find(
    r => r.payload.week === facts.week
  );
  await saveLibraryRecord(userId, "habits", facts.week, facts, existing?.id);
  return facts;
}
