import axios from "axios";
import * as cheerio from "cheerio";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net, { type LookupFunction } from "node:net";
import { detectContentDirection, normalizeBookmarkUrl } from "./bookmarkUtils.js";
import { cappedRedirectChain, classifyMove, failureClassOf, visibleBodyHash, type FailureClass, type MoveClass, type RedirectHop } from "./healthEvidence.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 8;
const MAX_HTML_BYTES = 1_500_000;
const USER_AGENT = "FihristBookmarkHealth/1.0";

export type ScrapedBookmarkMetadata = {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  imageUrl: string | null;
  contentText: string | null;
  language: string | null;
  contentDirection: "ltr" | "rtl";
};

export type HealthStatus = "healthy" | "redirected" | "broken" | "needs_review";

export type LinkHealthResult = {
  healthStatus: HealthStatus;
  httpStatus: number | null;
  healthError: string | null;
};

/**
 * What a check produced, plus the probe layer's final URL. The classifier is
 * untouched — `finalUrl` is read from the probes, not decided by the policy.
 */
export type LinkHealthOutcome = LinkHealthResult & {
  finalUrl: string | null;
  failureClass: FailureClass;
  networkCode: string | null;
  redirectChain: string;
  finalHost: string | null;
  titleSnapshot: string | null;
  bodyHash: string | null;
  contentLength: number | null;
  moveClass: MoveClass;
  bodySample: string;
};

function normalizeIpLiteral(host: string) {
  return host.replace(/^\[|\]$/g, "").toLocaleLowerCase();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Network request timed out")), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function ipv6Segments(address: string) {
  const parts = address.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];
  const expanded = parts.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  if (expanded.length !== 8) return null;
  const values = expanded.map(value => Number.parseInt(value || "0", 16));
  return values.every(value => Number.isInteger(value) && value >= 0 && value <= 0xffff)
    ? values
    : null;
}

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(value => Number.isNaN(value))) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0)
  );
}

export function isBlockedIpAddress(address: string) {
  const normalized = normalizeIpLiteral(address);
  const family = net.isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family === 6) {
    const segments = ipv6Segments(normalized);
    if (!segments) return true;
    const [first, second] = segments;
    return (
      segments.every(segment => segment === 0) ||
      (segments.slice(0, 7).every(segment => segment === 0) && segments[7] === 1) ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (first === 0x2001 && second === 0x0db8) ||
      (first === 0x2001 && second >= 0x0002 && second <= 0x001f) ||
      (first === 0x2001 && second >= 0x0030 && second <= 0x003f) ||
      (first === 0x2001 && second === 0x0000 && segments[2] === 0x0000) ||
      (first === 0x2001 && second === 0x0001 && segments[2] === 0x0000)
    );
  }
  return false;
}

function isBlockedHostname(hostname: string) {
  const normalized = normalizeIpLiteral(hostname);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "metadata.google.internal"
  );
}

export async function assertPublicUrlTarget(urlValue: string) {
  const normalized = normalizeBookmarkUrl(urlValue);
  const hostname = normalizeIpLiteral(new URL(normalized.normalizedUrl).hostname);
  if (isBlockedHostname(hostname) || isBlockedIpAddress(hostname)) {
    throw new Error("Private or internal network addresses are not allowed");
  }

  const addresses = await withTimeout(
    dnsLookup(hostname, { all: true, verbatim: true }),
    REQUEST_TIMEOUT_MS
  );
  if (!addresses.length || addresses.some(result => isBlockedIpAddress(result.address))) {
    throw new Error("This URL resolves to a private or internal network address");
  }
  return normalized;
}

function agentForUrl(urlValue: string) {
  const lookup: LookupFunction = async (hostname, options, callback) => {
    try {
      const host = normalizeIpLiteral(hostname);
      if (isBlockedHostname(host)) throw new Error("Blocked hostname");
      const resolved = await withTimeout(
        dnsLookup(host, { all: false, verbatim: true }),
        REQUEST_TIMEOUT_MS
      );
      if (isBlockedIpAddress(resolved.address)) {
        throw new Error("Blocked address");
      }
      if (options.all) {
        callback(null, [{ address: resolved.address, family: resolved.family }]);
      } else {
        callback(null, resolved.address, resolved.family);
      }
    } catch {
      callback(new Error("URL target is not publicly reachable"), "", 0);
    }
  };
  return new URL(urlValue).protocol === "https:"
      ? new https.Agent({ lookup })
    : new http.Agent({ lookup });
}

async function requestPublic(
  initialUrl: string,
  method: "GET" | "HEAD",
  headers: Record<string, string> = {}
) {
  let currentUrl = (await assertPublicUrlTarget(initialUrl)).normalizedUrl;
  const chain: RedirectHop[] = [];
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await axios.request<string>({
      url: currentUrl,
      method,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          method === "HEAD"
            ? "*/*"
            : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        ...headers,
      },
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: MAX_HTML_BYTES,
      maxBodyLength: MAX_HTML_BYTES,
      responseType: "text",
      validateStatus: () => true,
      httpAgent: new URL(currentUrl).protocol === "http:" ? agentForUrl(currentUrl) : undefined,
      httpsAgent: new URL(currentUrl).protocol === "https:" ? agentForUrl(currentUrl) : undefined,
    });
    chain.push({u:currentUrl,s:response.status});
    const location = response.headers.location;
    if (
      response.status >= 300 &&
      response.status < 400 &&
      typeof location === "string"
    ) {
      if (redirectCount === MAX_REDIRECTS) throw new Error("Too many redirects");
      currentUrl = new URL(location, currentUrl).toString();
      await assertPublicUrlTarget(currentUrl);
      continue;
    }
    return { response, finalUrl: currentUrl, chain };
  }
  throw new Error("Too many redirects");
}

function isRobotsDisallowed(text: string, pathname: string) {
  let applies = false;
  let disallowed = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      applies = value === "*";
      continue;
    }
    if (applies && key === "disallow" && value && pathname.startsWith(value)) {
      disallowed = true;
    }
    if (applies && key === "allow" && value && pathname.startsWith(value)) {
      disallowed = false;
    }
  }
  return disallowed;
}

async function ensureRobotsPermission(urlValue: string) {
  const url = new URL(urlValue);
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
  try {
    const { response } = await requestPublic(robotsUrl, "GET");
    if (response.status >= 200 && response.status < 300 && typeof response.data === "string") {
      if (isRobotsDisallowed(response.data, url.pathname || "/")) {
        throw new Error("The site’s robots.txt disallows metadata extraction for this page");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("robots.txt disallows")) throw error;
    // Unavailable robots files do not prevent the standard, small metadata request.
  }
}

function safeAbsoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value, baseUrl);
    const base = new URL(baseUrl);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin === base.origin
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function firstMeta($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = $(selector).attr("content")?.trim();
    if (value) return value;
  }
  return null;
}

export async function scrapeBookmarkMetadata(urlValue: string): Promise<ScrapedBookmarkMetadata> {
  await assertPublicUrlTarget(urlValue);
  await ensureRobotsPermission(urlValue);
  const { response, finalUrl } = await requestPublic(urlValue, "GET");
  if (response.status === 403) {
    return {
      title: urlValue.trim().slice(0, 512),
      description: null,
      faviconUrl: null,
      imageUrl: null,
      contentText: null,
      language: null,
      contentDirection: "ltr",
    };
  }
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`Metadata request failed with HTTP ${response.status}`);
  }
  const contentType = String(response.headers["content-type"] ?? "").toLocaleLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return {
      title: new URL(finalUrl).hostname,
      description: null,
      faviconUrl: safeAbsoluteUrl("/favicon.ico", finalUrl),
      imageUrl: null,
      contentText: null,
      language: null,
      contentDirection: "ltr",
    };
  }

  const $ = cheerio.load(response.data);
  $("script, style, noscript, svg, template").remove();
  const title =
    firstMeta($, ["meta[property='og:title']", "meta[name='twitter:title']"]) ??
    ($("title").first().text().replace(/\s+/g, " ").trim() || new URL(finalUrl).hostname);
  const description =
    firstMeta($, [
      "meta[property='og:description']",
      "meta[name='description']",
      "meta[name='twitter:description']",
    ]) ?? null;
  const favicon =
    $("link[rel~='icon']").first().attr("href") ??
    $("link[rel='shortcut icon']").first().attr("href") ??
    "/favicon.ico";
  const contentRoot = $("article, main").first();
  const contentText = (contentRoot.length ? contentRoot : $("body"))
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000) || null;
  const language = $("html").attr("lang")?.trim().slice(0, 35) || null;
  const directionSource = [title, description, contentText].filter(Boolean).join(" ");

  return {
    title: title.slice(0, 512),
    description: description?.slice(0, 4000) ?? null,
    faviconUrl: safeAbsoluteUrl(favicon, finalUrl),
    imageUrl: safeAbsoluteUrl(
      firstMeta($, ["meta[property='og:image']", "meta[name='twitter:image']"]) ?? undefined,
      finalUrl
    ),
    contentText,
    language,
    contentDirection: detectContentDirection(directionSource),
  };
}

function evidenceFor(result: LinkHealthResult, probes: HealthProbe[], urlValue: string): LinkHealthOutcome {
  const successful=probes.find(probe=>probe.status!==null && probe.status>=200 && probe.status<300);
  const last=successful ?? probes[probes.length-1];
  const finalUrl=lastProbeFinalUrl(probes);
  const moveClass=classifyMove(urlValue,finalUrl,Boolean(last?.bodySample && looksBotBlocked(last.status,last.bodySample)));
  const challenged=moveClass==="to_home" || moveClass==="to_login";
  const computed=challenged ? {
    healthStatus: "needs_review" as const, httpStatus: result.httpStatus,
    healthError: moveClass==="to_home" ? "This link now lands on the site's homepage" : "This link now lands on a sign-in page"
  } : result;
  const bodySample=last?.bodySample??"";
  return {
    ...computed, finalUrl,
    failureClass: failureClassOf(probes, {healthStatus:computed.healthStatus,moveClass}),
    networkCode:probes.findLast(p=>p.networkCode)?.networkCode??null,
    redirectChain:cappedRedirectChain(last?.redirectChain??[]),
    finalHost:finalUrl ? new URL(finalUrl).hostname : null,
    titleSnapshot:(last?.titleSnapshot??null)?.slice(0,300)??null,
    bodyHash:bodySample ? visibleBodyHash(bodySample):null,
    contentLength:last?.contentLength??null, moveClass, bodySample,
  };
}

export async function probeMissingPage(urlValue: string): Promise<{status:number|null;finalUrl:string|null;title:string|null;bodySample:string}> {
  const url=new URL(urlValue);
  const probe=url.origin+"/fihrist-probe-"+(await import("node:crypto")).randomBytes(8).toString("hex");
  try {
    const {response,finalUrl}=await requestPublic(probe,"GET", {Range:PROBE_BODY_BYTES});
    const body=typeof response.data==="string" ? response.data.slice(0,8192) : "";
    return {status:response.status,finalUrl,title:body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g,"").trim().slice(0,300)??null,bodySample:body};
  } catch { return {status:null,finalUrl:null,title:null,bodySample:""}; }
}

/** The last URL the probes actually reached, if any. */
function lastProbeFinalUrl(probes: HealthProbe[]): string | null {
  for (let index = probes.length - 1; index >= 0; index -= 1) {
    const finalUrl = probes[index].finalUrl;
    if (finalUrl) return finalUrl;
  }
  return null;
}

export async function checkLinkHealth(urlValue: string): Promise<LinkHealthOutcome> {
  let host = "";
  try {
    host = new URL(normalizeBookmarkUrl(urlValue).normalizedUrl).hostname;
  } catch {
    return {
      healthStatus: "needs_review",
      httpStatus: null,
      healthError: "The saved URL is malformed and could not be checked.",
      finalUrl: null, failureClass:"inconclusive", networkCode:null,
      redirectChain:"[]", finalHost:null, titleSnapshot:null,
      bodyHash:null, contentLength:null, moveClass:"none", bodySample:"",
    };
  }
  const release = await healthPacer.acquire(host);
  try {
    const probes: HealthProbe[] = [];
    for (let attempt = 0; attempt < MAX_HEALTH_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(HEALTH_RETRY_DELAYS_MS[attempt]);
      probes.push(await probeOnce(urlValue));
      // A clean success needs no retries — stop early and save time.
      const early = classifyHealthStatus(probes, urlValue);
      if (early.healthStatus === "healthy" || early.healthStatus === "redirected") {
        return evidenceFor(early,probes,urlValue);
      }
    }
    return evidenceFor(classifyHealthStatus(probes, urlValue),probes,urlValue);
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// Tri-state health checking (never a confident wrong "dead").
// ---------------------------------------------------------------------------

/** One network attempt. `status` is null when the request never completed. */
export type HealthProbe = {
  status: number | null;
  networkCode?: string;
  /** Lowercased body sample (first ~8KB) for bot-challenge / shell detection. */
  bodySample?: string;
  finalUrl?: string;
  redirectChain?: RedirectHop[];
  titleSnapshot?: string | null;
  contentLength?: number | null;
};

const MAX_HEALTH_ATTEMPTS = 3;
const HEALTH_RETRY_DELAYS_MS = [0, 1_000, 2_500];
const DOMAIN_MIN_GAP_MS = 750;
const DOMAIN_MAX_CONCURRENT = 2;
const PROBE_BODY_BYTES = "bytes=0-32767";

/** Statuses that mean "blocked for bots", never "dead". */
const BLOCKED_STATUSES = new Set([401, 403, 429]);

const BOT_CHALLENGE_MARKERS = [
  "cf-chl",
  "challenge-platform",
  "__cf_chl",
  "cf_clearance",
  "attention required",
  "just a moment",
  "verify you are human",
  "captcha",
  "ddos protection",
  "are you a robot",
  "access denied",
  "request blocked",
  "perimeterx",
  "datadome",
  "kasada",
  "please verify",
  "security check",
];

const SPA_SHELL_MARKERS = [
  '<div id="root"></div>',
  '<div id="app"></div>',
  '<div id="__next"></div>',
  '<div id="root">',
  "window.__initial_state__",
  "__next_f.push",
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function textLengthOf(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** True when the response looks like a bot challenge / login wall, not a real page. */
export function looksBotBlocked(status: number | null, bodySample: string): boolean {
  if (status !== null && BLOCKED_STATUSES.has(status)) return true;
  const sample = bodySample.toLocaleLowerCase();
  return BOT_CHALLENGE_MARKERS.some(marker => sample.includes(marker));
}

/** True when the page is an empty JS app shell — HTTP 200 but nothing verifiable. */
export function looksLikeJsShell(status: number | null, bodySample: string): boolean {
  if (status === null || status < 200 || status >= 300) return false;
  if (textLengthOf(bodySample) >= 300) return false;
  const sample = bodySample.toLocaleLowerCase();
  return SPA_SHELL_MARKERS.some(marker => sample.includes(marker));
}

/**
 * Pure decision function: probes in → tri-state verdict out.
 * Philosophy: "dead" requires hard evidence. Ambiguity → "needs_review".
 */
export function classifyHealthStatus(
  probes: HealthProbe[],
  originalUrl: string
): LinkHealthResult {
  const normalizedOriginal = (() => {
    try {
      return normalizeBookmarkUrl(originalUrl).normalizedUrl;
    } catch {
      return originalUrl;
    }
  })();

  for (const probe of probes) {
    if (probe.status !== null && probe.status >= 200 && probe.status < 300) {
      const body = probe.bodySample ?? "";
      if (looksBotBlocked(probe.status, body)) {
        return {
          healthStatus: "needs_review",
          httpStatus: probe.status,
          healthError:
            "The site served a bot challenge or login wall. It may be fine — verify manually.",
        };
      }
      if (looksLikeJsShell(probe.status, body)) {
        return {
          healthStatus: "needs_review",
          httpStatus: probe.status,
          healthError:
            "The page returned an empty app shell that could not be verified. Check it manually.",
        };
      }
      return {
        healthStatus:
          probe.finalUrl && probe.finalUrl !== normalizedOriginal ? "redirected" : "healthy",
        httpStatus: probe.status,
        healthError: null,
      };
    }
  }

  const statuses = probes.map(probe => probe.status).filter((s): s is number => s !== null);
  const networkCodes = probes.map(probe => probe.networkCode).filter(Boolean) as string[];

  // Bot-blocker statuses are never "dead" — the site is alive, it just dislikes bots.
  const blockedStatus = statuses.find(status => BLOCKED_STATUSES.has(status));
  if (blockedStatus !== undefined) {
    return {
      healthStatus: "needs_review",
      httpStatus: blockedStatus,
      healthError: `The site blocks automated checks (HTTP ${blockedStatus}). It may be fine — verify manually.`,
    };
  }

  // Challenge markers can arrive with a 200 (managed challenges) — check every probe body.
  const challengedProbe = probes.find(probe => looksBotBlocked(probe.status, probe.bodySample ?? ""));
  if (challengedProbe) {
    return {
      healthStatus: "needs_review",
      httpStatus: challengedProbe.status,
      healthError: "The site served a bot challenge page. It may be fine — verify manually.",
    };
  }

  if (networkCodes.length === probes.length && networkCodes.length > 0) {
    // EAI_AGAIN means a temporary DNS lookup failure; never mark it dead.
    if (networkCodes.every(code => code === "ENOTFOUND")) {
      return {
        healthStatus: "broken",
        httpStatus: null,
        healthError: "The domain does not resolve (DNS failure).",
      };
    }
    if (networkCodes.every(code => code === "ECONNREFUSED")) {
      return {
        healthStatus: "broken",
        httpStatus: null,
        healthError: "The server refused the connection.",
      };
    }
    return {
      healthStatus: "needs_review",
      httpStatus: null,
      healthError:
        "The site did not respond to repeated checks. It may be temporarily down — verify manually.",
    };
  }

  const lastStatus = statuses[statuses.length - 1];
  // A final HTTP error alone is not proof that a link is dead. Only classify
  // a hard HTTP failure when every retry returned the SAME status; a timeout,
  // changing status, or partial response makes the result inconclusive.
  const consistentHttpFailure =
    probes.length >= MAX_HEALTH_ATTEMPTS &&
    lastStatus !== undefined &&
    probes.every(probe => probe.status === lastStatus);
  if (consistentHttpFailure && lastStatus !== undefined) {
    if (lastStatus === 404 || lastStatus === 410) {
      return {
        healthStatus: "broken",
        httpStatus: lastStatus,
        healthError: `The page is gone (HTTP ${lastStatus}).`,
      };
    }
    if (lastStatus >= 400 && lastStatus < 500) {
      return {
        healthStatus: "broken",
        httpStatus: lastStatus,
        healthError: `The page consistently returns HTTP ${lastStatus}.`,
      };
    }
    if (lastStatus >= 500) {
      return {
        healthStatus: "broken",
        httpStatus: lastStatus,
        healthError: `The server consistently returns HTTP ${lastStatus}.`,
      };
    }
  }

  return {
    healthStatus: "needs_review",
    httpStatus: lastStatus ?? null,
    healthError: "The check was inconclusive. Verify manually.",
  };
}

async function probeOnce(urlValue: string): Promise<HealthProbe> {
  try {
    let result = await requestPublic(urlValue, "HEAD");
    if ([405, 403, 400].includes(result.response.status) ||
      (result.response.status >= 200 && result.response.status < 300)) {
      result = await requestPublic(urlValue, "GET", { Range: PROBE_BODY_BYTES });
    }
    const data = result.response.data;
    const bodySample =
      typeof data === "string" ? data.slice(0, 8192).toLocaleLowerCase() : "";
    return {
      status: result.response.status, bodySample, finalUrl: result.finalUrl,
      redirectChain: result.chain,
      titleSnapshot: bodySample.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g,"").trim().slice(0,300)??null,
      contentLength: Number.isFinite(Number(result.response.headers["content-length"])) ? Number(result.response.headers["content-length"]) : null,
    };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code: string }).code as string)
        : "UNKNOWN";
    return { status: null, networkCode: code };
  }
}

/**
 * Per-domain pacing so bulk health runs don't get the owner's IP throttled —
 * a historic cause of false "dead" results. Sequential per host with a gap,
 * capped concurrency per host.
 */
export class DomainPacer {
  private lastHit = new Map<string, number>();
  private tails = new Map<string, Promise<void>>();

  async acquire(host: string): Promise<() => void> {
    // Serialize checks per host. This is below the documented maximum of two
    // concurrent requests and prevents simultaneous callers bypassing the gap.
    const previous = this.tails.get(host) ?? Promise.resolve();
    let releaseSlot!: () => void;
    const slot = new Promise<void>(resolve => { releaseSlot = resolve; });
    const tail = previous.then(() => slot);
    this.tails.set(host, tail);
    await previous;
    const gap = DOMAIN_MIN_GAP_MS - (Date.now() - (this.lastHit.get(host) ?? 0));
    if (gap > 0) await sleep(gap);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.lastHit.set(host, Date.now());
      releaseSlot();
      if (this.tails.get(host) === tail) this.tails.delete(host);
    };
  }
}

export const healthPacer = new DomainPacer();
