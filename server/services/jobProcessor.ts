import type { BookmarkJob } from "../../drizzle/schema";
import * as db from "../db";
import { suggestAutomaticTags } from "./bookmarkUtils";
import { checkLinkHealth, scrapeBookmarkMetadata } from "./linkSafety";
import { publishFihristEvent } from "./liveEvents";
import { generateBookmarkAnalysis } from "./bookmarkAnalysis";

export type JobProcessResult = {
  jobId: number;
  bookmarkId: number;
  type: "scrape" | "health_check";
  status: "completed" | "failed" | "skipped";
};

export type PendingJobProcessSummary = {
  results: JobProcessResult[];
  remainingCount: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2000) : "Job processing failed";
}

export async function processBookmarkJob(job: BookmarkJob): Promise<JobProcessResult> {
  const claimed = await db.markJobProcessing(job.id);
  if (!claimed) {
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "skipped" };
  }

  const bookmark = await db.getBookmark(job.userId, job.bookmarkId);
  if (!bookmark) {
    await db.markJobFailed(job.id, "Bookmark no longer exists");
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
      const analyzedBookmark = await db.getBookmark(job.userId, bookmark.id);
      if (analyzedBookmark) {
        await db.updateBookmarkAnalysis(job.userId, bookmark.id, {
          analysisStatus: "processing",
          analysisError: null,
        });
        publishFihristEvent({ type: "bookmark.updated", userId: job.userId, bookmarkId: bookmark.id });
        try {
          const analysis = await generateBookmarkAnalysis(analyzedBookmark);
          await db.updateBookmarkAnalysis(job.userId, bookmark.id, {
            analysisSummary: analysis.summary,
            savedReason: analysis.savedReason,
            savingBenefit: analysis.savingBenefit,
            analysisStatus: "ready",
            analysisError: null,
            analyzedAt: new Date(),
          });
        } catch (analysisError) {
          await db.updateBookmarkAnalysis(job.userId, bookmark.id, {
            analysisStatus: "failed",
            analysisError: errorMessage(analysisError).slice(0, 500),
          });
        }
        publishFihristEvent({ type: "bookmark.updated", userId: job.userId, bookmarkId: bookmark.id });
      }
      const health = await checkLinkHealth(bookmark.normalizedUrl);
      await db.updateBookmarkHealth(job.userId, bookmark.id, {
        ...health,
        lastCheckedAt: new Date(),
      });
      publishFihristEvent({ type: "bookmark.updated", userId: job.userId, bookmarkId: bookmark.id });
      publishFihristEvent({ type: "health.updated", userId: job.userId, bookmarkId: bookmark.id });
    } else {
      const health = await checkLinkHealth(bookmark.normalizedUrl);
      await db.updateBookmarkHealth(job.userId, bookmark.id, {
        ...health,
        lastCheckedAt: new Date(),
      });
      publishFihristEvent({ type: "health.updated", userId: job.userId, bookmarkId: bookmark.id });
    }

    await db.markJobCompleted(job.id);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "completed" };
  } catch (error) {
    const message = errorMessage(error);
    if (job.type === "scrape") {
      await db.updateBookmarkMetadata(job.userId, bookmark.id, {
        ingestionStatus: "failed",
        scrapeError: message,
      });
      publishFihristEvent({ type: "bookmark.updated", userId: job.userId, bookmarkId: bookmark.id });
    } else {
      await db.updateBookmarkHealth(job.userId, bookmark.id, {
        healthStatus: "broken",
        httpStatus: null,
        healthError: message,
        lastCheckedAt: new Date(),
      });
      publishFihristEvent({ type: "health.updated", userId: job.userId, bookmarkId: bookmark.id });
    }
    await db.markJobFailed(job.id, message);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "failed" };
  }
}

export async function processPendingJobsForUser(
  userId: number,
  type: "scrape" | "health_check" | undefined,
  limit = 4
): Promise<PendingJobProcessSummary> {
  const jobs = await db.listPendingJobsForUser(userId, type, limit);
  const results: JobProcessResult[] = [];
  const queue = jobs.slice();
  const concurrency = type === "health_check" ? 10 : 2;
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      if (job) results.push(await processBookmarkJob(job));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker())
  );
  return {
    results,
    remainingCount: await db.countPendingJobsForUser(userId, type),
  };
}

export async function queueHealthChecksForUser(userId: number, limit?: number) {
  const bookmarks = await db.listBookmarks(userId);
  let queuedCount = 0;
  const targetBookmarks = limit === undefined ? bookmarks : bookmarks.slice(0, limit);
  for (const bookmark of targetBookmarks) {
    if (!(await db.hasActiveBookmarkJob(userId, bookmark.id, "health_check"))) {
      await db.createBookmarkJob(userId, bookmark.id, "health_check");
      queuedCount += 1;
    }
  }
  return queuedCount;
}
