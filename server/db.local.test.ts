import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// Each test opens a real SQLite database and applies every migration, which
// is slower than the default per-test budget allows on a loaded machine.
describe("local bookmark persistence", () => {
  it("commits a bookmark and its scrape job in one SQLite transaction", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fihrist-"));
    directories.push(directory);
    vi.stubEnv("FIHRIST_DATA_DIR", directory);
    vi.resetModules();
    const db = await import("./db");

    await db.upsertUser({
      openId: "local-user",
      name: "Local User",
      email: "local@localhost",
      loginMethod: "local",
      role: "admin",
    });
    const bookmark = await db.createBookmarkWithJob(
      {
        userId: 1,
        collectionId: null,
        url: "https://example.com/transaction-check",
        normalizedUrl: "https://example.com/transaction-check",
        normalizedUrlHash: "transaction-check-hash",
        host: "example.com",
      },
      "scrape"
    );
    const database = await db.getDb();
    const job = database.$client.prepare("select status from bookmarkJobs where bookmarkId = ?").get(bookmark.id);

    expect(job.status).toBe("pending");
    database.$client.close();
  });
}, 20000);
