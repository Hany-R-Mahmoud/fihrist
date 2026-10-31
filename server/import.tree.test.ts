// TOKEN_POLICY_BATCHED_EXECUTION: importer acceptance; URL safety has its own unchanged suite.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect, vi } from "vitest";
vi.mock("./services/linkSafety.js", async () => {
  const actual = await vi.importActual<
    typeof import("./services/linkSafety.js")
  >("./services/linkSafety.js");
  const { normalizeBookmarkUrl } = await import("./services/bookmarkUtils.js");
  return {
    ...actual,
    assertPublicUrlTarget: vi.fn(async (url: string) =>
      normalizeBookmarkUrl(url)
    ),
  };
});
it("imports sibling folders under their real parent and undoes only inserted links", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fihrist-import-"));
  vi.stubEnv("FIHRIST_DATA_DIR", directory);
  vi.stubEnv("FIHRIST_MODE", "local");
  vi.resetModules();
  const db = await import("./db");
  try {
    await db.upsertUser({ openId: "owner" });
    const user = await db.getUserByOpenId("owner");
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user,
      req: { headers: {} } as never,
      res: {} as never,
    });
    const existing = await caller.bookmarks.add({
      url: "https://example.org/existing",
    });
    const flat = await caller.collections.create({ name: "Work / Reading" });
    const fixture =
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Work</H3><DL><p><DT><H3>Reading</H3><DL><p><DT><A HREF="https://example.org/read">Read</A><DT><A HREF="https://example.org/existing">Existing</A></DL><p><DT><H3>Later</H3><DL><p><DT><A HREF="https://example.org/later">Later</A></DL><p></DL><p></DL>';
    const result = await caller.bookmarks.importNetscape({ html: fixture });
    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    const collections = await caller.collections.list();
    const work = collections.find(c => c.name === "Work")!;
    expect(collections.find(c => c.name === "Reading")?.parentId).toBe(work.id);
    expect(collections.find(c => c.name === "Later")?.parentId).toBe(work.id);
    expect(collections.find(c => c.id === flat!.id)?.name).toBe(
      "Work / Reading"
    );
    await expect(
      caller.collections.reparent({
        id: work.id,
        parentId: collections.find(c => c.name === "Reading")!.id,
      })
    ).rejects.toThrow();
    await caller.bookmarks.undoImport({ id: result.receiptId });
    expect((await caller.bookmarks.list()).items.map(b => b.id)).toEqual([
      existing!.id,
    ]);
    expect((await caller.collections.list()).map(c => c.id)).toEqual([
      flat!.id,
    ]);
  } finally {
    (await db.getDb()).$client.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);
