import type { BookmarkJob } from "../../drizzle/schema.js";
import { db } from "../data.js";
import { aiTaggingConfigured, suggestAiTags } from "./aiTagging.js";
import { suggestAutomaticTags } from "./bookmarkUtils.js";
import { checkLinkHealth, scrapeBookmarkMetadata } from "./linkSafety.js";
import { publishFihristEvent } from "./liveEvents.js";

export type JobProcessResult = {
  jobId: number;
  bookmarkId: number;
  type: "scrape" | "health_check";
  status: "completed" | "failed" | "skipped";
};

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) return "The page did not respond in time.";
  if (message.includes("robots.txt disallows")) return "The page's robots.txt disallows retrieval.";
  if (message.includes("publicly reachable") || message.includes("private or internal")) return "The page target is not publicly reachable.";
  if (message.includes("too many redirects")) return "The page redirected too many times.";
  return "The page could not be processed. Try again later.";
}

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
    } else {
      await db.updateBookmarkHealth(job.userId, bookmark.id, {
        // A failed checker is inconclusive, not evidence that a link is dead.
        healthStatus: "needs_review",
        httpStatus: null,
        healthError: message,
        lastCheckedAt: new Date(),
      });
      publishFihristEvent({ type: "health.updated", userId: job.userId, bookmarkId: bookmark.id });
    }
    await db.markJobFailed(job.id, leaseToken, message);
    return { jobId: job.id, bookmarkId: job.bookmarkId, type: job.type, status: "failed" };
  }
}

export async function queueHealthChecksForUser(userId: number, limit?: number) {
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
        await db.createBookmarkJob(userId, bookmark.id, "health_check");
        queuedCount += 1;
      }
      afterId = bookmark.id;
      if (limit !== undefined && queuedCount >= limit) break;
    }
  }
  return queuedCount;
}
