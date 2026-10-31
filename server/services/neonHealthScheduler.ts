import { db } from "../data.js";
import { openHealthRun, queueHealthChecksForUser } from "./jobProcessor.js";
import { drainCloudJobsTimed } from "./cloudJobDrain.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Deliberately opt-in, independent of the user's per-library enabled setting. */
export function cloudWeeklyHealthEnabled(env: NodeJS.ProcessEnv = process.env) {
  // Scheduled checks are retired. Old environment flags cannot re-enable them.
  return false;
}

/**
 * Only a Neon Function Trigger calls this: NEVER attach it to a frontend
 * request or the Vercel daily fallback cron. Runs idempotently with the
 * unique open-weekly-run DB index and the job queue's existing leases.
 */
export async function ensureCloudWeeklySweeps(now: Date = new Date()) {
  if (process.env.FIHRIST_MODE !== "cloud" || !cloudWeeklyHealthEnabled()) {
    return { scannedUsers: 0, openedRuns: 0, queuedJobs: 0 };
  }
  const users = await db.listWeeklyHealthUsers();
  let openedRuns = 0;
  let queuedJobs = 0;
  for (const userId of users) {
    const settings = await db.ensureHealthSettings(userId);
    if (!settings.enabled) continue;
    const current = await db.listRunningHealthRuns(userId);
    // A previous Neon invocation may have stopped while adding jobs.
    // Resume its open (not yet activated) run first, without creating
    // duplicate jobs for links already processed under that runId.
    const interrupted=current.find(r=>r.trigger==="weekly" && r.total===0);
    if(interrupted) {
      const added=await queueHealthChecksForUser(userId,interrupted.id);
      const total=await db.countJobsForRun(userId,interrupted.id);
      if(total>0) {
        await db.activateHealthRun(userId,interrupted.id,total);
        await db.updateHealthSettings(userId,{lastRunAt:now});
        queuedJobs+=added;
      } else {
        await db.deleteHealthRun(userId,interrupted.id);
      }
      continue;
    }
    // Do not overlap another sweep or a single-bookmark/manual run.
    if (current.length) continue;
    const completed = await db.latestCompletedWeeklyHealthRun(userId);
    if (completed?.completedAt && now.getTime() - completed.completedAt.getTime() < WEEK_MS) {
      continue;
    }
    // A stale queue from a formerly interrupted sweep must finish before
    // opening a new one; no duplicate checks, no duplicate digests.
    if ((await db.countPendingJobsForUser(userId, "health_check")) > 0) continue;
    const { run, reused } = await openHealthRun(userId, "weekly", now);
    if (reused) continue;
    // Enqueue the full user's library; an open run will be resumed next tick
    // if the function is interrupted during ingestion.
    const queued = await queueHealthChecksForUser(userId, run.id);
    if (queued) {
      const total=await db.countJobsForRun(userId,run.id);
      await db.activateHealthRun(userId, run.id, total);
      await db.updateHealthSettings(userId, { lastRunAt: now });
      queuedJobs += queued;
      openedRuns += 1;
    } else {
      await db.deleteHealthRun(userId, run.id);
    }
  }
  return { scannedUsers: users.length, openedRuns, queuedJobs };
}

export function neonDrainBudgetMs(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number(env.FIHRIST_NEON_DRAIN_BUDGET_MS);
  return Number.isFinite(raw) && raw >= 60_000
    ? Math.min(600_000, Math.floor(raw))
    : 240_000;
}

export async function runNeonHealthTick() {
  if (process.env.FIHRIST_MODE !== "cloud" || !cloudWeeklyHealthEnabled()) {
    return { enabled: false, scheduled: { scannedUsers: 0, openedRuns: 0, queuedJobs: 0 } };
  }
  const started = Date.now();
  const budgetMs = neonDrainBudgetMs();
  // Both enqueue and drain count against the same bounded invocation budget.
  const scheduled = await ensureCloudWeeklySweeps();
  const elapsed = Date.now() - started;
  const remaining = Math.max(0, budgetMs - elapsed);
  const drain = await drainCloudJobsTimed(remaining);
  return { scheduled, drain, elapsedMs: Date.now() - started };
}
