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

import { db } from "../data.js";
import { checkLinkHealth, probeMissingPage } from "./linkSafety.js";
import { suspectedSoft404, visibleBodyHash } from "./healthEvidence.js";
import type { CheckedHealthState } from "../../shared/healthLanguage.js";

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
    const bookmark = await db.getBookmark(params.userId, params.bookmarkId);
    const run = params.runId ? await db.getHealthRun(params.userId, params.runId) : null;
    const isSweep = Boolean(run && run.trigger !== "single");
    const deep = (() => {
      try { return new URL(params.url).pathname.split("/").filter(Boolean).length >= 1; }
      catch { return false; }
    })();
    let healthStatus = result.healthStatus;
    let failureClass = result.failureClass;
    let healthError = result.healthError;
    let soft404Streak = bookmark?.soft404Streak ?? 0;
    let soft404LastRunId = bookmark?.soft404LastRunId ?? null;
    if (params.runId && deep && result.httpStatus && result.httpStatus>=200 &&
        result.httpStatus<300 && (healthStatus === "healthy" || healthStatus === "redirected") &&
        result.bodySample) {
      const host = new URL(params.url).hostname;
      let hostProbe = await db.getHostProbe(host, params.runId);
      if (!hostProbe) {
        const probe = await probeMissingPage(params.url);
        hostProbe = await db.saveHostProbe({
          host,runId:params.runId,resultStatus:probe.status,
          finalUrl:probe.finalUrl,title:probe.title,
          bodyHash:probe.bodySample ? visibleBodyHash(probe.bodySample):null,
          bodySample:probe.bodySample.slice(0,8192)
        });
      }
      if (hostProbe && suspectedSoft404(
        {finalUrl:result.finalUrl,title:result.titleSnapshot,bodySample:result.bodySample},
        {status:hostProbe.resultStatus,finalUrl:hostProbe.finalUrl,title:hostProbe.title,
          bodySample:hostProbe.bodySample??""}
      )) {
        failureClass = "soft_404";
        soft404Streak = (isSweep && bookmark?.failureClass === "soft_404" &&
          bookmark?.soft404LastRunId !== params.runId)
          ? (bookmark.soft404Streak ?? 0) + 1 : 1;
        soft404LastRunId = params.runId;
        healthStatus = isSweep && soft404Streak >= 2 ? "broken" : "needs_review";
        healthError = "Looks removed — the site answers with an empty error page";
      }
    }
    if (failureClass !== "soft_404" && (healthStatus==="healthy" || healthStatus==="redirected")) {
      soft404Streak = 0; soft404LastRunId = null;
    }
    const persistentClasses = ["timeout","tls","inconclusive"];
    const previous = isSweep ? await db.listChecksForBookmark(params.userId,params.bookmarkId) : [];
    const repeatedInRun = previous.some(c => c.runId===params.runId);
    const persistentFailureStreak = isSweep && persistentClasses.includes(failureClass)
      ? repeatedInRun ? (bookmark?.persistentFailureStreak ?? 0) :
        (bookmark?.persistentFailureClass===failureClass ? (bookmark.persistentFailureStreak??0)+1 : 1)
      : healthStatus==="healthy" || healthStatus==="redirected" ? 0 : (bookmark?.persistentFailureStreak??0);
    const persistentFailure = persistentClasses.includes(failureClass)
      ? persistentFailureStreak>=3 : healthStatus==="healthy" || healthStatus==="redirected"
        ? false : (bookmark?.persistentFailure??false);
    const persistentFailureClass = persistentClasses.includes(failureClass) ? failureClass :
      healthStatus==="healthy" || healthStatus==="redirected" ? null : (bookmark?.persistentFailureClass??null);
    const durationMs = Date.now() - startedAt;
    await db.insertHealthCheck({
      userId: params.userId,
      bookmarkId: params.bookmarkId,
      runId: params.runId,
      jobId: params.jobId ?? null,
      checkedAt: new Date(),
      status: healthStatus,
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      durationMs, error: healthError,
      failureClass,networkCode:result.networkCode,
      redirectChain:result.redirectChain,finalHost:result.finalHost,
      titleSnapshot:result.titleSnapshot,bodyHash:result.bodyHash,
      contentLength:result.contentLength,moveClass:result.moveClass,
    });
    await db.updateBookmarkHealth(params.userId, params.bookmarkId, {
      healthStatus, httpStatus:result.httpStatus, healthError, lastCheckedAt:new Date(),
      failureClass,moveClass:result.moveClass,soft404Streak,soft404LastRunId,
      persistentFailure,persistentFailureClass,persistentFailureStreak,
    });
    return {
      status: healthStatus, httpStatus:result.httpStatus,finalUrl:result.finalUrl,
      durationMs,error:healthError,failed:false,
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
      failureClass:"inconclusive",moveClass:"none",
    });
    await db.updateBookmarkHealth(params.userId, params.bookmarkId, {
      healthStatus: "needs_review",
      httpStatus: null,
      healthError: message,
      lastCheckedAt: new Date(),failureClass:"inconclusive",moveClass:"none",
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
  checks: Array<{ status: CheckedHealthState; checkedAt: Date }>,
  rollup?: {prunedCheckCount:number;firstCheckedAt:Date|null;firstBrokenAt:Date|null;
    lastPrunedStatus:string|null;statusSince:Date|null;openStreak:number;brokenSince:Date|null}
): TimelineSummary {
  if (!checks.length) {
    return {
      totalChecks: rollup?.prunedCheckCount??0,
      firstCheckedAt: rollup?.firstCheckedAt??null,
      firstBrokenAt: rollup?.firstBrokenAt??null,
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

  const sameSpell=rollup?.lastPrunedStatus===latest.status &&
    rollup?.statusSince?.getTime()===currentStatusSince?.getTime();
  const lostRepeats=sameSpell ? (rollup?.openStreak??0) : 0;
  return {
    totalChecks:checks.length+(rollup?.prunedCheckCount??0),
    firstCheckedAt:rollup?.firstCheckedAt??firstCheckedAt,
    firstBrokenAt:rollup?.firstBrokenAt??firstBroken?.checkedAt??null,
    currentStatus:latest.status,
    currentStatusSince,
    brokenStreak:latest.status==="broken" ? streak+lostRepeats : 0,
    brokenSince:latest.status==="broken" ? brokenSince : null,
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
