import { assertPublicUrlTarget, fetchPublicText } from "./linkSafety.js";

/** Advisory only. This never changes the health verdict and never runs inline in an API request. */
export async function lookupArchivedCopy(originalUrl: string):Promise<{
  archiveUrl:string|null;archiveTimestamp:Date|null
}> {
  const url=new URL("https://archive.org/wayback/available");
  url.searchParams.set("url",originalUrl);
  await assertPublicUrlTarget(url.toString());
  const result=await fetchPublicText(url.toString());
  if(result.status<200 || result.status>=300) throw new Error("Archive service unavailable");
  let body: {archived_snapshots?: {closest?: {available?:boolean;url?:string;timestamp?:string}}};
  try {body=JSON.parse(result.body) as typeof body;}catch{throw new Error("Archive response unreadable");}
  const snapshot=body.archived_snapshots?.closest;
  if(!snapshot?.available || !snapshot.url)return {archiveUrl:null,archiveTimestamp:null};
  let parsed:URL;
  try{parsed=new URL(snapshot.url);}catch{throw new Error("Unexpected archive address");}
  if(parsed.hostname!=="web.archive.org" || !["http:","https:"].includes(parsed.protocol)) {
    throw new Error("Unexpected archive host");
  }
  parsed.protocol="https:";
  // Do not validate the embedded archived target as an HTTP request destination;
  // the browser receives an ordinary Wayback URL and redirects at its discretion.
  const stamp=snapshot.timestamp?.match(/^\d{14}$/)?.[0];
  const date=stamp ? new Date(stamp.slice(0,4)+"-"+stamp.slice(4,6)+"-"+stamp.slice(6,8)+
    "T"+stamp.slice(8,10)+":"+stamp.slice(10,12)+":"+stamp.slice(12,14)+"Z") : null;
  return {archiveUrl:parsed.toString(),archiveTimestamp:date && !Number.isNaN(date.getTime())?date:null};
}
