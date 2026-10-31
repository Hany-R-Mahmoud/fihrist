import type { BookmarkJob } from "../../drizzle/schema.js";
import { randomUUID } from "node:crypto";
import { db } from "../data.js";
import { aiTaggingConfigured, suggestAiTags } from "./aiTagging.js";
import { suggestAutomaticTags } from "./bookmarkUtils.js";
import { errorMessage, runAndRecordHealthCheck } from "./healthHistory.js";
import { scrapeBookmarkMetadata } from "./linkSafety.js";
import { publishFihristEvent } from "./liveEvents.js";
import { lookupArchivedCopy } from "./wayback.js";
import { refreshTopicShelves } from "./topicShelves.js";

export type JobProcessResult = {
  jobId: number;
  bookmarkId: number;
  type: "scrape" | "health_check" | "wayback_lookup" | "shelf_refresh";
  status: "completed" | "failed" | "skipped";
};

export async function processBookmarkJob(job: BookmarkJob): Promise<JobProcessResult> {
  // Acquire the DB-backed host lease BEFORE claiming the job. If another
  // invocation owns the host, defer this job without consuming an attempt.
  const earlyBookmark=await db.getBookmark(job.userId, job.bookmarkId);
  let pacingHost:string|null=null;
  let pacingToken:string|null=null;
  if (earlyBookmark && process.env.FIHRIST_MODE==="cloud" &&
    ["scrape","health_check","wayback_lookup"].includes(job.type)) {
    const host=job.type==="wayback_lookup"?"archive.org":earlyBookmark.host;
    const token=randomUUID();
    if(!(await db.acquireDomainSlot(host,token))) {
      await db.delayBookmarkJob(job.id,1000);
      return {jobId:job.id,bookmarkId:job.bookmarkId,type:job.type,status:"skipped"};
    }
    pacingHost=host;pacingToken=token;
  }
  const claimed = await db.claimBookmarkJob(job.id);
  if (!claimed) {
    if(pacingHost && pacingToken)await db.releaseDomainSlot(pacingHost,pacingToken);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "skipped" };
  }
  const leaseToken = claimed.leaseToken;

  const bookmark = earlyBookmark ?? await db.getBookmark(job.userId, job.bookmarkId);
  if (!bookmark) {
    await db.markJobFailed(job.id, leaseToken, "Bookmark no longer exists");
    if(pacingHost && pacingToken)await db.releaseDomainSlot(pacingHost,pacingToken);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "failed" };
  }

  try {
    if (job.type === "shelf_refresh") {
      await refreshTopicShelves(job.userId);
    } else if (job.type === "wayback_lookup") {
      if (bookmark.healthStatus === "broken" &&
        (bookmark.archiveLookupRunId !== (job.runId ?? null) || !bookmark.archiveCheckedAt)) {
        const found=await lookupArchivedCopy(bookmark.normalizedUrl);
        await db.setBookmarkArchiveResult(job.userId,bookmark.id,
          found.archiveUrl,found.archiveTimestamp,job.runId??null);
        publishFihristEvent({type:"bookmark.updated",userId:job.userId,bookmarkId:bookmark.id});
      }
    } else if (job.type === "scrape") {
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
      // Saving/importing retrieves metadata only. Health checks require a
      // separate user request and must not be silently started by ingestion.
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
      if (outcome.status==="broken" &&
        bookmark.archiveLookupRunId !== (job.runId ?? null) &&
        !(await db.hasActiveBookmarkJob(job.userId,bookmark.id,"wayback_lookup"))) {
        await db.createBookmarkJob(job.userId,bookmark.id,"wayback_lookup",job.runId??null);
      }
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
  } finally {
    if(pacingHost && pacingToken) await db.releaseDomainSlot(pacingHost,pacingToken);
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
      const candidate = await db.getBookmark(userId, bookmark.id);
      if (candidate?.checksDisabled) { afterId = bookmark.id; continue; }
      if (!(await db.hasBookmarkJobInRun(userId, bookmark.id, runId)) &&
          !(await db.hasActiveBookmarkJob(userId, bookmark.id, "health_check"))) {
        await db.createBookmarkJob(userId, bookmark.id, "health_check", runId);
        queuedCount += 1;
      }
      afterId = bookmark.id;
      if (limit !== undefined && queuedCount >= limit) break;
    }
  }
  return queuedCount;
}
