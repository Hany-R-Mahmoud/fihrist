import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkRecord } from "../db";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: mocks.invokeLLM,
  listLLMModels: mocks.listLLMModels,
}));

import { generateBookmarkAnalysis } from "./bookmarkAnalysis";

function sampleBookmark(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: 5,
    userId: 41,
    collectionId: 9,
    url: "https://example.org/research",
    normalizedUrl: "https://example.org/research",
    host: "example.org",
    title: "Evidence-backed research",
    description: "A focused research resource.",
    faviconUrl: null,
    imageUrl: null,
    contentText: "Useful reference content.",
    language: "en",
    contentDirection: "ltr",
    ingestionStatus: "ready",
    scrapeError: null,
    healthStatus: "unchecked",
    lastCheckedAt: null,
    lastHttpStatus: null,
    healthError: null,
    notes: "Use for the upcoming literature review.",
    createdAt: new Date(),
    updatedAt: new Date(),
    analysisSummary: null,
    savedReason: null,
    savingBenefit: null,
    analysisStatus: "pending",
    analysisError: null,
    analyzedAt: null,
    collectionName: "Research",
    tags: [{ id: 1, name: "research", source: "manual" }],
    ...overrides,
  } as BookmarkRecord;
}

describe("generateBookmarkAnalysis", () => {
  beforeEach(() => {
    mocks.invokeLLM.mockReset();
    mocks.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
  });

  it("returns only schema-valid concise analysis fields", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        summary: "A concise evidence-focused research reference.",
        savedReason: "May be useful for the upcoming literature review.",
        savingBenefit: "Provides a reusable source for grounded comparisons.",
      }) } }],
    });

    await expect(generateBookmarkAnalysis(sampleBookmark())).resolves.toEqual({
      summary: "A concise evidence-focused research reference.",
      savedReason: "May be useful for the upcoming literature review.",
      savingBenefit: "Provides a reusable source for grounded comparisons.",
    });
  });

  it("rejects malformed AI output and limits untrusted page text in the prompt", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ summary: "Only one field" }) } }],
    });

    await expect(generateBookmarkAnalysis(sampleBookmark({ contentText: "x".repeat(13_000) }))).rejects.toThrow("AI analysis returned an invalid response");
    const request = mocks.invokeLLM.mock.calls[0]?.[0];
    const userMessage = request.messages[1].content as string;
    expect(userMessage).toContain("x".repeat(11_999));
    expect(userMessage).not.toContain("x".repeat(12_500));
  });
});
