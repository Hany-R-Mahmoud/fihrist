import type { BookmarkJob } from "../../drizzle/schema";
import * as db from "../db";
import { aiTaggingConfigured, suggestAiTags } from "./aiTagging";
import { suggestAutomaticTags } from "./bookmarkUtils";
import { errorMessage, runAndRecordHealthCheck } from "./healthHistory";
import { scrapeBookmarkMetadata } from "./linkSafety";
import { publishFihristEvent } from "./liveEvents";

export type JobProcessResult = {
  jobId: number;
  bookmarkId: number;
  type: "scrape" | "health_check";
  status: "completed" | "failed" | "skipped";
};

export async function processBookmarkJob(job: BookmarkJob): Promise<JobProcessResult> {
  const claimed = await db.claimBookmarkJob(job.id);
  if (!claimed) {
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "skipped" };
  }
  const leaseToken = claimed.leaseToken;

  const bookmark = await db.getBookmark(job.userId, job.bookmarkId);
  if (!bookmark) {
    await db.markJobFailed(job.id, leaseToken, "Bookmark no longer exists");
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "failed" };
  }

  try {
    if (job.type === "scrape") {
      await db.updateBookmarkMetadata(job.userId, bookmark.id, {
        ingestionStatus: "processing",
        scrapeError: null,
      });
      const metadata = await scrapeBookmarkMetadata(bookmark.normalizedUrl);
      await db.updateBookmarkMetadata(job.userId, bookmark.id, {
        ...metadata,
        ingestionStatus: "ready",
        scrapeError: null,
      });
      await db.replaceAutomaticTags(
        job.userId,
        bookmark.id,
        suggestAutomaticTags({
          url: bookmark.normalizedUrl,
          title: metadata.title,
          description: metadata.description,
          contentText: metadata.contentText,
        })
      );
      // AI tag suggestions (BYOK): best-effort, stored as PENDING for approval.
      // Never fails the ingestion job; rule-based tags above already applied.
      if (aiTaggingConfigured()) {
        try {
          const fresh = await db.getBookmark(job.userId, bookmark.id);
          if (fresh) {
            const { suggestions, promptTokens, completionTokens } = await suggestAiTags(fresh);
            const created = await db.createAiTagSuggestions(
              job.userId,
              bookmark.id,
              suggestions.map(suggestion => ({ ...suggestion, promptTokens, completionTokens }))
            );
            if (created > 0) {
              publishFihristEvent({ type: "aiTags.updated", userId: job.userId, bookmarkId: bookmark.id });
            }
          }
        } catch (error) {
          console.error("[Fihrist] AI tag suggestion failed (non-fatal)", error);
        }
      }
      // The check that runs at ingestion time is a check like any other — it is
      // recorded too, with no run attached (it was not part of a health run).
      const ingestionCheck = await runAndRecordHealthCheck({
        userId: job.userId,
        bookmarkId: bookmark.id,
        url: bookmark.normalizedUrl,
        runId: null,
        jobId: job.id,
      });
      if (ingestionCheck.failed) {
        throw new Error(ingestionCheck.message ?? errorMessage(new Error("unknown")));
      }
      publishFihristEvent({ type: "bookmark.updated", userId: job.userId, bookmarkId: bookmark.id });
      publishFihristEvent({ type: "health.updated", userId: job.userId, bookmarkId: bookmark.id });
    } else {
      const outcome = await runAndRecordHealthCheck({
        userId: job.userId,
        bookmarkId: bookmark.id,
        url: bookmark.normalizedUrl,
        runId: job.runId ?? null,
        jobId: job.id,
      });
      publishFihristEvent({ type: "health.updated", userId: job.userId, bookmarkId: bookmark.id });
      if (outcome.failed) {
        await db.markJobFailed(
          job.id,
          leaseToken,
          outcome.message ?? "The page could not be processed. Try again later."
        );
        return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "failed" };
      }
    }

    await db.markJobCompleted(job.id, leaseToken);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "completed" };
  } catch (error) {
    const message = error instanceof Error
      ? errorMessage(error)
      : "The page could not be processed. Try again later.";
    if (job.type === "scrape") {
      await db.updateBookmarkMetadata(job.userId, bookmark.id, {
        ingestionStatus: "failed",
        scrapeError: message,
      });
      publishFihristEvent({ type: "bookmark.updated", userId: job.userId, bookmarkId: bookmark.id });
    }
    await db.markJobFailed(job.id, leaseToken, message);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "failed" };
  }
}

/**
 * Open a health run, or join the one already running.
 *
 * A second "check links now" during a sweep must not start a second run: that
 * would produce a second report for one sweep. A single-bookmark check is
 * always its own run, because it is not a sweep.
 */
export async function openHealthRun(
  userId: number,
  trigger: "weekly" | "manual",
  startedAt = new Date()
) {
  const running = await db.listRunningHealthRuns(userId);
  const reusable = running.find(run => run.trigger !== "single");
  if (reusable) return { run: reusable, reused: true };
  return { run: await db.startHealthRun(userId, { trigger, startedAt }), reused: false };
}

/**
 * Queue a health check for every bookmark in the library. `runId` is the
 * explicit run these jobs belong to — attribution is never inferred.
 */
export async function queueHealthChecksForUser(
  userId: number,
  runId: number,
  limit?: number
) {
  let queuedCount = 0;
  let afterId = 0;
  while (limit === undefined || queuedCount < limit) {
    const bookmarkIds = await db.listBookmarkIds(
      userId,
      afterId,
      Math.min(limit === undefined ? 100 : limit - queuedCount, 100)
    );
    if (!bookmarkIds.length) break;
    for (const bookmark of bookmarkIds) {
      if (!(await db.hasActiveBookmarkJob(userId, bookmark.id, "health_check"))) {
        await db.createBookmarkJob(userId, bookmark.id, "health_check", runId);
        queuedCount += 1;
      }
      afterId = bookmark.id;
      if (limit !== undefined && queuedCount >= limit) break;
    }
  }
  return queuedCount;
}
