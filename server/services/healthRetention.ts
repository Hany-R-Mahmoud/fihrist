import { db } from "../data.js";
import { summarizeTimeline } from "./healthHistory.js";

const DAY=86_400_000;
function monthKey(date:Date) { return date.getUTCFullYear()+"-"+date.getUTCMonth(); }

/**
 * Retain the initial check, all state transitions, and each month's last
 * check. Before deleting old repeats, record their quantity and their
 * contribution to the current uninterrupted spell of checks.
 *
 * The rollup stores only counts which cannot be reconstructed from the
 * remaining rows. Every retained transition anchors its original date.
 */
export async function maintainHealthHistory(userId:number,now=new Date()) {
  const cutoff=new Date(now.getTime()-90*DAY);
  const candidate=await db.listOldHealthChecks(userId,cutoff,2000);
  const byBookmark=new Map<number,Set<number>>();
  for(const check of candidate){
    const ids=byBookmark.get(check.bookmarkId)??new Set<number>();
    ids.add(check.id);
    byBookmark.set(check.bookmarkId,ids);
  }
  let removed=0;
  for(const [bookmarkId,oldIds] of byBookmark){
    const all=await db.listChecksForBookmark(userId,bookmarkId);
    if(all.length<2)continue;
    const keep=new Set<number>([all[0].id]);
    const newestMonth=new Map<string,number>();
    for(let i=0;i<all.length;i++){
      newestMonth.set(monthKey(all[i].checkedAt),all[i].id);
      if(i>0 && all[i].status!==all[i-1].status)keep.add(all[i].id);
    }
    for(const id of newestMonth.values())keep.add(id);
    const doomed=new Set([...oldIds].filter(id=>!keep.has(id)));
    if(!doomed.size)continue;
    const existing=await db.getHealthRollup(userId,bookmarkId);
    const summary=summarizeTimeline(all);
    const current=all[all.length-1];
    const lastPruned=all.filter(c=>doomed.has(c.id)).at(-1)!;
    const freshContribution=all
      .filter(c=>doomed.has(c.id) && c.status===current.status &&
        summary.currentStatusSince && c.checkedAt>=summary.currentStatusSince).length;
    const sameSpell=existing?.lastPrunedStatus===current.status &&
      existing?.statusSince?.getTime()===summary.currentStatusSince?.getTime();
    await db.writeHealthRollup(userId,bookmarkId,{
      prunedCheckCount:(existing?.prunedCheckCount??0)+doomed.size,
      firstCheckedAt:existing?.firstCheckedAt??all[0].checkedAt,
      firstBrokenAt:existing?.firstBrokenAt??summary.firstBrokenAt,
      lastPrunedStatus:lastPruned.status,
      lastPrunedAt:lastPruned.checkedAt,
      statusSince:summary.currentStatusSince,
      openStreak:freshContribution+(sameSpell?(existing?.openStreak??0):0),
      brokenSince:current.status==="broken" ? summary.brokenSince : null
    });
    await db.deleteHealthChecksByIds(userId,[...doomed]);
    removed+=doomed.size;
  }
  return {removed,visited:byBookmark.size};
}
