import { describe, expect, it } from "vitest";
import { jobRetryDelayMs, matchesBookmarkSearch, normalizeSearchTerms } from "./db";

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
