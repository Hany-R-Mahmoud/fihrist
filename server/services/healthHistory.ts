/**
 * Check-history persistence — the single recording point for health checks.
 *
 * Every check (single, manual, or part of a full-drain run) goes through
 * `runAndRecordHealthCheck`. It writes one `health_checks` row and keeps the
 * bookmark row's latest-state fields exactly as they were before.
 *
 * The transition definitions below are the shared vocabulary: the timeline
 * summary and the rot digest both compute from `classifyTransition` and from
 * nothing else, so the two surfaces can never disagree about the same run.
 */

import * as db from "../db";
import { checkLinkHealth } from "./linkSafety";
import type { CheckedHealthState } from "../../shared/healthLanguage";

export type HealthTransitionKind =
  | "newly_broken"
  | "recovered"
  | "newly_suspicious"
  | "still_broken";

/**
 * Compare a check against its immediately previous recorded check.
 *
 * - newly broken    = previous was not `broken` (or there was none) and this is `broken`
 * - recovered       = previous was `broken` and this is `healthy` or `redirected`
 * - newly suspicious = previous was not `needs_review` and this is `needs_review`
 * - still broken    = previous was `broken` and this is `broken`
 *
 * Everything else is not a transition.
 */
export function classifyTransition(
  previous: CheckedHealthState | null,
  current: CheckedHealthState
): HealthTransitionKind | null {
  if (current === "broken") {
    return previous === "broken" ? "still_broken" : "newly_broken";
  }
  if (current === "needs_review") {
    return previous === "needs_review" ? null : "newly_suspicious";
  }
  if (previous === "broken") {
    return "recovered";
  }
  return null;
}

export type HealthCheckOutcome = {
  status: CheckedHealthState;
  httpStatus: number | null;
  finalUrl: string | null;
  durationMs: number;
  error: string | null;
  /** True when the checker itself threw — the result is inconclusive, not dead. */
  failed: boolean;
  message: string | null;
};

/** Friendly message for a processing failure. Shared with the scrape path. */
export function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) {
    return "The page did not respond in time.";
  }
  if (message.includes("robots.txt disallows")) {
    return "The page's robots.txt disallows retrieval.";
  }
  if (message.includes("publicly reachable") || message.includes("private or internal")) {
    return "The page target is not publicly reachable.";
  }
  if (message.includes("too many redirects")) {
    return "The page redirected too many times.";
  }
  return "The page could not be processed. Try again later.";
}

/**
 * Run a health check and record it.
 *
 * `durationMs` is measured here, around the check — the classifier itself
 * times nothing.
 */
export async function runAndRecordHealthCheck(params: {
  userId: number;
  bookmarkId: number;
  url: string;
  runId: number | null;
  jobId?: number | null;
}): Promise<HealthCheckOutcome> {
  const startedAt = Date.now();
  try {
    const result = await checkLinkHealth(params.url);
    const durationMs = Date.now() - startedAt;
    await db.insertHealthCheck({
      userId: params.userId,
      bookmarkId: params.bookmarkId,
      runId: params.runId,
      jobId: params.jobId ?? null,
      checkedAt: new Date(),
      status: result.healthStatus,
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      durationMs,
      error: result.healthError,
    });
    await db.updateBookmarkHealth(params.userId, params.bookmarkId, {
      healthStatus: result.healthStatus,
      httpStatus: result.httpStatus,
      healthError: result.healthError,
      lastCheckedAt: new Date(),
    });
    return {
      status: result.healthStatus,
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      durationMs,
      error: result.healthError,
      failed: false,
      message: null,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = errorMessage(error);
    // A failed checker is inconclusive, not evidence that a link is dead.
    await db.insertHealthCheck({
      userId: params.userId,
      bookmarkId: params.bookmarkId,
      runId: params.runId,
      jobId: params.jobId ?? null,
      checkedAt: new Date(),
      status: "needs_review",
      httpStatus: null,
      finalUrl: null,
      durationMs,
      error: message,
    });
    await db.updateBookmarkHealth(params.userId, params.bookmarkId, {
      healthStatus: "needs_review",
      httpStatus: null,
      healthError: message,
      lastCheckedAt: new Date(),
    });
    return {
      status: "needs_review",
      httpStatus: null,
      finalUrl: null,
      durationMs,
      error: message,
      failed: true,
      message,
    };
  }
}

export type TimelineSummary = {
  totalChecks: number;
  firstCheckedAt: Date | null;
  /** The first recorded `broken` check — null when the link was never broken. */
  firstBrokenAt: Date | null;
  currentStatus: CheckedHealthState | null;
  /** When the current status was first recorded (the start of the current spell). */
  currentStatusSince: Date | null;
  /** Consecutive `broken` checks ending at the latest one — 0 when not broken. */
  brokenStreak: number;
  /** When the current broken streak began. */
  brokenSince: Date | null;
};

/**
 * Summarise one bookmark's history. `checks` must be ordered oldest first.
 */
export function summarizeTimeline(
  checks: Array<{ status: CheckedHealthState; checkedAt: Date }>
): TimelineSummary {
  if (!checks.length) {
    return {
      totalChecks: 0,
      firstCheckedAt: null,
      firstBrokenAt: null,
      currentStatus: null,
      currentStatusSince: null,
      brokenStreak: 0,
      brokenSince: null,
    };
  }

  const firstCheckedAt = checks[0].checkedAt;
  const firstBroken = checks.find(check => check.status === "broken") ?? null;
  const latest = checks[checks.length - 1];

  let streak = 0;
  let brokenSince: Date | null = null;
  for (let index = checks.length - 1; index >= 0; index -= 1) {
    if (checks[index].status !== "broken") break;
    streak += 1;
    brokenSince = checks[index].checkedAt;
  }

  let currentStatusSince: Date | null = latest.checkedAt;
  for (let index = checks.length - 2; index >= 0; index -= 1) {
    if (checks[index].status !== latest.status) break;
    currentStatusSince = checks[index].checkedAt;
  }

  return {
    totalChecks: checks.length,
    firstCheckedAt,
    firstBrokenAt: firstBroken?.checkedAt ?? null,
    currentStatus: latest.status,
    currentStatusSince,
    brokenStreak: latest.status === "broken" ? streak : 0,
    brokenSince: latest.status === "broken" ? brokenSince : null,
  };
}

/**
 * Attach each check's transition to it. `entries` must be newest first — the
 * previous check of an entry is the one after it in the list.
 *
 * The timeline's "changes only" filter reads these transitions, so the
 * transition rules stay implemented exactly once.
 */
export function withTransitions<T extends { status: CheckedHealthState }>(
  entries: T[]
): Array<T & { transition: HealthTransitionKind | null }> {
  return entries.map((entry, index) => {
    const previous = entries[index + 1];
    return {
      ...entry,
      transition: classifyTransition(previous ? previous.status : null, entry.status),
    };
  });
}
