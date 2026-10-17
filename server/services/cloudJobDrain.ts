import { db } from "../data";
import { processBookmarkJob } from "./jobProcessor";

/**
 * Small bounded drain for Vercel Functions.
 * When triggered after bookmark mutations, processing starts immediately.
 * Any missed jobs are picked up by the guarded daily Vercel Cron endpoint.
 * Claiming a job uses conditional updates + lease tokens in Neon.
 */
export async function drainCloudJobs(limit = 2) {
  if (process.env.FIHRIST_MODE !== "cloud") return {processed:0,completed:0,failed:0};
  const jobs = await db.listAvailableJobs(undefined,Math.max(1,Math.min(4,limit)));
  if(!jobs.length)return {processed:0,completed:0,failed:0};
  const results=await Promise.allSettled(jobs.map(job=>processBookmarkJob(job)));
  const users = new Set(jobs.map(j=>j.userId));
  // A failed check is terminal for this run. Make progress available in the UI.
  await Promise.allSettled(Array.from(users).map(uid=>db.completeHealthRunIfDrained(uid)));
  let completed=0,failed=0;
  for(const r of results){
    if(r.status==="fulfilled" && r.value.status==="completed")completed++;
    if(r.status==="rejected"||(r.status==="fulfilled"&&r.value.status==="failed"))failed++;
  }
  return {processed:results.length,completed,failed};
}
