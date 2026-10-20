import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DigestFacts, DigestItem } from "./rotDigest";
import { factsHaveNoChanges, validateNarrative } from "./rotDigest";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function item(overrides: Partial<DigestItem>): DigestItem {
  return {
    bookmarkId: 1,
    title: "Example link",
    host: "example.com",
    url: "https://example.com/a",
    status: "broken",
    httpStatus: 404,
    finalUrl: null,
    error: "The page is gone (HTTP 404).",
    sentence: {
      ar: "الصفحة اتشالت من الموقع",
      en: "The page was removed from the site",
    },
    since: "2026-01-08T12:00:00.000Z",
    streak: 1,
    ...overrides,
  };
}

function facts(overrides: Partial<DigestFacts> = {}): DigestFacts {
  return {
    runId: 1,
    trigger: "weekly",
    runStartedAt: "2026-01-01T00:00:00.000Z",
    runCompletedAt: "2026-01-01T01:00:00.000Z",
    checked: 10,
    skipped: 0,
    counts: {
      newlyBroken: 1,
      recovered: 0,
      newlySuspicious: 0,
      stillBroken: 0,
      redirected: 0,
      dismissed: 0,
    },
    items: {
      newlyBroken: [item({})],
      recovered: [],
      newlySuspicious: [],
      stillBroken: [],
      redirected: [],
    },
    generatedAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

describe("digest grounding guard", () => {
  const libraryTitles = [
    { id: 1, title: "Example link", host: "example.com" },
    { id: 2, title: "Another link", host: "another.example" },
    { id: 3, title: "Outside link", host: "outside.example" },
  ];

  it("accepts a narrative that only talks about links in the facts block", () => {
    const verdict = validateNarrative({
      narrative: "الصفحة اتشالت من الموقع. راجع [[1]].",
      itemIds: [1],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.narrative).toContain("Example link");
  });

  it("rejects a narrative that names a link outside the facts block", () => {
    const verdict = validateNarrative({
      narrative: "Outside link اتكسر خلاص.",
      itemIds: [],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("Outside link");
  });

  it("rejects a narrative that invents a link that is not in the library at all", () => {
    const verdict = validateNarrative({
      narrative: "Some other link is gone.",
      itemIds: [],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects a narrative that references an id that is not in the facts block", () => {
    const verdict = validateNarrative({
      narrative: "الصفحة اتشالت من الموقع [[99]].",
      itemIds: [99],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects a narrative that calls a needs_review link dead", () => {
    const reviewFacts = facts({
      counts: { newlyBroken: 0, recovered: 0, newlySuspicious: 1, stillBroken: 0, redirected: 0, dismissed: 0 },
      items: {
        newlyBroken: [],
        recovered: [],
        newlySuspicious: [
          item({
            bookmarkId: 4,
            title: "Guarded link",
            status: "needs_review",
            httpStatus: 403,
            error: "The site blocks automated checks (HTTP 403).",
          }),
        ],
        stillBroken: [],
        redirected: [],
      },
    });

    const verdict = validateNarrative({
      narrative: "Guarded link مكسور ومات خلاص.",
      itemIds: [4],
      facts: reviewFacts,
      libraryTitles: [...libraryTitles, { id: 4, title: "Guarded link", host: "guarded.example" }],
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects a narrative that asserts a cause the server did not record", () => {
    const dnsFacts = facts({
      items: {
        newlyBroken: [
          item({
            bookmarkId: 5,
            title: "Dead domain",
            status: "broken",
            httpStatus: null,
            error: "The domain does not resolve (DNS failure).",
          }),
        ],
        recovered: [],
        newlySuspicious: [],
        stillBroken: [],
        redirected: [],
      },
    });

    // The server said "the domain does not resolve", not "the page was removed".
    const verdict = validateNarrative({
      narrative: "Dead domain — الصفحة اتشالت من الموقع.",
      itemIds: [5],
      facts: dnsFacts,
      libraryTitles: [...libraryTitles, { id: 5, title: "Dead domain", host: "dead.example" }],
    });
    expect(verdict.ok).toBe(false);
  });

  it("rejects markup in the narrative", () => {
    const verdict = validateNarrative({
      narrative: "**الصفحة اتشالت** من الموقع [[1]]",
      itemIds: [1],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(false);
  });

  it("accepts a count written with Arabic-Indic digits", () => {
    const verdict = validateNarrative({
      narrative: "٣ روابط اتكسرت في الفحص ده.",
      itemIds: [],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(true);
  });

  it("caps the narrative at 120 words", () => {
    const long = Array.from({ length: 200 }, () => "راجع").join(" ");
    const verdict = validateNarrative({
      narrative: long,
      itemIds: [],
      facts: facts(),
      libraryTitles,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.narrative.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(120);
    }
  });
});

describe("digest facts", () => {
  it("treats a run with no changes at all as all-clear", () => {
    const allClear = facts({
      counts: { newlyBroken: 0, recovered: 0, newlySuspicious: 0, stillBroken: 0, redirected: 0, dismissed: 0 },
      items: { newlyBroken: [], recovered: [], newlySuspicious: [], stillBroken: [], redirected: [] },
    });
    expect(factsHaveNoChanges(allClear)).toBe(true);
    expect(factsHaveNoChanges(facts())).toBe(false);
  });
});
