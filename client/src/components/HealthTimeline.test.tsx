import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test-utils";
import {
  HealthTimeline,
  TIMELINE_CHANGE_THRESHOLD,
  TIMELINE_PAGE_SIZE,
  type TimelineEntry,
} from "./HealthTimeline";

afterEach(cleanup);

const at = (day: number) => new Date(Date.UTC(2026, 0, day, 12));

function entry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: 0,
    bookmarkId: 1,
    runId: 10,
    jobId: null,
    checkedAt: at(15),
    status: "healthy",
    httpStatus: null,
    finalUrl: null,
    durationMs: 120,
    error: null,
    runStartedAt: at(15),
    runCompletedAt: at(15),
    runTrigger: "weekly",
    transition: null,
    ...overrides,
  };
}

/** Newest first, like the server returns it. `statuses[0]` is the latest check. */
function history(statuses: Array<Partial<TimelineEntry>>) {
  return statuses.map((partial, index) =>
    entry({
      checkedAt: at(statuses.length - index),
      runStartedAt: at(statuses.length - index),
      ...partial,
    })
  );
}

describe("HealthTimeline", () => {
  it("shows the plain-language sentence and never a bare state or code", () => {
    const entries = history([
      { id: 2, status: "broken", httpStatus: 404, error: "The page is gone (HTTP 404)." },
      { id: 1, status: "healthy", httpStatus: 200 },
    ]);

    renderWithProviders(
      <HealthTimeline
        entries={entries}
        summary={{
          totalChecks: 2,
          firstCheckedAt: at(1),
          firstBrokenAt: at(2),
          currentStatus: "broken",
          currentStatusSince: at(2),
          brokenStreak: 1,
          brokenSince: at(2),
        }}
      />
    );

    expect(screen.getByText("The page was removed from the site")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
    // The code may follow the sentence, but never alone.
    expect(screen.getByText("HTTP 404")).toBeTruthy();
    expect(screen.getAllByText("Broken").length).toBeGreaterThan(0);
  });

  it("states the first broken date, the current status and the broken streak", () => {
    renderWithProviders(
      <HealthTimeline
        entries={history([
          { id: 3, status: "broken", httpStatus: 404 },
          { id: 2, status: "broken", httpStatus: 404 },
          { id: 1, status: "healthy", httpStatus: 200 },
        ])}
        summary={{
          totalChecks: 3,
          firstCheckedAt: at(1),
          firstBrokenAt: at(2),
          currentStatus: "broken",
          currentStatusSince: at(2),
          brokenStreak: 2,
          brokenSince: at(2),
        }}
      />
    );

    expect(screen.getByText("First broken")).toBeTruthy();
    expect(screen.getByText("Current status")).toBeTruthy();
    expect(screen.getByText("Broken for 2 checks")).toBeTruthy();
    expect(screen.getByText("Total checks")).toBeTruthy();
  });

  it("says plainly when a link was never broken", () => {
    renderWithProviders(
      <HealthTimeline
        entries={history([{ id: 1, status: "healthy", httpStatus: 200 }])}
        summary={{
          totalChecks: 1,
          firstCheckedAt: at(1),
          firstBrokenAt: null,
          currentStatus: "healthy",
          currentStatusSince: at(1),
          brokenStreak: 0,
          brokenSince: null,
        }}
      />
    );

    expect(screen.getByText("Never broken")).toBeTruthy();
  });

  it("defaults to all checks for a short history and to changes only for a long one", () => {
    const short = history(
      Array.from({ length: TIMELINE_CHANGE_THRESHOLD }, (_unused, index) => ({
        id: index + 1,
        status: "healthy" as const,
        httpStatus: 200,
      }))
    );
    const { unmount } = renderWithProviders(
      <HealthTimeline
        entries={short}
        summary={{
          totalChecks: short.length,
          firstCheckedAt: at(1),
          firstBrokenAt: null,
          currentStatus: "healthy",
          currentStatusSince: at(1),
          brokenStreak: 0,
          brokenSince: null,
        }}
      />
    );
    expect(screen.getByText(/Showing All checks/)).toBeTruthy();
    unmount();

    const long = history(
      Array.from({ length: TIMELINE_CHANGE_THRESHOLD + 1 }, (_unused, index) => ({
        id: index + 1,
        status: "healthy" as const,
        httpStatus: 200,
        transition: index === 0 ? ("newly_suspicious" as const) : null,
      }))
    );
    renderWithProviders(
      <HealthTimeline
        entries={long}
        summary={{
          totalChecks: long.length,
          firstCheckedAt: at(1),
          firstBrokenAt: null,
          currentStatus: "healthy",
          currentStatusSince: at(1),
          brokenStreak: 0,
          brokenSince: null,
        }}
      />
    );
    expect(screen.getByText(/Showing Changes only/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
  });

  it("defaults a long history to changes only, even though the data arrives after mount", () => {
    // The app mounts the timeline while the query is still in flight: the
    // first render has no entries, and the history lands a moment later.
    const long = history(
      Array.from({ length: TIMELINE_CHANGE_THRESHOLD + 4 }, (_unused, index) => ({
        id: index + 1,
        status: "healthy" as const,
        httpStatus: 200,
      }))
    );
    const summary = {
      totalChecks: long.length,
      firstCheckedAt: at(1),
      firstBrokenAt: null,
      currentStatus: "healthy" as const,
      currentStatusSince: at(1),
      brokenStreak: 0,
      brokenSince: null,
    };

    const { rerender } = renderWithProviders(
      <HealthTimeline entries={[]} summary={summary} loading />
    );
    rerender(<HealthTimeline entries={long} summary={summary} loading={false} />);

    expect(screen.getByText(/Showing Changes only/)).toBeTruthy();
  });

  it("bounds the render at 50 entries and offers to load more", async () => {
    const user = userEvent.setup();
    const many = history(
      Array.from({ length: TIMELINE_PAGE_SIZE + 10 }, (_unused, index) => ({
        id: index + 1,
        status: "healthy" as const,
        httpStatus: 200,
      }))
    );

    renderWithProviders(
      <HealthTimeline
        entries={many}
        summary={{
          totalChecks: many.length,
          firstCheckedAt: at(1),
          firstBrokenAt: null,
          currentStatus: "healthy",
          currentStatusSince: at(1),
          brokenStreak: 0,
          brokenSince: null,
        }}
      />
    );

    // A long history opens on "changes only"; switch to every check to bound
    // the render.
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByText("Working")).toHaveLength(TIMELINE_PAGE_SIZE);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getAllByText("Working")).toHaveLength(TIMELINE_PAGE_SIZE + 10);
  });

  it("says the history starts with the next check when nothing was recorded", () => {
    renderWithProviders(
      <HealthTimeline
        entries={[]}
        summary={{
          totalChecks: 0,
          firstCheckedAt: null,
          firstBrokenAt: null,
          currentStatus: null,
          currentStatusSince: null,
          brokenStreak: 0,
          brokenSince: null,
        }}
      />
    );

    expect(screen.getByText("No history yet")).toBeTruthy();
    expect(screen.getByText(/History starts with the next check/)).toBeTruthy();
  });

  it("renders the Arabic-first surface with the plain-language pairing", () => {
    renderWithProviders(
      <HealthTimeline
        entries={history([
          { id: 1, status: "broken", httpStatus: 404, error: "The page is gone (HTTP 404)." },
        ])}
        summary={{
          totalChecks: 1,
          firstCheckedAt: at(1),
          firstBrokenAt: at(1),
          currentStatus: "broken",
          currentStatusSince: at(1),
          brokenStreak: 1,
          brokenSince: at(1),
        }}
      />,
      { locale: "ar" }
    );

    expect(screen.getByText("الصفحة اتشالت من الموقع")).toBeTruthy();
    // The state appears as text in the row and in the summary.
    expect(screen.getAllByText("مكسور").length).toBeGreaterThan(0);
  });
}, 20000);
