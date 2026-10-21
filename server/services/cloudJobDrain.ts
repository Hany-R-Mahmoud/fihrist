import { db } from "../data.js";
import { onHealthRunCompleted } from "./rotDigest.js";
import { processBookmarkJob } from "./jobProcessor.js";

/**
 * Small bounded drain for Vercel Functions.
 * When triggered after bookmark mutations, processing starts immediately.
 * Any missed jobs are picked up by the guarded daily Vercel Cron endpoint.
 * Claiming a job uses conditional updates + lease tokens in Neon.
 */
export async function drainCloudJobs(limit = 2) {
  if (process.env.FIHRIST_MODE !== "cloud")
    return { processed: 0, completed: 0, failed: 0 };
  const jobs = await db.listAvailableJobs(
    undefined,
    Math.max(1, Math.min(4, limit))
  );
  if (!jobs.length) return { processed: 0, completed: 0, failed: 0 };
  const results = await Promise.allSettled(
    jobs.map(job => processBookmarkJob(job))
  );
  const users = new Set(jobs.map(j => j.userId));
  // A failed check is terminal for this run. Make progress available in the UI.
  await Promise.allSettled(
    Array.from(users).map(async uid => {
      const runs = await db.completeDrainedHealthRuns(uid);
      for (const run of runs) if (run) await onHealthRunCompleted(uid, run);
    })
  );
  let completed = 0,
    failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.status === "completed") completed++;
    if (
      r.status === "rejected" ||
      (r.status === "fulfilled" && r.value.status === "failed")
    )
      failed++;
  }
  return { processed: results.length, completed, failed };
}

/**
 * Bounded, repeatable Neon scheduled drain. A fresh batch is fetched only
 * while time remains for a full check, respecting four concurrent workers.
 * Expired processing-job leases are recovered by listAvailableJobs.
 *
 * Crucially, this is deliberately NOT reachable while the production flag
 * is off. 500-link throughput and DB host pacing must be validated before
 * enabling the schedule.
 */
export async function drainCloudJobsTimed(budgetMs: number) {
  if (process.env.FIHRIST_MODE !== "cloud" || budgetMs < 20_000) {
    return { processed: 0, completed: 0, failed: 0, batches: 0 };
  }
  const deadline = Date.now() + Math.min(600_000, budgetMs);
  const totals = { processed: 0, completed: 0, failed: 0, batches: 0 };
  while (Date.now() + 20_000 < deadline) {
    const result = await drainCloudJobs(4);
    totals.processed += result.processed;
    totals.completed += result.completed;
    totals.failed += result.failed;
    if (result.processed === 0) break;
    totals.batches += 1;
  }
  return totals;
}
