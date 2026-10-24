import { describe,expect,it } from "vitest";
import { cappedRedirectChain, classifyMove, failureClassOf,
  jaccardBodySimilarity, suspectedSoft404, visibleBodyHash } from "./healthEvidence";
import { classifyHealthStatus } from "./linkSafety";
import { deriveTopicShelves } from "./topicShelves";
import { plainLanguageSentence } from "../../shared/healthLanguage";

describe("Health Engine v2 policy contract (V4, V5, V7, V9)",()=>{
  const check=(status:number|null,networkCode?:string)=>({status,networkCode});
  it("bounded chain never exceeds eight entries and 2500 UTF-8 bytes",()=>{
    const entries=Array.from({length:20},(_,i)=>({u:"https://example.com/"+("مرحبا".repeat(200))+i,s:301}));
    const encoded=cappedRedirectChain(entries);
    expect(Buffer.byteLength(encoded,"utf8")).toBeLessThanOrEqual(2500);
    const chain=JSON.parse(encoded);
    expect(chain.length).toBeLessThanOrEqual(8);
    expect(chain.every((hop:{u:string})=>hop.u.length<=256)).toBe(true);
  });
  it("classifies four meaningful redirect variants",()=>{
    expect(classifyMove("https://www.example.org/a/one?utm_source=home",
      "http://example.org/a/one")).toBe("canonical");
    expect(classifyMove("https://example.org/articles/first",
      "https://example.org/articles/second")).toBe("relocation");
    expect(classifyMove("https://example.org/a/b",
      "https://other.example.net/a/b")).toBe("cross_domain");
    expect(classifyMove("https://example.org/articles/abc",
      "https://example.org/")).toBe("to_home");
    expect(classifyMove("https://example.org/articles/abc",
      "https://example.org/login")).toBe("to_login");
  });
  it("keeps blocked, TLS and flapping errors under review",()=>{
    const tls=[check(null,"CERT_HAS_EXPIRED"),check(null,"CERT_HAS_EXPIRED"),check(null,"CERT_HAS_EXPIRED")];
    expect(classifyHealthStatus(tls,"https://example.org/").healthStatus).toBe("needs_review");
    expect(failureClassOf(tls,{healthStatus:"needs_review"})).toBe("tls");
    const flapping=[check(500),check(null,"ETIMEDOUT"),check(500)];
    expect(classifyHealthStatus(flapping,"https://example.org/").healthStatus).toBe("needs_review");
    expect(failureClassOf(flapping,{healthStatus:"needs_review"})).toBe("inconclusive");
    expect(failureClassOf([check(429),check(429),check(429)],
      {healthStatus:"needs_review"})).toBe("blocked");
    expect(failureClassOf([check(null,"ENOTFOUND"),check(null,"ENOTFOUND"),check(null,"ENOTFOUND")],
      {healthStatus:"broken"})).toBe("dns");
  });
  it("only suspects soft-404 when a custom 2xx probe resembles the target",()=>{
    const missing="<html><title>Page not found</title><body><p>Sorry this page is not found. Go home.</p></body></html>";
    const target={finalUrl:"https://example.org/deleted",title:"Page not found",bodySample:missing};
    expect(suspectedSoft404(target,{status:200,finalUrl:"https://example.org/fihrist-probe",
      title:"Page not found",bodySample:missing})).toBe(true);
    expect(suspectedSoft404(target,{status:404,finalUrl:"https://example.org/fihrist-probe",
      title:"Page not found",bodySample:missing})).toBe(false);
    expect(jaccardBodySimilarity(missing,missing)).toBe(1);
    expect(visibleBodyHash(missing)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("groups host, Arabic/English keywords and shared tags without mutating source",()=>{
    const rows=Array.from({length:3},(_,i)=>({
      id:i+1,host:"news.example",title:i===0?"أخبار الاقتصاد":"finance news today",
      description:"finance",contentText:"",collectionId:i,
      tags:[{name:"money",source:"manual"},{name:"economy",source:"automatic"}]
    }));
    const before=JSON.stringify(rows);
    const shelves=deriveTopicShelves(rows);
    expect(shelves.find(s=>s.normalizedName==="topic:host:news.example")?.bookmarkIds).toEqual([1,2,3]);
    expect(shelves.find(s=>s.normalizedName==="topic:keyword:finance")?.bookmarkIds).toEqual([1,2,3]);
    expect(shelves.some(s=>s.normalizedName==="topic:shared:economy:money")).toBe(true);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("gives the mandated user-facing Arabic/English plain-language reasons",()=>{
    const sample={status:"needs_review" as const, failureClass:"tls"};
    expect(plainLanguageSentence(sample,"en")).toBe("The site's security certificate has a problem");
    expect(plainLanguageSentence({...sample,failureClass:"soft_404"},"ar"))
      .toBe("الصفحة شكلها اتشالت — الموقع بيرد بصفحة فاضية");
    expect(plainLanguageSentence({...sample,checksDisabled:true},"en"))
      .toBe("Checks are off for this link");
  });
});
