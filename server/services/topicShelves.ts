import { db } from "../data.js";
import { TOPIC_RULES } from "./bookmarkUtils.js";

export type TopicCandidate = { normalizedName:string;name:string;bookmarkIds:number[] };
export type ShelfInput = { id:number; host:string; title:string|null; description:string|null;contentText:string|null;
 collectionId:number|null; tags:Array<{name:string;source:string}> };
function matches(text:string,terms:string[]) {
  return terms.reduce((n,w)=>n+(text.includes(w.toLocaleLowerCase())?1:0),0);
}
function safeTag(s:string) { return s.toLocaleLowerCase().trim().replace(/\s+/g,"-").slice(0,70); }

/** Pure grouping: derived shelf memberships never mutate collections. */
export function deriveTopicShelves(rows:ShelfInput[]):TopicCandidate[] {
  const groups=new Map<string,{name:string;ids:Set<number>}>();
  const add=(key:string,name:string,id:number)=>{
    if(!groups.has(key))groups.set(key,{name,ids:new Set()});
    groups.get(key)!.ids.add(id);
  };
  for(const row of rows) {
    const host=row.host.toLocaleLowerCase().replace(/^www\./,"");
    add("topic:host:"+host,"Site: "+host,row.id);
    const text=[row.title,row.description,row.contentText].filter(Boolean).join(" ").toLocaleLowerCase().slice(0,12000);
    for(const rule of TOPIC_RULES)if(matches(text,rule.terms)>0){
      add("topic:keyword:"+rule.name,"Topic: "+rule.name,row.id);
    }
    const tags=Array.from(new Set(row.tags.filter(t=>t.source!=="topic").map(t=>safeTag(t.name))))
      .filter(Boolean).sort().slice(0,20);
    for(let i=0;i<tags.length;i++)for(let j=i+1;j<tags.length;j++){
      add("topic:shared:"+tags[i]+":"+tags[j],"Tags: "+tags[i]+" + "+tags[j],row.id);
    }
  }
  return [...groups.entries()].filter(([,g])=>g.ids.size>=3)
    .sort(([ak],[bk])=>ak.localeCompare(bk)).slice(0,100)
    .map(([normalizedName,g])=>({normalizedName,name:g.name,bookmarkIds:[...g.ids].sort((a,b)=>a-b)}));
}

export function shelfReason(normalizedName:string,locale:"ar"|"en") {
  if(normalizedName.startsWith("topic:host:")) return locale==="ar"
    ? "اتجمعت لأنها من نفس الموقع" : "Grouped because they're from the same site";
  if(normalizedName.startsWith("topic:keyword:")) return locale==="ar"
    ? "اتجمعت لأن مواضيعها عن "+normalizedName.slice(14)
    : "Grouped by topic: "+normalizedName.slice(14);
  const terms=normalizedName.slice("topic:shared:".length).replace(":",", ");
  return locale==="ar" ? "اتجمعت لأنها بتشارك وسوم "+terms : "Grouped by shared tags: "+terms;
}

export async function refreshTopicShelves(userId:number) {
  // Reads only fields already stored; no AI/network calls or collection updates.
  const items=await db.listBookmarks(userId,{},10000);
  const shelves=deriveTopicShelves(items.map(b=>({
    id:b.id,host:b.host,title:b.title,description:b.description,contentText:b.contentText,
    collectionId:b.collectionId,tags:b.tags
  })));
  await db.replaceTopicLinks(userId,shelves);
  return shelves.length;
}

export async function listTopicShelves(userId:number) {
  const [links,bookmarks]=await Promise.all([
    db.listTopicLinks(userId), db.listBookmarks(userId,{},10000)
  ]);
  const byId=new Map(bookmarks.map(b=>[b.id,b]));
  const shelves=new Map<number,{id:number;name:string;normalizedName:string;bookmarks:typeof bookmarks}>();
  for(const link of links){
    const bookmark=byId.get(link.bookmarkId);
    if(!bookmark)continue;
    let shelf=shelves.get(link.id);
    if(!shelf){shelf={id:link.id,name:link.name,normalizedName:link.normalizedName,bookmarks:[]};shelves.set(link.id,shelf);}
    shelf.bookmarks.push(bookmark);
  }
  return [...shelves.values()].filter(s=>s.bookmarks.length>=1)
    .sort((a,b)=>b.bookmarks.length-a.bookmarks.length||a.name.localeCompare(b.name));
}
