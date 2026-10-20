import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function openFixture() {
  const directory = mkdtempSync(join(tmpdir(), "fihrist-history-"));
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
  return db;
}

// Each test opens a real SQLite database and applies every migration, which
// is slower than the default per-test budget allows on a loaded machine.
describe("check history persistence", () => {
  it("records every check against the run that produced it", async () => {
    const db = await openFixture();
    const bookmark = await db.createBookmark({
      userId: 1,
      collectionId: null,
      url: "https://example.com/history",
      normalizedUrl: "https://example.com/history",
      normalizedUrlHash: "history-hash",
      host: "example.com",
    });

    const run = await db.startHealthRun(1, { trigger: "weekly" });
    await db.activateHealthRun(1, run.id, 2);

    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: bookmark.id,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(Date.UTC(2026, 0, 1, 12)),
      status: "healthy",
      httpStatus: 200,
      finalUrl: "https://example.com/history",
      durationMs: 120,
      error: null,
    });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: bookmark.id,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(Date.UTC(2026, 0, 8, 12)),
      status: "broken",
      httpStatus: 404,
      finalUrl: "https://example.com/history",
      durationMs: 90,
      error: "The page is gone (HTTP 404).",
    });

    const timeline = await db.listBookmarkTimeline(1, bookmark.id);
    expect(timeline).toHaveLength(2);
    // Newest first.
    expect(timeline[0].status).toBe("broken");
    expect(timeline[0].httpStatus).toBe(404);
    expect(timeline[0].durationMs).toBe(90);
    expect(timeline[0].runId).toBe(run.id);
    expect(timeline[0].runTrigger).toBe("weekly");
    expect(timeline[0].runStartedAt).toBeInstanceOf(Date);
    expect(timeline[1].status).toBe("healthy");
    expect(timeline[1].runId).toBe(run.id);

    expect(await db.countHealthChecks(1)).toBe(2);
  });

  it("gives a single manual check its own run", async () => {
    const db = await openFixture();
    const bookmark = await db.createBookmark({
      userId: 1,
      collectionId: null,
      url: "https://example.com/single",
      normalizedUrl: "https://example.com/single",
      normalizedUrlHash: "single-hash",
      host: "example.com",
    });

    const run = await db.startHealthRun(1, { trigger: "single" });
    await db.createBookmarkJob(1, bookmark.id, "health_check", run.id);
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: bookmark.id,
      runId: run.id,
      jobId: null,
      checkedAt: new Date(),
      status: "needs_review",
      httpStatus: null,
      finalUrl: null,
      durationMs: 40,
      error: "The site blocks automated checks (HTTP 403).",
    });

    const timeline = await db.listBookmarkTimeline(1, bookmark.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].runId).toBe(run.id);
    expect(timeline[0].runTrigger).toBe("single");
    expect(timeline[0].status).toBe("needs_review");
  });

  it("completes a run once its jobs drain and records how many were checked", async () => {
    const db = await openFixture();
    const bookmark = await db.createBookmark({
      userId: 1,
      collectionId: null,
      url: "https://example.com/drain",
      normalizedUrl: "https://example.com/drain",
      normalizedUrlHash: "drain-hash",
      host: "example.com",
    });

    const run = await db.startHealthRun(1, { trigger: "weekly" });
    await db.activateHealthRun(1, run.id, 1);
    const job = await db.createBookmarkJob(1, bookmark.id, "health_check", run.id);

    // The job is still pending — the run must not complete yet.
    expect(await db.completeDrainedHealthRuns(1)).toHaveLength(0);

    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: bookmark.id,
      runId: run.id,
      jobId: job.id,
      checkedAt: new Date(),
      status: "healthy",
      httpStatus: 200,
      finalUrl: "https://example.com/drain",
      durationMs: 80,
      error: null,
    });
    const database = await db.getDb();
    database.$client
      .prepare("update bookmarkJobs set status = 'completed' where id = ?")
      .run(job.id);

    const completed = await db.completeDrainedHealthRuns(1);
    expect(completed).toHaveLength(1);
    expect(completed[0].status).toBe("completed");
    expect(completed[0].checked).toBe(1);
  });

  it("lets a second sweep join the one already running, so one sweep means one report", async () => {
    const db = await openFixture();
    const { openHealthRun } = await import("./services/jobProcessor");

    const first = await openHealthRun(1, "manual");
    const second = await openHealthRun(1, "manual");

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.run.id).toBe(first.run.id);
  });

  it("never absorbs a single-bookmark check into a sweep", async () => {
    const db = await openFixture();
    const { openHealthRun } = await import("./services/jobProcessor");

    const sweep = await openHealthRun(1, "manual");
    const single = await db.startHealthRun(1, { trigger: "single" });
    const next = await openHealthRun(1, "manual");

    expect(next.run.id).not.toBe(single.id);
    expect(next.run.id).toBe(sweep.run.id);
  });

  it("removes a bookmark's history when the bookmark is deleted", async () => {
    const db = await openFixture();
    const bookmark = await db.createBookmark({
      userId: 1,
      collectionId: null,
      url: "https://example.com/cascade",
      normalizedUrl: "https://example.com/cascade",
      normalizedUrlHash: "cascade-hash",
      host: "example.com",
    });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: bookmark.id,
      runId: null,
      jobId: null,
      checkedAt: new Date(),
      status: "healthy",
      httpStatus: 200,
      finalUrl: null,
      durationMs: 10,
      error: null,
    });

    await db.deleteBookmark(1, bookmark.id);
    expect(await db.countHealthChecks(1)).toBe(0);
  });
}, 20000);
