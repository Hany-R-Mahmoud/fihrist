import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

/** Deterministic evidence, shared by the checker and soft-404 probe. */
export const FAILURE_CLASSES = ["none", "dns", "refused", "timeout", "tls", "http_4xx",
  "http_5xx", "blocked", "soft_404", "redirect_home", "redirect_login", "inconclusive"] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];
export const MOVE_CLASSES = ["none", "canonical", "relocation", "cross_domain", "to_home", "to_login"] as const;
export type MoveClass = (typeof MOVE_CLASSES)[number];
export type RedirectHop = { u: string; s: number };

export function normalizedVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,template").remove();
  return ($("body").text() || $.root().text())
    .normalize("NFKC").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function visibleBodyHash(html: string): string {
  return createHash("sha256").update(normalizedVisibleText(html)).digest("hex");
}

function shingles(s: string): Set<string> {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 3) return new Set(words.length ? [words.join(" ")] : []);
  return new Set(words.slice(0, -2).map((w, i) => w+" "+words[i+1]+" "+words[i+2]));
}

export function jaccardBodySimilarity(left: string, right: string): number {
  const a = shingles(normalizedVisibleText(left));
  const b = shingles(normalizedVisibleText(right));
  if (!a.size || !b.size) return 0;
  let matches=0;
  for (const t of a) if (b.has(t)) matches++;
  return matches / (a.size+b.size-matches);
}

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|ref$|source$)/i;
function canonicalForm(url: URL): string {
  const host=url.hostname.toLowerCase().replace(/^www\./,"");
  const path=url.pathname.replace(/\/+$/,"").toLowerCase() || "/";
  const params=[...url.searchParams.entries()]
    .filter(([k])=>!TRACKING_PARAM.test(k))
    .sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
  return host+path+"?"+new URLSearchParams(params).toString();
}
export function classifyMove(original: string, final: string | null, loginWall=false): MoveClass {
  if (!final || final===original) return "none";
  let src: URL, dst: URL;
  try { src=new URL(original); dst=new URL(final); } catch { return "none"; }
  const originalDeep=src.pathname.split("/").filter(Boolean).length>1 ||
    (src.pathname!=="/" && !/^\/(?:en|ar)\/?$/i.test(src.pathname));
  if (originalDeep && (loginWall || /\/(?:login|signin|sign-in|auth|account\/login)(?:\/|$|\?)/i.test(dst.pathname))) return "to_login";
  if (originalDeep && /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/i.test(dst.pathname)) return "to_home";
  if (canonicalForm(src)===canonicalForm(dst)) return "canonical";
  return src.hostname.replace(/^www\./,"")===dst.hostname.replace(/^www\./,"")
    ? "relocation" : "cross_domain";
}

export function cappedRedirectChain(hops: RedirectHop[]): string {
  const result=hops.slice(-8).map(h=>({u:h.u.slice(0,256),s:h.s}));
  while (Buffer.byteLength(JSON.stringify(result),"utf8")>2500 && result.length>2) result.splice(1,1);
  while (Buffer.byteLength(JSON.stringify(result),"utf8")>2500 && result.length>0) {
    result[Math.floor(result.length/2)].u=result[Math.floor(result.length/2)].u.slice(0,-16);
  }
  return JSON.stringify(result);
}

export function failureClassOf(probes: Array<{ status:number|null;networkCode?:string;bodySample?:string }>,
  outcome: {healthStatus:string;moveClass?:MoveClass|null}): FailureClass {
  if (outcome.moveClass==="to_home") return "redirect_home";
  if (outcome.moveClass==="to_login") return "redirect_login";
  if (outcome.healthStatus==="healthy" || outcome.healthStatus==="redirected") return "none";
  const blocked = probes.find(p => [401,403,429].includes(p.status ?? 0) ||
    /just a moment|captcha|verify you are human|access denied|login wall|security check/i.test(p.bodySample??""));
  if (blocked) return "blocked";
  if (!probes.length) return "inconclusive";
  const codes=probes.map(p=>(p.networkCode??"").toUpperCase());
  if (codes.every(c=>c==="ENOTFOUND")) return "dns";
  if (codes.every(c=>c==="ECONNREFUSED")) return "refused";
  // Mixing a network failure with a server response is not evidence
  // of a repeatable site failure, nor of a persistent timeout/TLS class.
  if (probes.some(p=>p.status!==null) && probes.some(p=>Boolean(p.networkCode))) {
    return "inconclusive";
  }
  if (codes.every(c=>/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(c)))
    return "tls";
  if (codes.every(c=>/TIMEOUT|ETIMEDOUT|ECONNABORTED/i.test(c)))
    return "timeout";
  const final=probes[probes.length-1];
  if(probes.every(p=>p.status===final?.status) && final?.status!==null &&
    final?.status!==undefined) {
    if(final.status>=500) return "http_5xx";
    if(final.status>=400 && final.status<500) return "http_4xx";
  }
  return "inconclusive";
}

const MISSING_TEXT = /(?:page\s+not\s+found|page\s+(?:was\s+)?removed|404|الصفحة\s+غير\s+موجودة|غير\s+موجود)/i;
export function suspectedSoft404(
 target:{finalUrl:string|null;title:string|null;bodySample:string},
 probe:{status:number|null;finalUrl:string|null;title:string|null;bodySample:string}
): boolean {
  if (!probe.status || probe.status<200 || probe.status>=300) return false;
  const targetText=normalizedVisibleText(target.bodySample);
  if (targetText.length<20) return false;
  return Boolean(
    (target.finalUrl && target.finalUrl===probe.finalUrl) ||
    (target.title && probe.title && target.title.toLocaleLowerCase()===probe.title.toLocaleLowerCase()) ||
    jaccardBodySimilarity(target.bodySample,probe.bodySample)>=0.9 ||
    MISSING_TEXT.test(target.title??"") || MISSING_TEXT.test(targetText)
  );
}
