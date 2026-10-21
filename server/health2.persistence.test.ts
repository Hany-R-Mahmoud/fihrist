import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import { normalizeBookmarkUrl } from "./services/bookmarkUtils";

const directories:string[]=[];
afterEach(()=>{
  vi.unstubAllEnvs();
  for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});
});

async function fixture() {
  const dir=mkdtempSync(join(tmpdir(),"fihrist-health2-"));
  directories.push(dir);
  vi.stubEnv("FIHRIST_DATA_DIR",dir);
  vi.stubEnv("FIHRIST_MODE","local");
  vi.resetModules();
  const db=await import("./db");
  await db.upsertUser({
    openId:"local-user",name:"Local User",email:"local@localhost",
    loginMethod:"local",role:"admin"
  });
  return db;
}
async function seed(db:Awaited<ReturnType<typeof fixture>>,path:string,collectionId:number|null=null) {
  return db.createBookmark({userId:1,collectionId,...normalizeBookmarkUrl("https://example.org/"+path)});
}
function entry(bookmarkId:number,checkedAt:Date,status:"broken"|"healthy"){
  return {userId:1,bookmarkId,runId:null,jobId:null,checkedAt,
    status,httpStatus:status==="broken"?404:200,finalUrl:"https://example.org/",
    durationMs:120,error:null};
}

describe("Health Engine v2 SQLite integration, migrations, owner isolation",()=>{
  it("stores evidence and per-link controls without changing collection membership",async()=>{
    const db=await fixture();
    const c=await db.createCollection(1,"Original");
    const b=await seed(db,"news/article",c.id);
    await db.updateBookmarkControls(1,b.id,{checksDisabled:true,healthNote:"Browser works"});
    const changed=await db.getBookmark(1,b.id);
    expect(changed?.collectionId).toBe(c.id);
    expect(changed?.checksDisabled).toBe(true);
    expect(changed?.healthNote).toBe("Browser works");
    await db.insertHealthCheck({...entry(b.id,new Date(),"healthy"),
      failureClass:"none",moveClass:"relocation",bodyHash:"a".repeat(64),
      redirectChain:JSON.stringify([{u:"https://example.org/a",s:301}]),
      titleSnapshot:"Moved page",finalHost:"example.org",contentLength:200,
    });
    const check=(await db.listBookmarkTimeline(1,b.id))[0];
    expect(check.moveClass).toBe("relocation");
    expect(check.finalHost).toBe("example.org");
    expect(check.redirectChain).toContain("301");
  },20000);

  it("serializes cloud host leases with end-to-start 750 ms spacing",async()=>{
    const db=await fixture();
    const host="safe.example";
    const at=new Date();
    expect(await db.acquireDomainSlot(host,"lease-1",at)).toBe(true);
    expect(await db.acquireDomainSlot(host,"lease-2",at)).toBe(false);
    await db.releaseDomainSlot(host,"lease-1");
    expect(await db.acquireDomainSlot(host,"lease-3",new Date())).toBe(false);
    expect(await db.acquireDomainSlot(host,"lease-4",new Date(Date.now()+1000))).toBe(true);
    await db.releaseDomainSlot(host,"lease-4");
  },20000);

  it("creates shelves, respects item dismissal after recompute and preserves collection",async()=>{
    const db=await fixture();
    const a=await db.createCollection(1,"Original A");
    const b=await db.createCollection(1,"Original B");
    const items=await Promise.all([
      seed(db,"finance/1",a.id),seed(db,"finance/2",b.id),seed(db,"finance/3",a.id)
    ]);
    const { refreshTopicShelves,listTopicShelves }=await import("./services/topicShelves");
    await refreshTopicShelves(1);
    const shelf=(await listTopicShelves(1)).find(s=>s.normalizedName==="topic:host:example.org");
    expect(shelf?.bookmarks.map(b=>b.id).sort()).toEqual(items.map(b=>b.id).sort());
    expect(shelf).toBeDefined();
    if(!shelf)throw new Error("fixture shelf not found");
    await db.dismissTopic(1,shelf.normalizedName,items[0].id);
    await refreshTopicShelves(1);
    const after=(await listTopicShelves(1)).find(s=>s.normalizedName===shelf.normalizedName);
    expect(after?.bookmarks.some(x=>x.id===items[0].id)).toBe(false);
    const filtered=await db.listBookmarkPage(1,{topicTagId:shelf.id});
    expect(filtered.items).toHaveLength(2);
    expect((await db.getBookmark(1,items[0].id))?.collectionId).toBe(a.id);
    expect((await db.getBookmark(1,items[1].id))?.collectionId).toBe(b.id);
    expect((await db.getBookmark(1,items[2].id))?.collectionId).toBe(a.id);
  },20000);

  it("preserves long broken streak and total check count across compaction",async()=>{
    const db=await fixture();const bookmark=await seed(db,"gone");
    const dates=[
      new Date("2026-01-01T12:00:00Z"),new Date("2026-01-02T12:00:00Z"),
      new Date("2026-01-03T12:00:00Z"),new Date("2026-01-04T12:00:00Z"),
      new Date("2026-01-05T12:00:00Z"),new Date("2026-10-20T12:00:00Z")
    ];
    for(const date of dates)await db.insertHealthCheck(entry(bookmark.id,date,"broken"));
    const {maintainHealthHistory}=await import("./services/healthRetention");
    const before=await db.listChecksForBookmark(1,bookmark.id);
    const result=await maintainHealthHistory(1,new Date("2026-10-22T12:00:00Z"));
    expect(result.removed).toBe(3);
    const rows=await db.listChecksForBookmark(1,bookmark.id);
    const rollup=await db.getHealthRollup(1,bookmark.id);
    const {summarizeTimeline}=await import("./services/healthHistory");
    const summary=summarizeTimeline(rows,rollup??undefined);
    expect(summary.totalChecks).toBe(before.length);
    expect(summary.brokenStreak).toBe(before.length);
    expect(summary.brokenSince).toEqual(dates[0]);
    expect(rollup?.prunedCheckCount).toBe(3);
  },20000);
});
