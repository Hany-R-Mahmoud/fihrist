import { db } from "../data.js";
import { backupLocalDatabase, localDataDirectory } from "../_core/localDatabase.js";
import { authenticateLocalUser } from "../_core/localAuth.js";
import { openHealthRun, processBookmarkJob, queueHealthChecksForUser } from "./jobProcessor.js";
import { onHealthRunCompleted } from "./rotDigest.js";
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const LOCAL_USER_ID = 1;
const POLL_INTERVAL_MS = 1_000;
const HEALTH_INTERVAL_MS = 60 * 60 * 1_000;
const BATCH_SIZE = 60;
const CONCURRENCY = 4;

async function drainJobs() {
  const jobs = await db.listAvailableJobs(undefined, BATCH_SIZE);
  if (!jobs.length) return;
  const queue = jobs.slice();
  const processNext = async () => {
    while (queue.length) {
      const job = queue.shift();
      if (job) await processBookmarkJob(job);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, processNext));
}

async function queueWeeklyHealth() {
  const settings = await db.ensureHealthSettings(LOCAL_USER_ID);
  if (!settings.enabled) return;
  const due = !settings.lastRunAt || Date.now() - settings.lastRunAt.getTime() >= 7 * 24 * 60 * 60 * 1_000;
  if (!due || (await db.countPendingJobsForUser(LOCAL_USER_ID, "health_check")) > 0) return;
  const startedAt = new Date();
  const { run, reused } = await openHealthRun(LOCAL_USER_ID, "weekly", startedAt);
  const queuedCount = await queueHealthChecksForUser(LOCAL_USER_ID, run.id);
  if (queuedCount > 0) {
    await db.updateHealthSettings(LOCAL_USER_ID, { lastRunAt: new Date() });
    await db.activateHealthRun(LOCAL_USER_ID, run.id, (run.total ?? 0) + queuedCount);
  } else if (!reused) {
    // Nothing was queued — drop the run so the progress banner stays honest.
    await db.deleteHealthRun(LOCAL_USER_ID, run.id);
  }
}

async function backupCurrentLocalDatabase() {
  const backupDirectory = join(localDataDirectory(), "backups");
  const date = new Date().toISOString().slice(0, 10);
  await backupLocalDatabase(await db.getDb(), join(backupDirectory, `fihrist-${date}.sqlite`));
  const backups = readdirSync(backupDirectory)
    .filter(name => /^fihrist-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
    .sort()
    .reverse();
  for (const staleBackup of backups.slice(7)) unlinkSync(join(backupDirectory, staleBackup));
}

export function startLocalJobRunner() {
  const controller = new AbortController();
  void authenticateLocalUser()
    .then(async () => {
      await backupCurrentLocalDatabase();
      await db.recoverProcessingJobs();
    })
    .then(() => queueWeeklyHealth())
    .catch(error => console.error("[Fihrist] Local runtime startup failed", error));
  void (async () => {
    while (!controller.signal.aborted) {
      try {
        // A single bad tick must never kill the runner — that was a historic
        // cause of "validation stops partway" with no visible error.
        await drainJobs();
        const completed = await db.completeDrainedHealthRuns(LOCAL_USER_ID);
        for (const run of completed) {
          await onHealthRunCompleted(LOCAL_USER_ID, run);
        }
      } catch (error) {
        console.error("[Fihrist] Job drain tick failed, continuing", error);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  })().catch(error => console.error("[Fihrist] Job runner loop died", error));
  const healthTimer = setInterval(() => void queueWeeklyHealth().catch(console.error), HEALTH_INTERVAL_MS);
  return () => {
    controller.abort();
    clearInterval(healthTimer);
  };
}
