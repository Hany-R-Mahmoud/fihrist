import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookmarkRecord } from "../../../server/db";
import type { Collection } from "../../../drizzle/schema";
import { renderWithProviders } from "@/test-utils";
import { BookmarksView, HealthView } from "./Home";

afterEach(cleanup);

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});

const bookmark = {
  id: 19,
  userId: 4,
  collectionId: null,
  url: "https://example.org/reading",
  normalizedUrl: "https://example.org/reading",
  host: "example.org",
  title: "Reading list resource",
  description: "A helpful reference.",
  faviconUrl: null,
  imageUrl: null,
  contentText: "Useful reading material.",
  language: "en",
  contentDirection: "ltr",
  ingestionStatus: "ready",
  scrapeError: null,
  healthStatus: "healthy",
  lastCheckedAt: null,
  lastHttpStatus: 200,
  healthError: null,
  notes: null,
  analysisSummary: null,
  savedReason: null,
  savingBenefit: null,
  analysisStatus: "pending",
  analysisError: null,
  analyzedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  collectionName: null,
  tags: [],
} as unknown as BookmarkRecord;

const collection = {
  id: 7,
  userId: 4,
  name: "Research",
  createdAt: new Date(),
  updatedAt: new Date(),
} as Collection;

const props = {
  bookmarks: [bookmark],
  collections: [] as Collection[],
  loading: false,
  search: "",
  onSearch: vi.fn(),
  selectedCollectionId: null,
  onClearCollection: vi.fn(),
  onAddBookmark: vi.fn(),
  onMove: vi.fn(),
  moving: false,
  onAddTag: vi.fn(),
  onRemoveTag: vi.fn(),
  onEditNotes: vi.fn(),
  onDelete: vi.fn(),
  onOpenTimeline: vi.fn(),
  onToggleAll: vi.fn(),
  onClearSelection: vi.fn(),
  onBulkMove: vi.fn(),
  bulkMoving: false,
  onBulkAddTag: vi.fn(),
  bulkTagging: false,
  onAnalyze: vi.fn(),
  analyzingBookmarkId: null,
  aiConfigured: false,
  aiSuggestions: [],
  onSuggestAiTags: vi.fn(),
  suggestingAiTags: false,
  suggestingBookmarkId: null,
  onApproveAiTag: vi.fn(),
  onRejectAiTag: vi.fn(),
};

describe("BookmarksView bulk selection", () => {
  it("keeps bookmark selection keyboard-operable and exposes bulk tag controls when items are selected", async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    renderWithProviders(
      <BookmarksView
        {...props}
        selectedIds={new Set([bookmark.id])}
        allVisibleSelected
        onToggleSelection={onToggleSelection}
      />
    );

    const selection = screen.getByRole("checkbox", { name: "Select Reading list resource" });
    selection.focus();
    expect(document.activeElement).toBe(selection);
    await user.keyboard(" ");
    expect(onToggleSelection).toHaveBeenCalledWith(bookmark.id, false);

    const tagInput = screen.getByPlaceholderText("Add tag to selected");
    fireEvent.change(tagInput, { target: { value: "reference" } });
    const addTag = screen.getByRole("button", { name: "Add" });
    addTag.focus();
    expect(document.activeElement).toBe(addTag);
    await user.keyboard("{Enter}");
    expect(props.onBulkAddTag).toHaveBeenCalledWith("reference");
  });

  it("routes selected bookmarks to a collection from the rendered bulk toolbar", async () => {
    const user = userEvent.setup();
    const onBulkMove = vi.fn();
    const { container } = renderWithProviders(
      <BookmarksView
        {...props}
        collections={[collection]}
        selectedIds={new Set([bookmark.id])}
        allVisibleSelected
        onToggleSelection={vi.fn()}
        onBulkMove={onBulkMove}
      />
    );

    const bulkToolbar = container.querySelector<HTMLElement>("[role='toolbar'][aria-label='Bulk bookmark actions']");
    const bulkCollectionSelect = bulkToolbar?.querySelector<HTMLElement>("[role='combobox']");
    expect(bulkCollectionSelect).toBeTruthy();
    await user.click(bulkCollectionSelect as HTMLElement);
    await user.click(screen.getByRole("option", { name: "Research" }));
    expect(onBulkMove).toHaveBeenCalledWith(7);
  });
}, 20000);

describe("HealthView cleanup", () => {
  it("filters confirmed broken links and requests deletion for the selected rows", async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    const confirmedBroken = {
      ...bookmark,
      id: 20,
      title: "Broken resource",
      healthStatus: "broken",
      httpStatus: 404,
      healthError: "HTTP 404",
    } as BookmarkRecord;
    const needsReview = {
      ...bookmark,
      id: 21,
      title: "Timed out resource",
      healthStatus: "needs_review",
      httpStatus: null,
      healthError: "Request timed out",
    } as BookmarkRecord;

    renderWithProviders(
      <HealthView
        data={{
          bookmarks: [confirmedBroken, needsReview],
          counts: { healthy: 0, redirected: 0, broken: 1, unchecked: 0, needs_review: 1 },
          settings: { enabled: false, lastRunAt: null },
        }}
        loading={false}
        onQueue={vi.fn()}
        queuePending={false}
        onEnable={vi.fn()}
        enablePending={false}
        onPause={vi.fn()}
        pausePending={false}
        onOpenBookmark={vi.fn()}
        onRequestDelete={onRequestDelete}
        onOpenTimeline={vi.fn()}
        deletePending={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Show confirmed broken links, 1" }));
    expect(screen.getByText("Broken resource")).toBeTruthy();
    expect(screen.queryByText("Timed out resource")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select Broken resource" }));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(onRequestDelete).toHaveBeenCalledWith([20]);
  });

  it("names the active filter when it is not one of the summary cards", () => {
    const confirmedBroken = {
      ...bookmark,
      id: 30,
      title: "Another broken resource",
      healthStatus: "broken",
      httpStatus: 404,
      healthError: "HTTP 404",
    } as BookmarkRecord;

    renderWithProviders(
      <HealthView
        data={{
          bookmarks: [confirmedBroken],
          counts: { healthy: 0, redirected: 0, broken: 1, unchecked: 0, needs_review: 0 },
          settings: { enabled: false, lastRunAt: null },
        }}
        loading={false}
        onQueue={vi.fn()}
        queuePending={false}
        onEnable={vi.fn()}
        enablePending={false}
        onPause={vi.fn()}
        pausePending={false}
        onOpenBookmark={vi.fn()}
        onRequestDelete={vi.fn()}
        onOpenTimeline={vi.fn()}
        deletePending={false}
        filterRequest={{ filter: "broken", nonce: 1 }}
      />
    );

    expect(screen.getByText("Showing: All broken")).toBeTruthy();
  });
}, 20000);
