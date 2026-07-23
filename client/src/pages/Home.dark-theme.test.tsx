import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import type { Collection } from "../../../drizzle/schema";
import type { BookmarkRecord } from "../../../server/db";
import { BookmarkCard, CollectionsView, ConfirmDialog, HealthView } from "./Home";

const bookmark = {
  id: 41,
  userId: 7,
  collectionId: 3,
  url: "https://example.org/rtl-reference",
  normalizedUrl: "https://example.org/rtl-reference",
  host: "example.org",
  title: "مرجع محفوظ",
  description: "A saved reference for reading.",
  faviconUrl: null,
  imageUrl: null,
  contentText: "Useful content for the saved link.",
  language: "ar",
  contentDirection: "rtl",
  ingestionStatus: "ready",
  scrapeError: null,
  healthStatus: "healthy",
  lastCheckedAt: new Date(),
  lastHttpStatus: 200,
  healthError: null,
  notes: null,
  analysisSummary: "A concise saved reference.",
  savedReason: "It supports a recurring research topic.",
  savingBenefit: "It shortens future research time.",
  analysisStatus: "ready",
  analysisError: null,
  analyzedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  collectionName: "Research",
  tags: [],
} as unknown as BookmarkRecord;

const collection = {
  id: 3,
  userId: 7,
  name: "Research",
  createdAt: new Date(),
  updatedAt: new Date(),
} as Collection;

function renderDark(children: React.ReactNode) {
  return render(<ThemeProvider defaultTheme="dark" switchable>{children}</ThemeProvider>);
}

function ToggleHarness() {
  const { theme, toggleTheme } = useTheme();
  return (
    <>
      <button onClick={toggleTheme}>Toggle theme</button>
      <span data-testid="active-theme">{theme}</span>
      <BookmarkCard
        bookmark={bookmark}
        collections={[collection]}
        moving={false}
        onMove={vi.fn()}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
        onEditNotes={vi.fn()}
        onDelete={vi.fn()}
        selected={false}
        onToggleSelection={vi.fn()}
        onAnalyze={vi.fn()}
        analyzing={false}
      />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => cleanup());

describe("Fihrist dark-mode semantic surfaces", () => {
  it("uses direct semantic surface classes for RTL bookmark cards, collections, health status, and destructive dialogs", () => {
    const { container } = renderDark(
      <>
        <BookmarkCard
          bookmark={bookmark}
          collections={[collection]}
          moving={false}
          onMove={vi.fn()}
          onAddTag={vi.fn()}
          onRemoveTag={vi.fn()}
          onEditNotes={vi.fn()}
          onDelete={vi.fn()}
          selected={false}
          onToggleSelection={vi.fn()}
          onAnalyze={vi.fn()}
          analyzing={false}
        />
        <CollectionsView
          collections={[collection]}
          bookmarks={[bookmark]}
          selectedCollectionId={null}
          onSelectCollection={vi.fn()}
          collectionDraft=""
          setCollectionDraft={vi.fn()}
          createCollection={vi.fn()}
          creating={false}
          editingCollection={null}
          editingCollectionName=""
          onEdit={vi.fn()}
          setEditingCollectionName={vi.fn()}
          onCancelEdit={vi.fn()}
          onSaveEdit={vi.fn()}
          renamePending={false}
          onDelete={vi.fn()}
        />
        <HealthView
          data={{
            bookmarks: [bookmark],
            counts: { healthy: 1, redirected: 0, broken: 0, unchecked: 0 },
            settings: { enabled: true, lastRunAt: new Date() },
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
          deletePending={false}
        />
        <ConfirmDialog
          open
          onOpenChange={vi.fn()}
          title="Remove saved link?"
          description="This action cannot be undone."
          confirmLabel="Remove"
          pending={false}
          onConfirm={vi.fn()}
        />
      </>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(container.querySelector("article.fihrist-card")).toBeTruthy();
    expect(container.querySelector("section[aria-label='Saved link insight'].fihrist-insight")).toBeTruthy();
    expect(container.querySelector(".fihrist-health-callout")).toBeTruthy();
    expect(container.querySelector(".fihrist-health-healthy")).toBeTruthy();
    const collectionCard = Array.from(container.querySelectorAll("article.fihrist-card")).find(card => card.textContent?.includes("1 link"));
    expect(collectionCard).toBeTruthy();
    expect(screen.getByRole("dialog").classList.contains("fihrist-panel")).toBe(true);
  });

  it("switches the rendered RTL bookmark card into dark mode through the interactive theme control", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider defaultTheme="light" switchable><ToggleHarness /></ThemeProvider>);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("active-theme").textContent).toContain("dark");
    expect(screen.getByRole("link", { name: /مرجع محفوظ/ }).getAttribute("dir")).toBe("rtl");
    expect(document.querySelector("article.fihrist-card")).toBeTruthy();
  });
});
