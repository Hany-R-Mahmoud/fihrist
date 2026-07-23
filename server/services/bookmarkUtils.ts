import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

export type NormalizedBookmarkUrl = {
  url: string;
  normalizedUrl: string;
  normalizedUrlHash: string;
  host: string;
};

export type ParsedBookmark = {
  url: string;
  title: string | null;
  collectionPath: string[];
};

type NetscapeNode = {
  name?: string;
  attribs?: Record<string, string>;
  children?: NetscapeNode[];
  type?: string;
};

const MAX_URL_LENGTH = 2048;
const MAX_IMPORT_HTML_BYTES = 2_000_000;
const MAX_IMPORTED_BOOKMARKS = 1_000;
const MAX_COLLECTION_DEPTH = 20;

export function normalizeBookmarkUrl(rawValue: string): NormalizedBookmarkUrl {
  const candidate = rawValue.trim();
  if (!candidate || candidate.length > MAX_URL_LENGTH) {
    throw new Error("Enter a valid URL no longer than 2048 characters");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a complete HTTP or HTTPS URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be saved");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }
  if (!parsed.hostname) throw new Error("URL must include a host name");

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "https:" && parsed.port === "443") ||
    (parsed.protocol === "http:" && parsed.port === "80")
  ) {
    parsed.port = "";
  }
  parsed.hash = "";
  const normalizedUrl = parsed.toString();

  return {
    url: candidate,
    normalizedUrl,
    normalizedUrlHash: createHash("sha256").update(normalizedUrl).digest("hex"),
    host: parsed.hostname,
  };
}

export function detectContentDirection(value: string | null | undefined): "ltr" | "rtl" {
  if (!value) return "ltr";
  const rtlMatches = value.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/g)?.length ?? 0;
  const strongMatches = value.match(/[A-Za-z\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/g)?.length ?? 0;
  return strongMatches > 0 && rtlMatches / strongMatches >= 0.3 ? "rtl" : "ltr";
}

const TOPIC_RULES: Array<{ name: string; terms: string[] }> = [
  {
    name: "development",
    terms: ["software", "code", "programming", "typescript", "javascript", "api", "github", "developer"],
  },
  {
    name: "design",
    terms: ["design", "ux", "ui", "typography", "interface", "prototype", "figma"],
  },
  {
    name: "research",
    terms: ["research", "paper", "study", "journal", "arxiv", "methodology"],
  },
  {
    name: "security",
    terms: ["security", "privacy", "authentication", "vulnerability", "encryption", "ssrf"],
  },
  {
    name: "data",
    terms: ["data", "analytics", "dataset", "sql", "database", "visualization"],
  },
  {
    name: "product",
    terms: ["product", "roadmap", "strategy", "customer", "growth", "market"],
  },
  {
    name: "writing",
    terms: ["writing", "essay", "article", "editorial", "newsletter", "story"],
  },
];

const HOST_TAGS: Record<string, string[]> = {
  "github.com": ["development", "github"],
  "arxiv.org": ["research", "paper"],
  "developer.mozilla.org": ["development", "documentation"],
  "docs.google.com": ["document"],
  "youtube.com": ["video"],
  "youtu.be": ["video"],
};

export function suggestAutomaticTags(input: {
  url: string;
  title?: string | null;
  description?: string | null;
  contentText?: string | null;
}) {
  const parsed = new URL(input.url);
  const text = [input.title, input.description, input.contentText]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .slice(0, 12000);
  const weighted = TOPIC_RULES.map(rule => ({
    name: rule.name,
    score: rule.terms.reduce(
      (total, term) => total + (text.includes(term) ? 1 : 0),
      0
    ),
  }))
    .filter(rule => rule.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(rule => rule.name);

  const hostTags = Object.entries(HOST_TAGS)
    .filter(([host]) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
    .flatMap(([, tags]) => tags);

  const domainLabel = parsed.hostname
    .replace(/^www\./, "")
    .split(".")[0]
    ?.replace(/[^a-z0-9-]/gi, "");

  return Array.from(
    new Set([...hostTags, ...weighted, ...(domainLabel ? [domainLabel] : [])])
  ).slice(0, 6);
}

function tagName(node: NetscapeNode) {
  return node.name?.toLocaleLowerCase() ?? "";
}

function getNodeText(node: NetscapeNode): string {
  return (node.children ?? [])
    .map(child => {
      if (child.type === "text") return (child as NetscapeNode & { data?: string }).data ?? "";
      return getNodeText(child);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function walkNetscapeNodes(
  nodes: NetscapeNode[],
  collectionPath: string[],
  parsedBookmarks: ParsedBookmark[],
  depth = 0
) {
  if (depth > MAX_COLLECTION_DEPTH || parsedBookmarks.length >= MAX_IMPORTED_BOOKMARKS) return;
  for (let index = 0; index < nodes.length; index += 1) {
    if (parsedBookmarks.length >= MAX_IMPORTED_BOOKMARKS) return;
    const node = nodes[index];
    if (tagName(node) === "dt") {
      const anchor = (node.children ?? []).find(child => tagName(child) === "a");
      if (anchor?.attribs?.href) {
        try {
          const normalized = normalizeBookmarkUrl(anchor.attribs.href);
          parsedBookmarks.push({
            url: normalized.normalizedUrl,
            title: getNodeText(anchor) || null,
            collectionPath,
          });
        } catch (error) {
          if (!(error instanceof Error)) throw error;
        }
      }

      const folder = (node.children ?? []).find(child => tagName(child) === "h3");
      if (folder) {
        const folderName = getNodeText(folder);
        const nested = (node.children ?? []).find(child => tagName(child) === "dl");
        const siblingIndex = nodes.findIndex(
          (child, candidateIndex) => candidateIndex > index && tagName(child) === "dl"
        );
        const siblingNested = siblingIndex === -1 ? undefined : nodes[siblingIndex];
        const nestedList = nested ?? siblingNested;
        if (folderName && nestedList) {
          walkNetscapeNodes(
            nestedList.children ?? [],
            [...collectionPath, folderName.slice(0, 160)],
            parsedBookmarks,
            depth + 1
          );
          if (!nested && siblingIndex > index) index = siblingIndex;
        }
      }
    } else if (tagName(node) === "dl") {
      walkNetscapeNodes(node.children ?? [], collectionPath, parsedBookmarks, depth + 1);
    } else if (node.children?.length) {
      walkNetscapeNodes(node.children, collectionPath, parsedBookmarks, depth + 1);
    }
  }
}

export function parseNetscapeBookmarks(html: string): ParsedBookmark[] {
  if (!html.trim()) throw new Error("The bookmark file is empty");
  if (html.length > MAX_IMPORT_HTML_BYTES) throw new Error("Bookmark import file is too large");
  const $ = cheerio.load(html);
  const root = $.root().get(0);
  if (!root) return [];
  const parsedBookmarks: ParsedBookmark[] = [];
  walkNetscapeNodes(root.children ?? [], [], parsedBookmarks);
  return parsedBookmarks;
}
