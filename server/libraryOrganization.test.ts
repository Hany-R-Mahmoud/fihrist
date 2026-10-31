// TOKEN_POLICY_BATCHED_EXECUTION: integration coverage for the organization changes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it, expect, vi } from "vitest";
let directory: string;
afterEach(() => {
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
});
it("isolates owners and preserves data during organization actions", async () => {
  directory = mkdtempSync(join(tmpdir(), "fihrist-organization-"));
  vi.stubEnv("FIHRIST_DATA_DIR", directory);
  vi.stubEnv("FIHRIST_MODE", "local");
  vi.resetModules();
  const db = await import("./db");
  const org = await import("./libraryOrganization");
  const records = await import("./libraryRecords");
  await db.upsertUser({ openId: "owner" });
  await db.upsertUser({ openId: "other" });
  const root = await org.createNestedCollection(1, "Work", null);
  const child = await org.createNestedCollection(1, "Reading", root!.id);
  const other = await org.createNestedCollection(1, "Later", root!.id);
  expect(child?.parentId).toBe(root!.id);
  await expect(org.moveCollection(1, root!.id, child!.id)).rejects.toThrow();
  await expect(org.moveCollection(2, root!.id, null)).rejects.toThrow();
  const add = async (
    url: string,
    hash: string,
    collectionId: number | null = null
  ) =>
    db.createBookmarkWithJob(
      {
        userId: 1,
        url,
        normalizedUrl: url,
        normalizedUrlHash: hash,
        host: new URL(url).host,
        collectionId,
      },
      "scrape"
    );
  const a = await add("https://example.com/article", "a", root!.id);
  const b = await add(
    "https://example.com/article?utm_source=test",
    "b",
    child!.id
  );
  const c = await add("https://different.com/other", "c");
  await db.updateBookmarkNotes(1, a!.id, "First");
  await db.updateBookmarkNotes(1, b!.id, "Second");
  await db.addManualTag(1, a!.id, "One");
  await db.addManualTag(1, b!.id, "Two");
  const groups = await org.duplicateGroups(1);
  expect(groups).toHaveLength(1);
  expect(groups[0].items.map(b => b.id)).toEqual([a!.id, b!.id]);
  await org.mergeDuplicates(1, [a!.id, b!.id]);
  expect(await db.getBookmark(1, b!.id)).toBeUndefined();
  const survivor = await db.getBookmark(1, a!.id);
  expect(survivor?.notes).toBe("First\n\nSecond");
  expect(survivor?.tags.map(t => t.name).sort()).toEqual(["One", "Two"]);
  expect(survivor?.collectionId).toBe(root!.id);
  const tags = await org.tagList(1);
  const one = tags.find(t => t.name === "One")!,
    two = tags.find(t => t.name === "Two")!;
  await expect(org.governTag(2, Number(one.id), "delete")).rejects.toThrow();
  await org.governTag(1, Number(one.id), "rename", "Renamed");
  await org.governTag(1, Number(two.id), "merge", undefined, Number(one.id));
  await org.governTag(1, Number(one.id), "delete");
  await db.replaceAutomaticTags(1, a!.id, ["Renamed"]);
  expect((await db.getBookmark(1, a!.id))?.tags).toHaveLength(0);
  const topic = {
    normalizedName: "topic:host:example.com",
    name: "Site: example.com",
    bookmarkIds: [a!.id],
  };
  await db.replaceTopicLinks(1, [topic]);
  const topicTag = (await org.tagList(1)).find(
    t => t.normalized === topic.normalizedName
  )!;
  await org.governTag(1, Number(topicTag.id), "delete");
  await db.replaceTopicLinks(1, [topic]);
  expect(
    (await db.listTopicLinks(1)).some(
      t => t.normalizedName === topic.normalizedName
    )
  ).toBe(false);
  const saved = await records.saveLibraryRecord(1, "search", "Unread", {
    readingStatus: "unread",
  });
  expect(await records.listLibraryRecords(2, "search")).toHaveLength(0);
  await expect(
    records.saveLibraryRecord(2, "search", "Stolen", {}, saved)
  ).rejects.toThrow();
  const receipt = await records.saveLibraryRecord(1, "import", "Test import", {
    bookmarkIds: [c!.id],
    collectionIds: [other!.id],
  });
  await org.undoImport(1, receipt);
  expect(await db.getBookmark(1, c!.id)).toBeUndefined();
  expect(await db.getBookmark(1, a!.id)).toBeTruthy();
  expect(await db.getCollection(1, other!.id)).toBeUndefined();
  (await db.getDb()).$client.close();
}, 20000);
