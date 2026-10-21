import { db } from "../data.js";
import { summarizeTimeline } from "./healthHistory.js";

const DAY=86_400_000;
function monthKey(date:Date) { return date.getUTCFullYear()+"-"+date.getUTCMonth(); }

/**
 * Roll up BEFORE pruning. Keep every transition, the first ever check,
 * and the newest check in every calendar month.
 * Local and cloud share this policy; no external I/O.
 */
export async function maintainHealthHistory(userId:number,now=new Date()) {
  const cutoff=new Date(now.getTime()-90*DAY);
  const candidate=await db.listOldHealthChecks(userId,cutoff,2000);
  const byBookmark=new Map<number,number[]>();
  for(const check of candidate){
    byBookmark.set(check.bookmarkId,[...(byBookmark.get(check.bookmarkId)??[]),check.id]);
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
    const doomed=new Set(oldIds.filter(id=>!keep.has(id)));
    if(!doomed.size)continue;
    const oldRollup=await db.getHealthRollup(userId,bookmarkId);
    const remaining=all.filter(row=>!doomed.has(row.id));
    const current=all[all.length-1];
    const sameRun=(rows:typeof all)=>{
      let count=0;
      for(let i=rows.length-1;i>=0 && rows[i].status===current.status;i--)count++;
      return count;
    };
    const before=sameRun(all);
    const after=sameRun(remaining);
    const oldMissing=oldRollup?.lastPrunedStatus===current.status ? oldRollup.openStreak : 0;
    const summary=summarizeTimeline(all);
    await db.writeHealthRollup(userId,bookmarkId,{
      prunedCheckCount:(oldRollup?.prunedCheckCount??0)+doomed.size,
      firstCheckedAt:oldRollup?.firstCheckedAt??all[0].checkedAt,
      firstBrokenAt:oldRollup?.firstBrokenAt??summary.firstBrokenAt,
      lastPrunedStatus:current.status,
      lastPrunedAt:current.checkedAt,
      statusSince:oldRollup?.lastPrunedStatus===current.status ?
        (oldRollup.statusSince??summary.currentStatusSince):summary.currentStatusSince,
      openStreak:oldMissing+Math.max(0,before-after),
      brokenSince:current.status==="broken" ?
        oldRollup?.brokenSince??summary.brokenSince : null,
    });
    await db.deleteHealthChecksByIds(userId,[...doomed]);
    removed+=doomed.size;
  }
  return {removed,visited:byBookmark.size};
}
