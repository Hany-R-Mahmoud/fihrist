import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "./data.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import {
  normalizeBookmarkUrl,
  parseNetscapeBookmarks,
} from "./services/bookmarkUtils.js";
import { exportNetscapeBookmarks } from "./services/bookmarkExport.js";
import { queueHealthChecksForUser } from "./services/jobProcessor.js";
import { assertPublicUrlTarget } from "./services/linkSafety.js";
import { generateBookmarkAnalysis } from "./services/bookmarkAnalysis.js";
import { aiTaggingConfigured, suggestAiTags } from "./services/aiTagging.js";
import { publishFihristEvent } from "./services/liveEvents.js";

const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Collection name is required")
  .max(160, "Collection names must be 160 characters or fewer");

function databaseError(error: unknown, fallback: string): never {
  const message = error instanceof Error ? error.message : fallback;
  if (message.toLocaleLowerCase().includes("duplicate")) {
    throw new TRPCError({ code: "CONFLICT", message: "That name is already in use" });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: fallback });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
  }),

  collections: router({
    list: protectedProcedure.query(({ ctx }) => db.listCollections(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ name: collectionNameSchema }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.createCollection(ctx.user.id, input.name);
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return databaseError(error, "Unable to create this collection");
        }
      }),
    rename: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), name: collectionNameSchema }))
      .mutation(async ({ ctx, input }) => {
        try {
          const collection = await db.renameCollection(ctx.user.id, input.id, input.name);
          if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
          return collection;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return databaseError(error, "Unable to rename this collection");
        }
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const collection = await db.getCollection(ctx.user.id, input.id);
        if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
        await db.deleteCollection(ctx.user.id, input.id);
        return { success: true } as const;
      }),
  }),

  bookmarks: router({
    list: protectedProcedure
      .input(
        z
          .object({
            collectionId: z.number().int().positive().optional(),
            healthStatus: z
              .enum(["unchecked", "healthy", "redirected", "broken", "needs_review"])
              .optional(),
            cursor: z.string().max(200).optional(),
            limit: z.number().int().min(1).max(50).optional(),
          })
          .optional()
      )
      .query(({ ctx, input }) => db.listBookmarkPage(ctx.user.id, input)),
    exportNetscape: protectedProcedure.query(async ({ ctx }) => {
      const bookmarks = await db.listBookmarks(ctx.user.id, {}, 10_001);
      if (bookmarks.length > 10_000) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "This library is too large for a single browser export. Export it in smaller batches.",
        });
      }
      return {
        fileName: "fihrist-bookmarks.html",
        html: exportNetscapeBookmarks(bookmarks),
      };
    }),
    search: protectedProcedure
      .input(
        z.object({
          query: z.string().trim().max(300),
          cursor: z.string().max(200).optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
      )
      .query(({ ctx, input }) => db.searchBookmarkPage(ctx.user.id, input.query, input.cursor, input.limit)),
    add: protectedProcedure
      .input(
        z.object({
          url: z.string().trim().min(1).max(2048),
          collectionId: z.number().int().positive().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let normalized;
        try {
          normalized = await assertPublicUrlTarget(input.url);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Invalid URL",
          });
        }
        if (
          input.collectionId !== undefined &&
          input.collectionId !== null &&
          !(await db.getCollection(ctx.user.id, input.collectionId))
        ) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
        }
        const existing = await db.getBookmarkByNormalizedUrl(ctx.user.id, normalized.normalizedUrlHash);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "That URL is already saved" });
        }
        const bookmark = await db.createBookmarkWithJob({
          userId: ctx.user.id,
          collectionId: input.collectionId ?? null,
          ...normalized,
        }, "scrape");
        if (!bookmark) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bookmark was not saved" });
        return bookmark;
      }),
    importNetscape: protectedProcedure
      .input(z.object({ html: z.string().min(1).max(2_000_000) }))
      .mutation(async ({ ctx, input }) => {
        let parsed;
        try {
          parsed = parseNetscapeBookmarks(input.html);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Could not parse that bookmark file",
          });
        }
        if (!parsed.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No valid HTTP or HTTPS bookmarks were found",
          });
        }

        const existingCollections = await db.listCollections(ctx.user.id);
        const collectionMap = new Map(
          existingCollections.map(collection => [collection.name.toLocaleLowerCase(), collection])
        );
        const imported = [] as number[];
        const importedCollectionIds = new Set<number>();
        let uncategorizedCount = 0;

        for (const item of parsed) {
          let normalized;
          try {
            normalized = await assertPublicUrlTarget(item.url);
          } catch {
            continue;
          }
          if (await db.getBookmarkByNormalizedUrl(ctx.user.id, normalized.normalizedUrlHash)) {
            continue;
          }
          const collectionName = item.collectionPath.join(" / ").slice(0, 160);
          let collectionId: number | null = null;
          if (collectionName) {
            const key = collectionName.toLocaleLowerCase();
            let collection = collectionMap.get(key);
            if (!collection) {
              try {
                collection = await db.createCollection(ctx.user.id, collectionName);
              } catch {
                collection = (await db.listCollections(ctx.user.id)).find(
                  candidate => candidate.name.toLocaleLowerCase() === key
                );
              }
              if (collection) collectionMap.set(key, collection);
            }
            collectionId = collection?.id ?? null;
          }

          const bookmark = await db.createBookmarkWithJob({
            userId: ctx.user.id,
            collectionId,
            ...normalized,
          }, "scrape");
          if (bookmark) {
            if (item.title) {
              await db.updateBookmarkMetadata(ctx.user.id, bookmark.id, {
                title: item.title.slice(0, 512),
                ingestionStatus: "pending",
              });
            }
            imported.push(bookmark.id);
            if (collectionId === null) uncategorizedCount += 1;
            else importedCollectionIds.add(collectionId);
          }
        }

        return {
          importedCount: imported.length,
          skippedCount: Math.max(parsed.length - imported.length, 0),
          collectionCount: importedCollectionIds.size,
          uncategorizedCount,
        };
      }),
    updateNotes: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          notes: z.string().max(20_000).nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const bookmark = await db.updateBookmarkNotes(ctx.user.id, input.id, input.notes);
        if (!bookmark) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        return bookmark;
      }),
    move: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          collectionId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const bookmark = await db.moveBookmark(ctx.user.id, input.id, input.collectionId);
          if (!bookmark) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
          return bookmark;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "NOT_FOUND", message: "Collection or bookmark not found" });
        }
      }),
    bulkMove: protectedProcedure
      .input(
        z.object({
          ids: z.array(z.number().int().positive()).min(1).max(100),
          collectionId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const updatedCount = await db.bulkMoveBookmarks(
            ctx.user.id,
            input.ids,
            input.collectionId
          );
          return { updatedCount };
        } catch (error) {
          if (error instanceof Error && error.message === "Collection not found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
          }
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to move the selected bookmarks" });
        }
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.getBookmark(ctx.user.id, input.id))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        }
        await db.deleteBookmark(ctx.user.id, input.id);
        return { success: true } as const;
      }),
    bulkRemove: protectedProcedure
      .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) }))
      .mutation(async ({ ctx, input }) => ({
        deletedCount: await db.bulkDeleteBookmarks(ctx.user.id, input.ids),
      })),
    addTag: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(96),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.addManualTag(ctx.user.id, input.id, input.name);
        } catch {
          throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        }
      }),
    bulkAddTag: protectedProcedure
      .input(
        z.object({
          ids: z.array(z.number().int().positive()).min(1).max(100),
          name: z.string().trim().min(2).max(96),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const updatedCount = await db.bulkAddManualTag(ctx.user.id, input.ids, input.name);
        return { updatedCount };
      }),
    removeTag: protectedProcedure
      .input(
        z.object({ id: z.number().int().positive(), tagId: z.number().int().positive() })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.removeTagFromBookmark(ctx.user.id, input.id, input.tagId);
        } catch {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tag or bookmark not found" });
        }
      }),
    analyze: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const bookmark = await db.getBookmark(ctx.user.id, input.id);
        if (!bookmark) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        }
        if (!bookmark.title && !bookmark.description && !bookmark.contentText) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Bookmark metadata is still being prepared",
          });
        }
        await db.updateBookmarkAnalysis(ctx.user.id, bookmark.id, {
          analysisStatus: "processing",
          analysisError: null,
        });
        publishFihristEvent({ type: "bookmark.updated", userId: ctx.user.id, bookmarkId: bookmark.id });
        try {
          const analysis = await generateBookmarkAnalysis(bookmark);
          const updated = await db.updateBookmarkAnalysis(ctx.user.id, bookmark.id, {
            analysisSummary: analysis.summary,
            savedReason: analysis.savedReason,
            savingBenefit: analysis.savingBenefit,
            analysisStatus: "ready",
            analysisError: null,
            analyzedAt: new Date(),
          });
          publishFihristEvent({ type: "bookmark.updated", userId: ctx.user.id, bookmarkId: bookmark.id });
          return updated;
        } catch (error) {
          console.error("[Fihrist] Bookmark analysis failed", error);
          const message = "Analysis could not be completed. Please try again in a moment.";
          await db.updateBookmarkAnalysis(ctx.user.id, bookmark.id, {
            analysisStatus: "failed",
            analysisError: message,
          });
          publishFihristEvent({ type: "bookmark.updated", userId: ctx.user.id, bookmarkId: bookmark.id });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
        }
      }),
    queueStatus: protectedProcedure.query(({ ctx }) => db.getJobQueueSummary(ctx.user.id)),
    aiStatus: protectedProcedure.query(() => ({
      configured: aiTaggingConfigured(),
    })),
    suggestAiTags: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const bookmark = await db.getBookmark(ctx.user.id, input.id);
        if (!bookmark) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        if (!aiTaggingConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "AI tagging is not configured. Set FIHRIST_AI_BASE_URL and FIHRIST_AI_API_KEY on the server.",
          });
        }
        const { suggestions, promptTokens, completionTokens } = await suggestAiTags(bookmark);
        const created = await db.createAiTagSuggestions(
          ctx.user.id,
          bookmark.id,
          suggestions.map(suggestion => ({ ...suggestion, promptTokens, completionTokens }))
        );
        return { created, promptTokens, completionTokens };
      }),
    aiTagSuggestions: protectedProcedure
      .input(z.object({ bookmarkId: z.number().int().positive().optional() }).optional())
      .query(({ ctx, input }) => db.listPendingAiTagSuggestions(ctx.user.id, input?.bookmarkId)),
    approveAiTag: protectedProcedure
      .input(z.object({ suggestionId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.approveAiTagSuggestion(ctx.user.id, input.suggestionId)),
    rejectAiTag: protectedProcedure
      .input(z.object({ suggestionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await db.rejectAiTagSuggestion(ctx.user.id, input.suggestionId);
        return { ok: true as const };
      }),
    retryFailed: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(10000).default(1000) }))
      .mutation(({ ctx, input }) => db.retryFailedJobsForUser(ctx.user.id, input.limit)),
  }),

  health: router({
    dashboard: protectedProcedure
      .input(z.object({ cursor: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }).optional())
      .query(async ({ ctx, input }) => {
      const page = await db.listBookmarkPage(ctx.user.id, input);
      const settings = await db.ensureHealthSettings(ctx.user.id);
      const counts = await db.countBookmarkHealthStatuses(ctx.user.id);
      return { bookmarks: page.items, nextCursor: page.nextCursor, counts, settings };
    }),
    queueNow: protectedProcedure.mutation(async ({ ctx }) => {
      const startedAt = new Date();
      const queuedCount = await queueHealthChecksForUser(ctx.user.id);
      if (queuedCount > 0) await db.startHealthRun(ctx.user.id, queuedCount, startedAt);
      const pendingCount = await db.countPendingJobsForUser(ctx.user.id, "health_check");
      return { queuedCount, pendingCount };
    }),
    runProgress: protectedProcedure.query(({ ctx }) => db.getHealthRunProgress(ctx.user.id)),
    enableWeeklyChecks: protectedProcedure.mutation(({ ctx }) =>
      db.updateHealthSettings(ctx.user.id, { enabled: true })
    ),
    pauseWeeklyChecks: protectedProcedure.mutation(({ ctx }) =>
      db.updateHealthSettings(ctx.user.id, { enabled: false })
    ),
  }),
});

export type AppRouter = typeof appRouter;
