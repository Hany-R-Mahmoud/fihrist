// TOKEN_POLICY_BATCHED_EXECUTION: pin-first pagination must never skip or repeat links.
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect, vi } from "vitest";
it("paginates pinned links correctly with AND search filters and reverses organization migrations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fihrist-pages-"));
  vi.stubEnv("FIHRIST_DATA_DIR", directory);
  vi.stubEnv("FIHRIST_MODE", "local");
  vi.resetModules();
  const db = await import("./db");
  try {
    await db.upsertUser({ openId: "reader" });
    for (let i = 0; i < 25; i++) {
      const url = `https://example.org/${i}`;
      const b = await db.createBookmark({
        userId: 1,
        collectionId: null,
        url,
        normalizedUrl: url,
        normalizedUrlHash: `pages-${i}`,
        host: "example.org",
      });
      await db.updateBookmarkMetadata(1, b!.id, { title: `Reading ${i}` });
      await db.updateReading(1, b!.id, {
        pinned: i % 5 === 0,
        readingStatus: "unread",
      });
    }
    const all = [] as Awaited<ReturnType<typeof db.listBookmarkPage>>["items"];
    let cursor: string | undefined;
    do {
      const page = await db.listBookmarkPage(1, {
        limit: 4,
        cursor,
        domain: "example.org",
        readingStatus: "unread",
      });
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(all).toHaveLength(25);
    expect(new Set(all.map(b => b.id)).size).toBe(25);
    expect(all.slice(0, 5).every(b => b.pinned)).toBe(true);
    expect(all.slice(5).some(b => b.pinned)).toBe(false);
    const search = await db.searchBookmarkPage(1, "Reading", undefined, 4, {
      domain: "example.org",
      readingStatus: "unread",
      pinned: true,
    });
    expect(search.totalCount).toBe(5);
    expect(search.items.every(b => b.pinned)).toBe(true);
    const rest = await db.searchBookmarkPage(
      1,
      "Reading",
      search.nextCursor ?? undefined,
      4,
      { domain: "example.org", readingStatus: "unread", pinned: true }
    );
    expect(rest.items).toHaveLength(1);
    expect(
      rest.items.some(b => search.items.some(first => first.id === b.id))
    ).toBe(false);
    const database = await db.getDb();
    database.$client.exec(
      readFileSync("drizzle/sqlite/0007_collection_tree.down.sql", "utf8")
    );
    database.$client.exec(
      readFileSync("drizzle/sqlite/0006_library_records.down.sql", "utf8")
    );
    expect(
      database.$client.prepare("select count(*) as count from bookmarks").get()
    ).toEqual({ count: 25 });
  } finally {
    (await db.getDb()).$client.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);
