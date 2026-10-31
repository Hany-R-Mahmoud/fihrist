import { db } from "../data.js";
import { backupLocalDatabase, localDataDirectory } from "../_core/localDatabase.js";
import { authenticateLocalUser } from "../_core/localAuth.js";
import { processBookmarkJob } from "./jobProcessor.js";
import { onHealthRunCompleted } from "./rotDigest.js";
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const LOCAL_USER_ID = 1;
const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 60;
const CONCURRENCY = 4;

async function drainJobs() {
  const jobs = await db.listAvailableJobs("scrape", BATCH_SIZE);
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
  return () => {
    controller.abort();
  };
}
