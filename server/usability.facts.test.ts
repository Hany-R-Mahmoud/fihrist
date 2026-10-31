// TOKEN_POLICY_BATCHED_EXECUTION: deterministic acceptance fixtures, no network or AI.
import { it, expect } from "vitest";
import { candidateGroups, duplicateUrl } from "../shared/duplicates";
import { habitsFacts } from "../shared/habits";
import { deriveTopicShelves } from "../shared/topicGrouping";
it("distinguishes exact, tracked, near-title, content and unrelated links", () => {
  const make = (
    id: number,
    url: string,
    title: string,
    contentText: string | null = null
  ) => ({
    id,
    url,
    host: new URL(url).host,
    title,
    contentText,
    createdAt: new Date(id),
  });
  const rows = [
    make(1, "https://EXAMPLE.com/a/#part", "first"),
    make(2, "https://example.com/a", "second"),
    make(3, "https://example.com/a?utm_source=mail&fbclid=test", "third"),
    make(4, "https://example.com/b", "one two three four five"),
    make(5, "https://example.com/c", "one two three four five six"),
    make(6, "https://example.com/unrelated", "entirely unrelated material"),
    make(7, "https://other.com/d", "one two three four five"),
  ];
  expect(duplicateUrl(rows[0].url)).toBe(duplicateUrl(rows[2].url));
  expect(candidateGroups(rows).map(g => g.items.map(b => b.id))).toEqual([
    [1, 2, 3],
    [4, 5],
  ]);
  const sample =
    "one two three four five six seven eight nine ten eleven twelve";
  expect(
    candidateGroups([
      make(8, "https://example.com/content1", "alpha", sample),
      make(9, "https://example.com/content2", "beta", sample),
    ])[0].evidence
  ).toEqual(["similar-content"]);
});
it("computes UTC weekly habits and oldest unread without changing shelf grouping", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1,
    url: `https://example.org/${i}`,
    host: "example.org",
    title: "Reading",
    description: null,
    contentText: null,
    collectionId: null,
    createdAt: new Date(`2026-10-${24 + i}T12:00:00Z`),
    readingStatus:
      i === 2 ? "reading" : i === 3 ? "read" : i === 4 ? "archived" : "unread",
    tags: [
      { name: "Research", source: "manual" },
      { name: "Books", source: "manual" },
    ],
  }));
  const facts = habitsFacts(rows, new Date("2026-10-31T12:00:00Z"));
  expect(facts.added).toBe(5);
  expect(facts.counts).toEqual({ unread: 4, reading: 1, read: 1, archived: 1 });
  expect(facts.unread.map(b => b.id)).toEqual([1, 2, 6, 7]);
  expect(facts.tags[0].count).toBe(7);
  expect(
    deriveTopicShelves(rows).some(
      g => g.normalizedName === "topic:shared:books:research"
    )
  ).toBe(true);
});
