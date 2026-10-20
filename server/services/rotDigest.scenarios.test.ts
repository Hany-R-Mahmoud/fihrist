import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;
const RUN_ONE = new Date("2026-01-05T09:00:00.000Z");
const RUN_TWO = new Date("2026-01-12T09:00:00.000Z");
const RUN_THREE = new Date("2026-01-19T09:00:00.000Z");

type Seed = {
  key: string;
  title: string;
  url: string;
  status: "healthy" | "redirected" | "broken" | "needs_review";
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
};

const LIBRARY: Seed[] = [
  {
    key: "healthy",
    title: "Healthy page",
    url: "https://example.com/healthy",
    status: "healthy",
    httpStatus: 200,
    finalUrl: "https://example.com/healthy",
    error: null,
  },
  {
    key: "removed",
    title: "Removed page",
    url: "https://example.com/removed",
    status: "broken",
    httpStatus: 404,
    finalUrl: "https://example.com/removed",
    error: "The page is gone (HTTP 404).",
  },
  {
    key: "dead",
    title: "Dead domain",
    url: "https://dead-domain-xyz.example/",
    status: "broken",
    httpStatus: null,
    finalUrl: null,
    error: "The domain does not resolve (DNS failure).",
  },
  {
    key: "moved",
    title: "Moved page",
    url: "https://example.com/moved",
    status: "redirected",
    httpStatus: 200,
    finalUrl: "https://example.com/moved-new",
    error: null,
  },
  {
    key: "guarded",
    title: "Guarded page",
    url: "https://protected.example/",
    status: "needs_review",
    httpStatus: 403,
    finalUrl: "https://protected.example/",
    error: "The site blocks automated checks (HTTP 403). It may be fine — verify manually.",
  },
];

async function openFixture() {
  const directory = mkdtempSync(join(tmpdir(), "fihrist-digest-"));
  directories.push(directory);
  vi.stubEnv("FIHRIST_DATA_DIR", directory);
  vi.resetModules();
  const db = await import("../db");
  const digest = await import("./rotDigest");
  await db.upsertUser({
    openId: "local-user",
    name: "Local User",
    email: "local@localhost",
    loginMethod: "local",
    role: "admin",
  });
  return { db, digest };
}

async function seedBookmark(db: Awaited<ReturnType<typeof openFixture>>["db"], seed: Seed) {
  const created = await db.createBookmark({
    userId: 1,
    collectionId: null,
    url: seed.url,
    normalizedUrl: seed.url,
    normalizedUrlHash: `hash-${seed.key}`,
    host: new URL(seed.url).hostname,
  });
  await db.updateBookmarkMetadata(1, created.id, { title: seed.title });
  return created;
}

// Each test opens a real SQLite database and applies every migration, which
// is slower than the default per-test budget allows on a loaded machine.
describe("two-run delta scenario", () => {
  it("reports only what changed between the two runs", async () => {
    const { db, digest } = await openFixture();

    const bookmarks = new Map<string, number>();
    for (const seed of LIBRARY) {
      const created = await seedBookmark(db, seed);
      bookmarks.set(seed.key, created.id);
    }

    // --- Run 1 -------------------------------------------------------------
    const runOne = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_ONE });
    await db.activateHealthRun(1, runOne.id, LIBRARY.length);
    for (const seed of LIBRARY) {
      await db.insertHealthCheck({
        userId: 1,
        bookmarkId: bookmarks.get(seed.key)!,
        runId: runOne.id,
        jobId: null,
        checkedAt: new Date(RUN_ONE.getTime() + 60_000),
        status: seed.status,
        httpStatus: seed.httpStatus,
        finalUrl: seed.finalUrl,
        durationMs: 100,
        error: seed.error,
      });
    }

    const factsOne = await digest.computeRunFacts(1, runOne);
    expect(factsOne.checked).toBe(LIBRARY.length);
    expect(factsOne.counts.newlyBroken).toBe(2);
    expect(factsOne.counts.newlySuspicious).toBe(1);
    expect(factsOne.counts.recovered).toBe(0);
    expect(factsOne.counts.stillBroken).toBe(0);
    expect(factsOne.counts.redirected).toBe(1);
    expect(factsOne.items.newlyBroken.map(entry => entry.title).sort()).toEqual([
      "Dead domain",
      "Removed page",
    ]);
    expect(factsOne.items.newlyBroken.find(entry => entry.title === "Removed page")?.httpStatus).toBe(404);
    // The plain-language sentence follows the recorded cause.
    expect(
      factsOne.items.newlyBroken.find(entry => entry.title === "Removed page")?.sentence.ar
    ).toBe("الصفحة اتشالت من الموقع");
    expect(
      factsOne.items.newlyBroken.find(entry => entry.title === "Dead domain")?.sentence.ar
    ).toBe("الموقع نفسه مش بيرد — غالبًا قفل أو اتنقل");
    // A link under review is never narrated as dead.
    expect(
      factsOne.items.newlySuspicious[0].sentence.ar
    ).toBe("الموقع منع الفحص الآلي — افتحه بنفسك واتأكد");

    // --- Run 2 -------------------------------------------------------------
    // One recovers, one stays broken, one new link breaks.
    const newBroken = await seedBookmark(db, {
      key: "new-dead",
      title: "New dead page",
      url: "https://example.com/new-dead",
      status: "broken",
      httpStatus: 410,
      finalUrl: "https://example.com/new-dead",
      error: "The page is gone (HTTP 410).",
    });

    const runTwo = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_TWO });
    await db.activateHealthRun(1, runTwo.id, LIBRARY.length + 1);
    const runTwoChecks: Seed[] = [
      LIBRARY[0],
      { ...LIBRARY[1], status: "healthy", httpStatus: 200, error: null },
      LIBRARY[2],
      LIBRARY[3],
      LIBRARY[4],
      {
        key: "new-dead",
        title: "New dead page",
        url: "https://example.com/new-dead",
        status: "broken",
        httpStatus: 410,
        finalUrl: "https://example.com/new-dead",
        error: "The page is gone (HTTP 410).",
      },
    ];
    for (const seed of runTwoChecks) {
      const bookmarkId =
        seed.key === "new-dead" ? newBroken.id : bookmarks.get(seed.key)!;
      await db.insertHealthCheck({
        userId: 1,
        bookmarkId,
        runId: runTwo.id,
        jobId: null,
        checkedAt: new Date(RUN_TWO.getTime() + 60_000),
        status: seed.status,
        httpStatus: seed.httpStatus,
        finalUrl: seed.finalUrl,
        durationMs: 100,
        error: seed.error,
      });
    }

    const factsTwo = await digest.computeRunFacts(1, runTwo);
    // The delta only — nothing is re-narrated from run 1.
    expect(factsTwo.counts.newlyBroken).toBe(1);
    expect(factsTwo.counts.newlyBroken).toBe(1);
    expect(factsTwo.items.newlyBroken.map(entry => entry.title)).toEqual(["New dead page"]);
    expect(factsTwo.counts.recovered).toBe(1);
    expect(factsTwo.items.recovered.map(entry => entry.title)).toEqual(["Removed page"]);
    expect(factsTwo.counts.stillBroken).toBe(1);
    expect(factsTwo.items.stillBroken.map(entry => entry.title)).toEqual(["Dead domain"]);
    // The still-broken link carries its streak.
    expect(factsTwo.items.stillBroken[0].streak).toBe(2);
    // A link that was already under review is not reported as newly suspicious.
    expect(factsTwo.counts.newlySuspicious).toBe(0);
    expect(factsTwo.counts.redirected).toBe(1);

    // --- The timeline agrees with the digest --------------------------------
    const timeline = await db.listBookmarkTimeline(1, bookmarks.get("dead")!);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].status).toBe("broken");
    expect(timeline[0].runId).toBe(runTwo.id);
    expect(timeline[1].status).toBe("broken");
    expect(timeline[1].runId).toBe(runOne.id);
  });

  it("hides a dismissed link until its next status transition", async () => {
    const { db, digest } = await openFixture();
    const created = await seedBookmark(db, LIBRARY[1]);
    const bookmarkId = created.id;

    const runOne = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_ONE });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: runOne.id,
      jobId: null,
      checkedAt: RUN_ONE,
      status: "broken",
      httpStatus: 404,
      finalUrl: null,
      durationMs: 100,
      error: "The page is gone (HTTP 404).",
    });
    expect((await digest.computeRunFacts(1, runOne)).counts.newlyBroken).toBe(1);

    // The owner dismisses it — after the first run, before the next one.
    await db.dismissHealthAlert(1, bookmarkId, new Date(RUN_ONE.getTime() + DAY));

    // The next run still finds it broken — but it stays hidden.
    const runTwo = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_TWO });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: runTwo.id,
      jobId: null,
      checkedAt: RUN_TWO,
      status: "broken",
      httpStatus: 404,
      finalUrl: null,
      durationMs: 100,
      error: "The page is gone (HTTP 404).",
    });
    const factsTwo = await digest.computeRunFacts(1, runTwo);
    expect(factsTwo.counts.newlyBroken).toBe(0);
    expect(factsTwo.counts.stillBroken).toBe(0);
    expect(factsTwo.counts.dismissed).toBe(1);

    // A status transition brings it back.
    const runThree = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_THREE });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId,
      runId: runThree.id,
      jobId: null,
      checkedAt: RUN_THREE,
      status: "healthy",
      httpStatus: 200,
      finalUrl: null,
      durationMs: 100,
      error: null,
    });
    const factsThree = await digest.computeRunFacts(1, runThree);
    expect(factsThree.counts.recovered).toBe(1);
  });

  it("measures a broken streak and when it started across runs", async () => {
    const { db, digest } = await openFixture();
    const created = await seedBookmark(db, LIBRARY[1]);
    const bookmarkId = created.id;

    // Three weekly runs, broken every time.
    const runs = [RUN_ONE, RUN_TWO, RUN_THREE];
    for (const [index, startedAt] of runs.entries()) {
      const run = await db.startHealthRun(1, { trigger: "weekly", startedAt });
      await db.insertHealthCheck({
        userId: 1,
        bookmarkId,
        runId: run.id,
        jobId: null,
        checkedAt: new Date(startedAt.getTime() + 60_000),
        status: "broken",
        httpStatus: 404,
        finalUrl: null,
        durationMs: 100,
        error: "The page is gone (HTTP 404).",
      });
      const facts = await digest.computeRunFacts(1, run);
      if (index === 0) {
        expect(facts.counts.newlyBroken).toBe(1);
        expect(facts.counts.stillBroken).toBe(0);
        expect(facts.items.newlyBroken[0].streak).toBe(1);
        expect(facts.items.newlyBroken[0].since).toBe(
          new Date(RUN_ONE.getTime() + 60_000).toISOString()
        );
      } else {
        expect(facts.counts.stillBroken).toBe(1);
        expect(facts.counts.newlyBroken).toBe(0);
        // The streak carries over and the spell started at the first break.
        expect(facts.items.stillBroken[0].streak).toBe(index + 1);
        expect(facts.items.stillBroken[0].since).toBe(
          new Date(RUN_ONE.getTime() + 60_000).toISOString()
        );
      }
    }
  });

  it("does not count a dismissal for a link that was never part of the report", async () => {
    const { db, digest } = await openFixture();
    const created = await seedBookmark(db, {
      ...LIBRARY[4],
      status: "needs_review",
      httpStatus: 403,
      error: "The site blocks automated checks (HTTP 403).",
    });

    // First run: the link needs review, so it is in the report.
    const runOne = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_ONE });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: created.id,
      runId: runOne.id,
      jobId: null,
      checkedAt: RUN_ONE,
      status: "needs_review",
      httpStatus: 403,
      finalUrl: null,
      durationMs: 100,
      error: "The site blocks automated checks (HTTP 403).",
    });
    const factsOne = await digest.computeRunFacts(1, runOne);
    expect(factsOne.counts.newlySuspicious).toBe(1);
    expect(factsOne.counts.dismissed).toBe(0);

    await db.dismissHealthAlert(1, created.id, new Date(RUN_ONE.getTime() + DAY));

    // Second run: the link is unchanged, so it is not in the report at all —
    // and a dismissal must not be counted for a link the owner never saw.
    const runTwo = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_TWO });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: created.id,
      runId: runTwo.id,
      jobId: null,
      checkedAt: RUN_TWO,
      status: "needs_review",
      httpStatus: 403,
      finalUrl: null,
      durationMs: 100,
      error: "The site blocks automated checks (HTTP 403).",
    });
    const factsTwo = await digest.computeRunFacts(1, runTwo);
    expect(factsTwo.counts.newlySuspicious).toBe(0);
    expect(factsTwo.counts.dismissed).toBe(0);
  });

  it("treats a run with no changes at all as all-clear", async () => {
    const { db, digest } = await openFixture();
    const created = await seedBookmark(db, LIBRARY[0]);

    const runOne = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_ONE });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: created.id,
      runId: runOne.id,
      jobId: null,
      checkedAt: RUN_ONE,
      status: "healthy",
      httpStatus: 200,
      finalUrl: null,
      durationMs: 100,
      error: null,
    });

    const runTwo = await db.startHealthRun(1, { trigger: "weekly", startedAt: RUN_TWO });
    await db.insertHealthCheck({
      userId: 1,
      bookmarkId: created.id,
      runId: runTwo.id,
      jobId: null,
      checkedAt: RUN_TWO,
      status: "healthy",
      httpStatus: 200,
      finalUrl: null,
      durationMs: 100,
      error: null,
    });

    const factsTwo = await digest.computeRunFacts(1, runTwo);
    expect(digest.factsHaveNoChanges(factsTwo)).toBe(true);
    expect(factsTwo.counts.newlyBroken).toBe(0);
    expect(factsTwo.counts.recovered).toBe(0);
    expect(factsTwo.counts.newlySuspicious).toBe(0);
    expect(factsTwo.counts.stillBroken).toBe(0);
  });
}, 20000);
