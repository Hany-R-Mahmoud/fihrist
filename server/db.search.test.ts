import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jobRetryDelayMs, matchesBookmarkSearch, normalizeSearchTerms } from "./db";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("bookmark search against a real database", () => {
  it("finds a link by a term of three or more characters", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fihrist-search-"));
    directories.push(directory);
    vi.stubEnv("FIHRIST_DATA_DIR", directory);
    vi.resetModules();
    const db = await import("./db");

    await db.upsertUser({
      openId: "local-user",
      name: "Local User",
      email: "local@localhost",
      loginMethod: "local",
      role: "admin",
    });
    const created = await db.createBookmark({
      userId: 1,
      collectionId: null,
      url: "https://example.org/saved-from-the-extension",
      normalizedUrl: "https://example.org/saved-from-the-extension",
      normalizedUrlHash: "search-hash",
      host: "example.org",
    });
    await db.updateBookmarkMetadata(1, created.id, {
      title: "A note saved from the extension",
      description: "Reference material for later",
      contentText: "The cached page explains durable retrieval.",
    });

    // Three characters is the point where the full-text index is used.
    const page = await db.searchBookmarkPage(1, "extension");
    expect(page.items.map(item => item.id)).toContain(created.id);

    // A term that only appears in the cached page content.
    const byContent = await db.searchBookmarkPage(1, "retrieval");
    expect(byContent.items.map(item => item.id)).toContain(created.id);

    // A term that appears nowhere.
    const byMiss = await db.searchBookmarkPage(1, "absolutelynotpresent");
    expect(byMiss.items.map(item => item.id)).not.toContain(created.id);
  });
});

describe("bookmark search helpers", () => {
  const cachedBookmark = {
    title: "A compact note",
    description: null,
    notes: "Review this before the next architecture meeting.",
    contentText: "The cached page explains durable full text retrieval and search indexing.",
    host: "example.org",
    tags: [{ id: 1, name: "research", source: "automatic" as const }],
  };

  it("matches terms held only in cached page content", () => {
    expect(matchesBookmarkSearch(cachedBookmark, normalizeSearchTerms("durable retrieval"))).toBe(true);
  });

  it("requires every search term and searches notes and tags too", () => {
    expect(matchesBookmarkSearch(cachedBookmark, normalizeSearchTerms("architecture research"))).toBe(true);
    expect(matchesBookmarkSearch(cachedBookmark, normalizeSearchTerms("architecture absent"))).toBe(false);
  });

  it("normalizes whitespace, case, and a maximum of eight terms", () => {
    expect(normalizeSearchTerms("  Durable   RETRIEVAL  ")).toEqual(["durable", "retrieval"]);
    expect(normalizeSearchTerms("one two three four five six seven eight nine")).toHaveLength(8);
  });
});

describe("bookmark job retry backoff", () => {
  it("backs off failed attempts and caps the delay", () => {
    expect(jobRetryDelayMs(1)).toBe(1_000);
    expect(jobRetryDelayMs(2)).toBe(2_000);
    expect(jobRetryDelayMs(8)).toBe(60_000);
  });
});
