import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { DIGEST_SECTION_CAP, RotDigestCard, type DigestItem, type DigestRecord } from "./RotDigestCard";

afterEach(cleanup);

function item(overrides: Partial<DigestItem> & { bookmarkId: number }): DigestItem {
  return {
    title: `Link ${overrides.bookmarkId}`,
    host: "example.com",
    url: `https://example.com/${overrides.bookmarkId}`,
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

function digest(overrides: Partial<DigestRecord> = {}): DigestRecord {
  return {
    id: 1,
    runId: 7,
    facts: {
      runId: 7,
      trigger: "weekly",
      runStartedAt: "2026-01-01T00:00:00.000Z",
      runCompletedAt: "2026-01-01T01:00:00.000Z",
      checked: 214,
      skipped: 0,
      counts: {
        newlyBroken: 3,
        recovered: 1,
        newlySuspicious: 2,
        stillBroken: 1,
        redirected: 1,
        dismissed: 0,
      },
      items: {
        newlyBroken: [
          item({ bookmarkId: 1 }),
          item({ bookmarkId: 2 }),
          item({ bookmarkId: 3 }),
        ],
        recovered: [item({ bookmarkId: 4, status: "healthy", httpStatus: 200 })],
        newlySuspicious: [
          item({ bookmarkId: 5, status: "needs_review", httpStatus: 403 }),
          item({ bookmarkId: 6, status: "needs_review", httpStatus: 403 }),
        ],
        stillBroken: [item({ bookmarkId: 7, streak: 4 })],
        redirected: [
          item({
            bookmarkId: 8,
            status: "redirected",
            httpStatus: 200,
            finalUrl: "https://example.com/new",
          }),
        ],
      },
      generatedAt: "2026-01-01T01:00:00.000Z",
    },
    narrative: null,
    narrativeStatus: "none",
    model: null,
    promptTokens: null,
    completionTokens: null,
    estimatedPromptTokens: 420,
    readAt: null,
    createdAt: new Date("2026-01-01T01:00:00.000Z"),
    ...overrides,
  };
}

const noop = {
  onOpenTimeline: vi.fn(),
  onDelete: vi.fn(),
  onDismiss: vi.fn(),
  onUpdateUrl: vi.fn(),
  onOpenFilter: vi.fn(),
};

describe("RotDigestCard", () => {
  it("opens with the numbers line before any prose", () => {
    renderWithProviders(<RotDigestCard digest={digest()} {...noop} />);

    const numbers = screen.getByText(
      "Weekly check: 214 checked • 3 broke • 1 recovered • 2 need review"
    );
    expect(numbers).toBeTruthy();
    // The numbers line is the first thing in the card body.
    expect(numbers.compareDocumentPosition(screen.getByText("Broke")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the Arabic-first numbers line in the canonical shape", () => {
    renderWithProviders(<RotDigestCard digest={digest()} {...noop} />, { locale: "ar" });

    expect(
      screen.getByText("الفحص الأسبوعي: اتفحص 214 • انكسر 3 • رجع 1 • محتاج مراجعة 2")
    ).toBeTruthy();
  });

  it("caps each section at six items and collapses the rest into a link", async () => {
    const user = userEvent.setup();
    const onOpenFilter = vi.fn();
    const many = Array.from({ length: 9 }, (_unused, index) => item({ bookmarkId: 100 + index }));
    const record = digest();
    record.facts!.items.newlyBroken = many;
    record.facts!.counts.newlyBroken = 9;

    renderWithProviders(<RotDigestCard digest={record} {...noop} onOpenFilter={onOpenFilter} />);

    expect(screen.getAllByText(/^Link 10\d$/).length).toBe(DIGEST_SECTION_CAP);
    expect(screen.getByText("+3 more broken — open the filter")).toBeTruthy();
    await user.click(screen.getByText("+3 more broken — open the filter"));
    expect(onOpenFilter).toHaveBeenCalledWith("broken");
  });

  it("gives every item an action, and a redirected item the address update", async () => {
    const user = userEvent.setup();
    const onOpenTimeline = vi.fn();
    const onDelete = vi.fn();
    const onDismiss = vi.fn();
    const onUpdateUrl = vi.fn();

    renderWithProviders(
      <RotDigestCard
        digest={digest()}
        {...noop}
        onOpenTimeline={onOpenTimeline}
        onDelete={onDelete}
        onDismiss={onDismiss}
        onUpdateUrl={onUpdateUrl}
      />
    );

    const openHistory = screen.getAllByRole("button", { name: "Open its history" });
    await user.click(openHistory[0]);
    expect(onOpenTimeline).toHaveBeenCalledWith(1);

    const remove = screen.getAllByRole("button", { name: "Delete" });
    await user.click(remove[0]);
    expect(onDelete).toHaveBeenCalledWith(1);

    const dismiss = screen.getAllByRole("button", { name: "Ignore until the next check" });
    await user.click(dismiss[0]);
    expect(onDismiss).toHaveBeenCalledWith(1);

    // Only the redirected item offers the address update.
    const updateButtons = screen.getAllByRole("button", { name: "Update link to the new address" });
    expect(updateButtons).toHaveLength(1);
    await user.click(updateButtons[0]);
    expect(onUpdateUrl).toHaveBeenCalledWith(8);
  });

  it("badges a facts-only digest honestly and shows the token estimate", () => {
    renderWithProviders(<RotDigestCard digest={digest()} {...noop} />);

    expect(screen.getByText("Structured summary")).toBeTruthy();
    expect(screen.getByText("estimated ~420 tokens")).toBeTruthy();
  });

  it("shows the model and the actual token counts once a narrative was written", () => {
    renderWithProviders(
      <RotDigestCard
        digest={digest({
          narrative: "الرابط الأول اتشالت صفحته.",
          narrativeStatus: "ok",
          model: "gpt-5-mini",
          promptTokens: 410,
          completionTokens: 60,
        })}
        {...noop}
      />
    );

    expect(screen.getByText("gpt-5-mini · ~410 in / 60 out tokens")).toBeTruthy();
    expect(screen.getByText("الرابط الأول اتشالت صفحته.")).toBeTruthy();
  });

  it("marks an unread report and shows the all-clear line when nothing changed", () => {
    const record = digest();
    record.facts!.counts = {
      newlyBroken: 0,
      recovered: 0,
      newlySuspicious: 0,
      stillBroken: 0,
      redirected: 0,
      dismissed: 0,
    };
    record.facts!.items = {
      newlyBroken: [],
      recovered: [],
      newlySuspicious: [],
      stillBroken: [],
      redirected: [],
    };

    renderWithProviders(<RotDigestCard digest={record} unread {...noop} />);

    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText(/All clear/)).toBeTruthy();
  });

  it("says so plainly when a report cannot be read, instead of vanishing", () => {
    renderWithProviders(<RotDigestCard digest={{ ...digest(), facts: null }} {...noop} />);

    expect(screen.getByRole("alert").textContent).toContain("could not be read");
    // The numbers line cannot be drawn, so the card must not pretend it can.
    expect(screen.queryByText(/Weekly check:/)).toBeNull();
  });

  it("lets a past report be re-opened from the card", async () => {
    const user = userEvent.setup();
    const onSelectDigest = vi.fn();
    const past = { ...digest(), id: 99, createdAt: new Date("2025-12-01T01:00:00.000Z") };

    renderWithProviders(
      <RotDigestCard digest={digest()} pastDigests={[past]} onSelectDigest={onSelectDigest} {...noop} />
    );

    await user.click(screen.getByText(/Dec 1, 2025/));
    expect(onSelectDigest).toHaveBeenCalledWith(99);
  });
  it("shows the outcome of a dismissal instead of the action", () => {
    renderWithProviders(
      <RotDigestCard digest={digest()} resolvedItems={{ 1: { state: "dismissed" } }} {...noop} />
    );

    // Only the dismissed item shows the outcome; the other seven keep the action.
    expect(screen.getAllByText("Ignored until the next check")).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Ignore until the next check" })
    ).toHaveLength(7);
  });

  it("points the open link at the new address after an update", () => {
    renderWithProviders(
      <RotDigestCard
        digest={digest()}
        resolvedItems={{ 1: { state: "updated", url: "https://example.com/new-address" } }}
        {...noop}
      />
    );

    const links = screen.getAllByRole("link", { name: /Open link/ });
    expect(links[0].getAttribute("href")).toBe("https://example.com/new-address");
    expect(links[1].getAttribute("href")).toBe("https://example.com/2");
    expect(screen.getByText("Link updated to the new address")).toBeTruthy();
  });
}, 20000);
