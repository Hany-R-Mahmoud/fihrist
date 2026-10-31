import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

let directory: string;
afterEach(() => {
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it("persists reading choices, combines owner-scoped filters, and reverses the migration", async () => {
  directory = mkdtempSync(join(tmpdir(), "fihrist-reading-"));
  vi.stubEnv("FIHRIST_DATA_DIR", directory);
  vi.resetModules();
  const db = await import("./db");
  await db.upsertUser({ openId: "reader" });
  await db.upsertUser({ openId: "other-reader" });
  const bookmark = await db.createBookmarkWithJob(
    {
      userId: 1,
      collectionId: null,
      url: "https://example.com/read",
      normalizedUrl: "https://example.com/read",
      normalizedUrlHash: "reader",
      host: "example.com",
    },
    "scrape"
  );
  expect(bookmark?.readingStatus).toBe("unread");
  expect(bookmark?.starred).toBe(false);
  const updated = await db.updateReading(1, bookmark!.id, {
    readingStatus: "reading",
    starred: true,
    pinned: true,
  });
  expect(updated).toMatchObject({
    readingStatus: "reading",
    starred: true,
    pinned: true,
  });
  expect(
    await db.updateReading(2, bookmark!.id, { readingStatus: "read" })
  ).toBeUndefined();
  expect(
    (
      await db.listBookmarkPage(1, {
        domain: "EXAMPLE.COM",
        readingStatus: "reading",
        pinned: true,
      })
    ).totalCount
  ).toBe(1);
  expect(
    (
      await db.listBookmarkPage(1, {
        domain: "other.com",
        readingStatus: "reading",
      })
    ).totalCount
  ).toBe(0);
  expect(
    (await db.listBookmarkPage(2, { readingStatus: "reading" })).totalCount
  ).toBe(0);
  const database = await db.getDb();
  database.$client.exec(
    readFileSync("drizzle/sqlite/0005_reading_workflow.down.sql", "utf8")
  );
  expect(
    database.$client
      .prepare("select url from bookmarks where id=?")
      .get(bookmark!.id)
  ).toMatchObject({ url: "https://example.com/read" });
  database.$client.close();
}, 20000);
