import { describe, expect, it } from "vitest";
import {
  classifyTransition,
  summarizeTimeline,
  withTransitions,
  type HealthTransitionKind,
} from "./healthHistory";

describe("shared transition definitions", () => {
  it("marks a first broken check as newly broken", () => {
    expect(classifyTransition(null, "broken")).toBe("newly_broken");
  });

  it("marks a broken check after a non-broken check as newly broken", () => {
    expect(classifyTransition("healthy", "broken")).toBe("newly_broken");
    expect(classifyTransition("needs_review", "broken")).toBe("newly_broken");
    expect(classifyTransition("redirected", "broken")).toBe("newly_broken");
  });

  it("marks a broken check after a broken check as still broken", () => {
    expect(classifyTransition("broken", "broken")).toBe("still_broken");
  });

  it("marks a healthy or redirected check after a broken check as recovered", () => {
    expect(classifyTransition("broken", "healthy")).toBe("recovered");
    expect(classifyTransition("broken", "redirected")).toBe("recovered");
  });

  it("marks a needs_review check as newly suspicious unless it was already under review", () => {
    expect(classifyTransition(null, "needs_review")).toBe("newly_suspicious");
    expect(classifyTransition("healthy", "needs_review")).toBe("newly_suspicious");
    expect(classifyTransition("broken", "needs_review")).toBe("newly_suspicious");
    expect(classifyTransition("needs_review", "needs_review")).toBeNull();
  });

  it("reports no transition for a link that simply stays the same", () => {
    expect(classifyTransition("healthy", "healthy")).toBeNull();
    expect(classifyTransition("redirected", "redirected")).toBeNull();
    expect(classifyTransition("healthy", "redirected")).toBeNull();
    expect(classifyTransition("redirected", "healthy")).toBeNull();
  });

  it("treats the first check of a link that is already broken as newly broken", () => {
    const kinds: HealthTransitionKind[] = ["healthy", "healthy", "broken", "broken"]
      .map((status, index, all) =>
        classifyTransition(index === 0 ? null : (all[index - 1] as never), status as never)
      )
      .filter((kind): kind is HealthTransitionKind => kind !== null);
    expect(kinds).toEqual(["newly_broken", "still_broken"]);
  });
});

describe("timeline summary", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 0, day, 12));

  it("reports nothing for a link with no recorded checks", () => {
    expect(summarizeTimeline([])).toEqual({
      totalChecks: 0,
      firstCheckedAt: null,
      firstBrokenAt: null,
      currentStatus: null,
      currentStatusSince: null,
      brokenStreak: 0,
      brokenSince: null,
    });
  });

  it("finds the first broken date and the current broken streak", () => {
    const summary = summarizeTimeline([
      { status: "healthy", checkedAt: at(1) },
      { status: "healthy", checkedAt: at(8) },
      { status: "broken", checkedAt: at(15) },
      { status: "broken", checkedAt: at(22) },
      { status: "broken", checkedAt: at(29) },
    ]);

    expect(summary.totalChecks).toBe(5);
    expect(summary.firstCheckedAt).toEqual(at(1));
    expect(summary.firstBrokenAt).toEqual(at(15));
    expect(summary.currentStatus).toBe("broken");
    expect(summary.currentStatusSince).toEqual(at(15));
    expect(summary.brokenStreak).toBe(3);
    expect(summary.brokenSince).toEqual(at(15));
  });

  it("clears the broken streak once the link recovers", () => {
    const summary = summarizeTimeline([
      { status: "broken", checkedAt: at(1) },
      { status: "broken", checkedAt: at(8) },
      { status: "healthy", checkedAt: at(15) },
    ]);

    expect(summary.firstBrokenAt).toEqual(at(1));
    expect(summary.currentStatus).toBe("healthy");
    expect(summary.currentStatusSince).toEqual(at(15));
    expect(summary.brokenStreak).toBe(0);
    expect(summary.brokenSince).toBeNull();
  });

  it("reports the start of the current spell of a repeated status", () => {
    const summary = summarizeTimeline([
      { status: "healthy", checkedAt: at(1) },
      { status: "needs_review", checkedAt: at(8) },
      { status: "needs_review", checkedAt: at(15) },
    ]);

    expect(summary.currentStatus).toBe("needs_review");
    expect(summary.currentStatusSince).toEqual(at(8));
  });
});

describe("withTransitions", () => {
  it("annotates a newest-first history with each check's transition", () => {
    const entries = withTransitions([
      { id: 4, status: "broken" as const },
      { id: 3, status: "broken" as const },
      { id: 2, status: "healthy" as const },
      { id: 1, status: "healthy" as const },
    ]);

    expect(entries.map(entry => entry.transition)).toEqual([
      "still_broken",
      "newly_broken",
      null,
      null,
    ]);
  });
});
