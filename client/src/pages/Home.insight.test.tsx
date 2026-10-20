import { cleanup, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookmarkRecord } from "../../../server/db";
import { renderWithProviders } from "@/test-utils";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { BookmarkCard } from "./Home";

afterEach(cleanup);

const baseBookmark = {
  id: 29,
  userId: 4,
  collectionId: null,
  url: "https://example.org/insight",
  normalizedUrl: "https://example.org/insight",
  host: "example.org",
  title: "Saved research reference",
  description: "Useful saved material.",
  faviconUrl: null,
  imageUrl: null,
  contentText: "A useful reference that is ready for analysis.",
  language: "en",
  contentDirection: "ltr",
  ingestionStatus: "ready",
  scrapeError: null,
  healthStatus: "healthy",
  lastCheckedAt: null,
  lastHttpStatus: 200,
  healthError: null,
  notes: null,
  analysisSummary: "A concise summary of the saved reference.",
  savedReason: "May be useful for an upcoming research task.",
  savingBenefit: "It speeds up future fact finding.",
  analysisStatus: "ready",
  analysisError: null,
  analyzedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  collectionName: null,
  tags: [],
} as unknown as BookmarkRecord;

const cardProps = {
  collections: [],
  moving: false,
  onMove: vi.fn(),
  onAddTag: vi.fn(),
  onRemoveTag: vi.fn(),
  onEditNotes: vi.fn(),
  onDelete: vi.fn(),
  onOpenTimeline: vi.fn(),
  selected: false,
  onToggleSelection: vi.fn(),
  analyzing: false,
  aiConfigured: false,
  aiSuggestions: [],
  onSuggestAiTags: vi.fn(),
  suggestingAiTags: false,
  suggestingBookmarkId: null,
  onApproveAiTag: vi.fn(),
  onRejectAiTag: vi.fn(),
};

describe("Fihrist bookmark insight card", () => {
  it("renders saved AI analysis and exposes a safe failed-analysis retry action", () => {
    const onAnalyze = vi.fn();
    const { rerender } = renderWithProviders(<BookmarkCard bookmark={baseBookmark} onAnalyze={onAnalyze} {...cardProps} />);

    expect(screen.getByLabelText("Saved link insight").textContent).toContain("A concise summary of the saved reference.");
    expect(screen.getByText(/Why save:/).parentElement?.textContent).toContain("May be useful for an upcoming research task.");
    expect(screen.getByText(/Benefit:/).parentElement?.textContent).toContain("It speeds up future fact finding.");

    rerender(
      <LocaleProvider defaultLocale="en" switchable={false}>
        <BookmarkCard
          bookmark={{ ...baseBookmark, analysisStatus: "failed", analysisSummary: null, analysisError: "Analysis could not be completed. Please try again in a moment." }}
          onAnalyze={onAnalyze}
          {...cardProps}
        />
      </LocaleProvider>
    );

    expect(screen.getByRole("alert").textContent).toContain("Analysis could not be completed.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAnalyze).toHaveBeenCalledWith(baseBookmark.id);
  });
});
