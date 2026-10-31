import { db } from "../data.js";
import { onHealthRunCompleted } from "./rotDigest.js";
import { processBookmarkJob } from "./jobProcessor.js";
import { randomUUID } from "node:crypto";

/**
 * Small bounded drain for Vercel Functions.
 * When triggered after bookmark mutations, processing starts immediately.
 * Missed jobs wait for another explicit user request; no cron drains them.
 * Claiming a job uses conditional updates + lease tokens in Neon.
 */
export async function drainCloudJobs(limit = 2, userId?: number, type?: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh") {
  // Serialize batches for an account across tabs and function instances.
  // This reserved key cannot be a public hostname used by a page check.
  const batchKey = userId === undefined ? null : `fihrist:user-batch:${userId}`;
  const batchToken = randomUUID();
  if (batchKey && !(await db.acquireDomainSlot(batchKey, batchToken))) {
    return { processed: 0, completed: 0, failed: 0 };
  }
  try {
  const jobs = await db.listAvailableJobs(
    type,
    Math.max(1, Math.min(4, limit)),
    userId
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
  } finally {
    if (batchKey) await db.releaseDomainSlot(batchKey, batchToken);
  }
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
    // Deferred same-domain jobs must not spin hot while their host lease is busy.
    if(result.completed===0 && result.failed===0) {
      await new Promise(resolve => setTimeout(resolve,1000));
    }
  }
  return totals;
}
