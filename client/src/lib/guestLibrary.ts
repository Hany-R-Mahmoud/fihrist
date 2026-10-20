/**
 * Fihrist guest library. This adapter runs entirely in the browser.
 * It never sends bookmarks, imported files, notes or tags to the server.
 * Account data and the guest store are always separate.
 */
import { observable } from "@trpc/server/observable";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";

const GUEST_KEY = "fihrist:guest-mode:v1";
const DB_NAME = "fihrist-private-guest-v1";
const STORE = "workspace";
const STATE_KEY = "library";

export const isGuestMode = () => typeof window !== "undefined" && window.localStorage.getItem(GUEST_KEY) === "1";
export function enterGuestMode() {
  window.localStorage.setItem(GUEST_KEY, "1");
  window.location.assign("/library");
}
export function leaveGuestMode() {
  window.localStorage.removeItem(GUEST_KEY);
}

type Collection = { id: number; userId: number; name: string; createdAt: Date; updatedAt: Date };
type Tag = { id: number; name: string; normalizedName: string };
type BookmarkTag = { id: number; name: string; source: "automatic" | "manual" | "ai" };
type GuestBookmark = {
  id: number; userId: number; collectionId: number | null;
  url: string; normalizedUrl: string; normalizedUrlHash: string; host: string;
  title: string | null; description: string | null; faviconUrl: string | null;
  imageUrl: string | null; notes: string | null; contentText: string | null;
  language: string | null; contentDirection: "ltr" | "rtl";
  analysisSummary: string | null; savedReason: string | null; savingBenefit: string | null;
  analysisStatus: "pending" | "processing" | "ready" | "failed";
  analysisError: string | null; analyzedAt: Date | null;
  ingestionStatus: "pending" | "processing" | "ready" | "failed";
  scrapeError: string | null; healthStatus: "unchecked" | "healthy" | "redirected" | "broken" | "needs_review";
  httpStatus: number | null; lastCheckedAt: Date | null; healthError: string | null;
  createdAt: Date; updatedAt: Date;
  tags: BookmarkTag[];
};
type State = { lastId: number; collections: Collection[]; bookmarks: GuestBookmark[]; tags: Tag[]; weeklyChecks: boolean };
type Input = Record<string, unknown>;
const empty = (): State => ({lastId: 0, collections: [], bookmarks: [], tags: [], weeklyChecks: false});

function openGuestStore(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Browser storage is unavailable. Enable site storage to use Guest Mode."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open your local guest library."));
    request.onblocked = () => reject(new Error("Local guest library is busy in another tab."));
  });
}

async function readState(): Promise<State> {
  const db = await openGuestStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const query = tx.objectStore(STORE).get(STATE_KEY);
      query.onsuccess = () => resolve((query.result as State | undefined) ?? empty());
      query.onerror = () => reject(query.error);
    });
  } finally { db.close(); }
}

async function writeState<T>(change: (state: State) => T): Promise<T> {
  const db = await openGuestStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const get = store.get(STATE_KEY);
      let output: T;
      get.onsuccess = () => {
        try {
          const state: State = get.result ?? empty();
          output = change(state);
          store.put(state, STATE_KEY);
        } catch (error) { tx.abort(); reject(error); }
      };
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => resolve(output);
      tx.onerror = () => reject(tx.error ?? new Error("Unable to save guest changes."));
      tx.onabort = () => reject(tx.error ?? new Error("Unable to save guest changes."));
    });
  } finally {db.close();}
}

function value(input: unknown): Input { return (input && typeof input === "object" ? input : {}) as Input; }
function num(x: unknown) { const v = Number(x); return Number.isSafeInteger(v) ? v : 0; }
function requiredBookmark(state: State, id: unknown) {
  const bookmark = state.bookmarks.find(item => item.id === num(id));
  if (!bookmark) throw new Error("Bookmark not found in guest library.");
  return bookmark;
}
function requiredCollection(state: State, id: unknown) {
  const collection = state.collections.find(item => item.id === num(id));
  if (!collection) throw new Error("Collection not found in guest library.");
  return collection;
}
function normalizeUrl(raw: string) {
  if (!raw || raw.length > 2048) throw new Error("Please enter a URL under 2048 characters.");
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("Please enter a complete http:// or https:// URL."); }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) {
    throw new Error("Only public HTTP or HTTPS URLs without embedded credentials are supported.");
  }
  u.hash = "";
  return { url: raw.trim(), normalizedUrl: u.toString(), normalizedUrlHash: u.toString(), host: u.hostname.toLowerCase() };
}
function buildBookmark(raw: string, id: number, collectionId: number | null): GuestBookmark {
  const url = normalizeUrl(raw);
  const now = new Date();
  return {
    id, userId: 1, collectionId, ...url,
    title: url.host, description: null, faviconUrl: null, imageUrl: null, notes: null,
    contentText: null, language: null, contentDirection: "ltr",
    analysisSummary: null, savedReason: null, savingBenefit: null,
    analysisStatus: "pending", analysisError: null, analyzedAt: null,
    ingestionStatus: "ready", scrapeError: null, healthStatus: "unchecked",
    httpStatus: null, lastCheckedAt: null, healthError: null, createdAt: now, updatedAt: now, tags: [],
  };
}
function hydrate(state: State, bookmark: GuestBookmark) {
  return {...bookmark, collectionName: state.collections.find(c => c.id === bookmark.collectionId)?.name ?? null};
}
function filtered(state: State, input: Input, search?: string) {
  let items = [...state.bookmarks];
  if (input.collectionId != null) items = items.filter(b => b.collectionId === num(input.collectionId));
  if (typeof input.healthStatus === "string") items = items.filter(b => b.healthStatus === input.healthStatus);
  if (search?.trim()) {
    const terms = search.toLocaleLowerCase().trim().split(/\s+/);
    items = items.filter(b => terms.every(term =>
      [b.url,b.title,b.description,b.notes,b.host,...b.tags.map(t=>t.name)]
        .some(str => str?.toLocaleLowerCase().includes(term))));
  }
  items.sort((a,b) => b.createdAt.getTime()-a.createdAt.getTime() || b.id-a.id);
  const offset = Math.max(0,num(input.cursor));
  const limit = Math.max(1,Math.min(50,num(input.limit)||50));
  const page = items.slice(offset,offset+limit);
  return {items:page.map(b=>hydrate(state,b)),nextCursor:offset+limit<items.length?String(offset+limit):null,totalCount:items.length};
}
function getHealthCounts(state: State) {
  const counts={unchecked:0,healthy:0,redirected:0,broken:0,needs_review:0};
  for(const item of state.bookmarks) counts[item.healthStatus] += 1;
  return counts;
}
function htmlEscape(input: string) {return input.replace(/[&<>"']/g, x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]!));}
function exportHtml(state: State) {
  const groups = new Map<string,GuestBookmark[]>();
  for(const b of state.bookmarks){const name=state.collections.find(c=>c.id===b.collectionId)?.name??"";groups.set(name,[...(groups.get(name)??[]),b]);}
  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Fihrist Guest Bookmarks</TITLE>\n<H1>Fihrist Guest Bookmarks</H1>\n<DL><p>\n';
  for(const [name,group] of Array.from(groups.entries())){
    if(name)html+=`<DT><H3>${htmlEscape(name)}</H3>\n<DL><p>\n`;
    for(const b of group)html+=`<DT><A HREF="${htmlEscape(b.url)}" ADD_DATE="${Math.floor(new Date(b.createdAt).getTime()/1000)}">${htmlEscape(b.title||b.url)}</A>\n`;
    if(name)html+="</DL><p>\n";
  }
  return html+"</DL><p>\n";
}
function parseImport(html: string) {
  if(html.length>2_000_000)throw new Error("Bookmark file must be under 2MB.");
  const dom=new DOMParser().parseFromString(html,"text/html");
  const anchors=Array.from(dom.querySelectorAll("a[href]")).slice(0,1000);
  const entries:{url:string,title:string|null,folder:string}[]=[];
  for(const anchor of anchors){
    try{
      const u=normalizeUrl(anchor.getAttribute("href")||"");
      const parents:string[]=[];
      let el:Element|null=anchor.parentElement;
      while(el && el!==dom.body){
        if(el.tagName==="DL"){
          const previous=el.previousElementSibling;
          if(previous?.tagName==="DT"){
            const heading=previous.querySelector("h3");
            if(heading?.textContent?.trim())parents.unshift(heading.textContent.trim());
          }
        }
        el=el.parentElement;
      }
      entries.push({url:u.url,title:anchor.textContent?.trim().slice(0,512)||null,folder:parents.join(" / ").slice(0,160)});
    }catch{/* invalid bookmark schemes are ignored */}
  }
  return entries;
}
function addTag(state:State, bookmark:GuestBookmark, raw:string,source:"automatic"|"manual"|"ai"="manual"){
 const name=raw.trim();if(name.length<2||name.length>96)throw new Error("A tag needs 2 to 96 characters.");
 const key=name.toLocaleLowerCase();
 let tag=state.tags.find(t=>t.normalizedName===key);
 if(!tag){tag={id:++state.lastId,name,normalizedName:key};state.tags.push(tag);}
 if(!bookmark.tags.some(t=>t.id===tag!.id))bookmark.tags.push({id:tag.id,name:tag.name,source});
 bookmark.updatedAt=new Date();
 return hydrate(state,bookmark);
}
const guestUser=()=>{const now=new Date();return {id:1,openId:"guest-local",name:"Guest",email:null,role:"user",loginMethod:"guest",createdAt:now,updatedAt:now,lastSignedIn:now};};

export async function guestOperation(path:string, raw?:unknown):Promise<unknown>{
 const input=value(raw);
 if(path==="auth.me") return guestUser();
 if(path==="collections.list") return (await readState()).collections.sort((a,b)=>a.name.localeCompare(b.name));
 if(path==="collections.create") return writeState(s=>{
   const name=String(input.name??"").trim();
   if(!name||name.length>160||s.collections.some(c=>c.name.toLowerCase()===name.toLowerCase()))throw new Error("Invalid or duplicate collection name.");
   const now=new Date();const c={id:++s.lastId,userId:1,name,createdAt:now,updatedAt:now};s.collections.push(c);return c;
 });
 if(path==="collections.rename")return writeState(s=>{const c=requiredCollection(s,input.id);c.name=String(input.name??"").trim();c.updatedAt=new Date();return c;});
 if(path==="collections.remove")return writeState(s=>{requiredCollection(s,input.id);s.collections=s.collections.filter(c=>c.id!==num(input.id));s.bookmarks.forEach(b=>{if(b.collectionId===num(input.id))b.collectionId=null;});return {success:true};});
 if(path==="bookmarks.list")return filtered(await readState(),input);
 if(path==="bookmarks.search")return filtered(await readState(),input,String(input.query??""));
 if(path==="bookmarks.add")return writeState(s=>{
   const u=normalizeUrl(String(input.url??""));
   if(s.bookmarks.some(b=>b.normalizedUrl===u.normalizedUrl))throw new Error("That URL is already in your guest library.");
   const id=input.collectionId==null?null:requiredCollection(s,input.collectionId).id;
   const b=buildBookmark(u.url,++s.lastId,id);s.bookmarks.push(b);return hydrate(s,b);
 });
 if(path==="bookmarks.updateNotes")return writeState(s=>{const b=requiredBookmark(s,input.id);b.notes=typeof input.notes==="string"?input.notes:null;b.updatedAt=new Date();return hydrate(s,b);});
 if(path==="bookmarks.move")return writeState(s=>{const b=requiredBookmark(s,input.id);b.collectionId=input.collectionId==null?null:requiredCollection(s,input.collectionId).id;b.updatedAt=new Date();return hydrate(s,b);});
 if(path==="bookmarks.bulkMove")return writeState(s=>{
   const ids=new Set(Array.isArray(input.ids)?input.ids.map(num):[]);
   const collectionId=input.collectionId==null?null:requiredCollection(s,input.collectionId).id;
   let updatedCount=0;for(const b of s.bookmarks)if(ids.has(b.id)){b.collectionId=collectionId;b.updatedAt=new Date();updatedCount++;}
   return {updatedCount};
 });
 if(path==="bookmarks.remove")return writeState(s=>{requiredBookmark(s,input.id);s.bookmarks=s.bookmarks.filter(b=>b.id!==num(input.id));return {success:true};});
 if(path==="bookmarks.bulkRemove")return writeState(s=>{const ids=new Set(Array.isArray(input.ids)?input.ids.map(num):[]);const old=s.bookmarks.length;s.bookmarks=s.bookmarks.filter(b=>!ids.has(b.id));return {deletedCount:old-s.bookmarks.length};});
 if(path==="bookmarks.addTag")return writeState(s=>addTag(s,requiredBookmark(s,input.id),String(input.name??"")));
 if(path==="bookmarks.bulkAddTag")return writeState(s=>{const ids=new Set(Array.isArray(input.ids)?input.ids.map(num):[]);let updatedCount=0;for(const b of s.bookmarks)if(ids.has(b.id)){addTag(s,b,String(input.name??""));updatedCount++;}return {updatedCount};});
 if(path==="bookmarks.removeTag")return writeState(s=>{const b=requiredBookmark(s,input.id);b.tags=b.tags.filter(t=>t.id!==num(input.tagId));b.updatedAt=new Date();return hydrate(s,b);});
 if(path==="bookmarks.exportNetscape")return {fileName:"fihrist-guest-bookmarks.html",html:exportHtml(await readState())};
 if(path==="bookmarks.importNetscape"){
   const parsed=parseImport(String(input.html??""));if(!parsed.length)throw new Error("No valid HTTP or HTTPS bookmarks found.");
   return writeState(s=>{
     let importedCount=0,skippedCount=0,uncategorizedCount=0;const collections=new Set<number>();
     for(const item of parsed){
       const u=normalizeUrl(item.url);
       if(s.bookmarks.some(b=>b.normalizedUrl===u.normalizedUrl)){skippedCount++;continue;}
       let collectionId:number|null=null;
       if(item.folder){
         let c=s.collections.find(c=>c.name.toLowerCase()===item.folder.toLowerCase());
         if(!c){const now=new Date();c={id:++s.lastId,userId:1,name:item.folder,createdAt:now,updatedAt:now};s.collections.push(c);}
         collectionId=c.id;collections.add(c.id);
       }else uncategorizedCount++;
       const b=buildBookmark(u.url,++s.lastId,collectionId);b.title=item.title||b.title;s.bookmarks.push(b);importedCount++;
     }
     return {importedCount,skippedCount,uncategorizedCount,collectionCount:collections.size};
   });
 }
 if(path==="bookmarks.queueStatus")return {pending:0,processing:0,failed:0};
 if(path==="bookmarks.aiStatus")return {configured:false};
 if(path==="bookmarks.aiTagSuggestions")return [];
 if(path==="bookmarks.retryFailed")return 0;
 if(path==="bookmarks.analyze"||path==="bookmarks.suggestAiTags"||path==="bookmarks.approveAiTag"||path==="bookmarks.rejectAiTag")throw new Error("AI features require a signed-in account and a configured cloud service.");
 if(path==="health.dashboard"){
   const s=await readState(),p=filtered(s,input);return {bookmarks:p.items,nextCursor:p.nextCursor,counts:getHealthCounts(s),settings:{id:1,userId:1,enabled:s.weeklyChecks,lastRunAt:null,lastRunStartedAt:null,lastRunTotal:null,lastRunCompletedAt:null,createdAt:new Date(),updatedAt:new Date()}};
 }
 if(path==="health.runProgress")return {pending:0,processing:0,checked:0,failed:0,total:0,startedAt:null,completedAt:null};
 if(path==="health.queueNow")throw new Error("Automated link checking requires a signed-in cloud account.");
 if(path==="health.enableWeeklyChecks")throw new Error("Weekly link checks require a signed-in cloud account.");
 if(path==="health.pauseWeeklyChecks")return writeState(s=>{s.weeklyChecks=false;return {enabled:false};});
 throw new Error(`Guest feature ${path} is not available offline.`);
}

export const guestLink: TRPCLink<AppRouter> = () => ({op}) => observable(observer => {
 let disposed=false;
 void guestOperation(op.path,op.input).then(data=>{
   if(!disposed){observer.next({result:{data}});observer.complete();}
 }).catch(error=>{if(!disposed)observer.error(error);});
 return ()=>{disposed=true;};
});
