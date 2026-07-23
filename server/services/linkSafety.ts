import axios from "axios";
import * as cheerio from "cheerio";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net, { type LookupFunction } from "node:net";
import { detectContentDirection, normalizeBookmarkUrl } from "./bookmarkUtils";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
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

export type LinkHealthResult = {
  healthStatus: "healthy" | "redirected" | "broken";
  httpStatus: number | null;
  healthError: string | null;
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
    return { response, finalUrl: currentUrl };
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

export async function checkLinkHealth(urlValue: string): Promise<LinkHealthResult> {
  try {
    let result = await requestPublic(urlValue, "HEAD");
    if ([405, 403, 400].includes(result.response.status)) {
      result = await requestPublic(urlValue, "GET", { Range: "bytes=0-1023" });
    }
    const status = result.response.status;
    if (status >= 200 && status < 400) {
      return {
        healthStatus: result.finalUrl !== normalizeBookmarkUrl(urlValue).normalizedUrl ? "redirected" : "healthy",
        httpStatus: status,
        healthError: null,
      };
    }
    return {
      healthStatus: "broken",
      httpStatus: status,
      healthError: `HTTP ${status}`,
    };
  } catch (error) {
    return {
      healthStatus: "broken",
      httpStatus: null,
      healthError: error instanceof Error ? error.message.slice(0, 2000) : "Network request failed",
    };
  }
}
