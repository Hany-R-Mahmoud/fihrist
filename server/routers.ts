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
import { queueHealthChecksForUser, openHealthRun } from "./services/jobProcessor.js";
import { summarizeTimeline, withTransitions } from "./services/healthHistory.js";
import { type DigestFacts } from "./services/rotDigest.js";
import { assertPublicUrlTarget } from "./services/linkSafety.js";
import { generateBookmarkAnalysis } from "./services/bookmarkAnalysis.js";
import { aiTaggingConfigured, suggestAiTags } from "./services/aiTagging.js";
import { publishFihristEvent } from "./services/liveEvents.js";
import { cloudWeeklyHealthEnabled } from "./services/neonHealthScheduler.js";
import { listTopicShelves,refreshTopicShelves } from "./services/topicShelves.js";

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

function parseDigestFacts(raw: string): DigestFacts | null {
  try { return JSON.parse(raw) as DigestFacts; } catch { return null; }
}

/** Digest facts are a run snapshot, while archived recovery may arrive later.
 * Enrich ONLY advisory recovery fields using the owner's current bookmarks.
 * This never changes the historical verdict, section or count of that run. */
function withCurrentRecovery(facts:DigestFacts|null, bookmarks:Awaited<ReturnType<typeof db.listBookmarkTitleIndex>>) {
  if(!facts)return null;
  const current=new Map(bookmarks.map(b=>[b.id,b]));
  const items=Object.fromEntries(Object.entries(facts.items).map(([name,entries])=>[
    name,entries.map(entry=>{
      const live=current.get(entry.bookmarkId);
      return live ? {...entry,
        archiveUrl:live.archiveUrl??null,
        archiveCheckedAt:live.archiveCheckedAt?.toISOString()??null,
        checksDisabled:live.checksDisabled,persistentFailure:live.persistentFailure,
      } : entry;
    })
  ])) as DigestFacts["items"];
  return {...facts,items};
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
            topicTagId: z.number().int().positive().optional(),
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
      const canonical=await db.countCanonicalRedirects(ctx.user.id);
      counts.healthy+=canonical;
      counts.redirected-=canonical;
      const schedulingAvailable=process.env.FIHRIST_MODE!=="cloud" || cloudWeeklyHealthEnabled();
      return { bookmarks: page.items, nextCursor: page.nextCursor, counts, settings, schedulingAvailable };
    }),
    queueNow: protectedProcedure.mutation(async ({ ctx }) => {
      if(process.env.FIHRIST_MODE==="cloud" && !cloudWeeklyHealthEnabled())
        throw new TRPCError({code:"PRECONDITION_FAILED",message:"Automatic bulk checks are not ready yet."});
      const startedAt = new Date();
      // Join the sweep that is already running rather than starting a second
      // one — one sweep, one report.
      const { run, reused } = await openHealthRun(ctx.user.id, "manual", startedAt);
      const queuedCount = await queueHealthChecksForUser(ctx.user.id, run.id);
      if (queuedCount > 0) {
        await db.activateHealthRun(ctx.user.id, run.id, (run.total ?? 0) + queuedCount);
      } else if (!reused) {
        // Nothing was queued — drop the run so no empty sweep is reported.
        await db.deleteHealthRun(ctx.user.id, run.id);
      }
      const pendingCount = await db.countPendingJobsForUser(ctx.user.id, "health_check");
      return { queuedCount, pendingCount };
    }),
    /** The full check history of one bookmark, newest first. */
    timeline: protectedProcedure
      .input(
        z.object({
          bookmarkId: z.number().int().positive(),
          // A bookmark checked for years can have a long history; the timeline
          // renders at most 50 rows at a time, so the payload is bounded.
          limit: z.number().int().min(1).max(500).default(500),
        })
      )
      .query(async ({ ctx, input }) => {
        const bookmark = await db.getBookmark(ctx.user.id, input.bookmarkId);
        if (!bookmark) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        const entries = await db.listBookmarkTimeline(
          ctx.user.id,
          input.bookmarkId,
          input.limit
        );
        const rollup=await db.getHealthRollup(ctx.user.id,input.bookmarkId);
        const summary = summarizeTimeline(
          entries.slice().reverse().map(entry => ({ status: entry.status, checkedAt: entry.checkedAt })),
          rollup??undefined
        );
        return {
          bookmark: {
            id: bookmark.id,title:bookmark.title,url:bookmark.url,host:bookmark.host,
            checksDisabled:bookmark.checksDisabled,healthNote:bookmark.healthNote,
            archiveUrl:bookmark.archiveUrl,archiveTimestamp:bookmark.archiveTimestamp,
            archiveCheckedAt:bookmark.archiveCheckedAt,healthStatus:bookmark.healthStatus,
            moveClass:bookmark.moveClass,originalUrl:bookmark.originalUrl,
          },
          entries: withTransitions(entries),
          summary,
        };
      }),
    /** Check one link now. It records one history row against its own run. */
    checkOne: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const bookmark = await db.getBookmark(ctx.user.id, input.id);
        if (!bookmark) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        if (await db.hasActiveBookmarkJob(ctx.user.id, input.id, "health_check")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This link is already being checked.",
          });
        }
        const run = await db.startHealthRun(ctx.user.id, { trigger: "single" });
        await db.createBookmarkJob(ctx.user.id, input.id, "health_check", run.id);
        publishFihristEvent({ type: "health.updated", userId: ctx.user.id, bookmarkId: input.id });
        return { runId: run.id };
      }),
    runProgress: protectedProcedure.query(({ ctx }) => db.getHealthRunProgress(ctx.user.id)),
    enableWeeklyChecks: protectedProcedure.mutation(({ ctx }) => {
      if(process.env.FIHRIST_MODE==="cloud" && !cloudWeeklyHealthEnabled())
        throw new TRPCError({code:"PRECONDITION_FAILED",message:"Weekly checking is not activated yet."});
      return db.updateHealthSettings(ctx.user.id,{enabled:true});
    }),
    pauseWeeklyChecks: protectedProcedure.mutation(({ ctx }) =>
      db.updateHealthSettings(ctx.user.id, { enabled: false })
    ),
    setLinkControls: protectedProcedure.input(z.object({
      bookmarkId:z.number().int().positive(),
      checksDisabled:z.boolean().optional(),
      healthNote:z.string().trim().max(280).nullable().optional(),
    })).mutation(async ({ctx,input})=>{
      const bookmark=await db.getBookmark(ctx.user.id,input.bookmarkId);
      if(!bookmark)throw new TRPCError({code:"NOT_FOUND",message:"Bookmark not found"});
      const updated=await db.updateBookmarkControls(ctx.user.id,input.bookmarkId,{
        checksDisabled:input.checksDisabled,healthNote:input.healthNote,
      });
      publishFihristEvent({type:"bookmark.updated",userId:ctx.user.id,bookmarkId:input.bookmarkId});
      return updated;
    }),
    lookupArchive: protectedProcedure.input(z.object({
      bookmarkId:z.number().int().positive()
    })).mutation(async ({ctx,input})=>{
      const bookmark=await db.getBookmark(ctx.user.id,input.bookmarkId);
      if(!bookmark)throw new TRPCError({code:"NOT_FOUND",message:"Bookmark not found"});
      if(bookmark.healthStatus!=="broken")
        throw new TRPCError({code:"BAD_REQUEST",message:"Archived recovery is offered for broken links."});
      if(await db.hasActiveBookmarkJob(ctx.user.id,bookmark.id,"wayback_lookup"))
        return {queued:false,alreadyPending:true};
      await db.createBookmarkJob(ctx.user.id,bookmark.id,"wayback_lookup",null);
      return {queued:true,alreadyPending:false};
    }),
    replaceArchive: protectedProcedure.input(z.object({
      bookmarkId:z.number().int().positive()
    })).mutation(async ({ctx,input})=>{
      const bookmark=await db.getBookmark(ctx.user.id,input.bookmarkId);
      if(!bookmark)throw new TRPCError({code:"NOT_FOUND",message:"Bookmark not found"});
      if(bookmark.healthStatus!=="broken" || !bookmark.archiveUrl)
        throw new TRPCError({code:"BAD_REQUEST",message:"No archived copy is available"});
      const destination=new URL(bookmark.archiveUrl);
      if(destination.hostname!=="web.archive.org" || destination.protocol!=="https:")
        throw new TRPCError({code:"BAD_REQUEST",message:"Unexpected archived address"});
      const normalized=normalizeBookmarkUrl(bookmark.archiveUrl);
      const updated=await db.recordArchiveReplacement(ctx.user.id,bookmark.id,bookmark.originalUrl??bookmark.url,normalized);
      publishFihristEvent({type:"bookmark.updated",userId:ctx.user.id,bookmarkId:bookmark.id});
      return updated;
    }),
    updateToFinal: protectedProcedure.input(z.object({
      bookmarkId:z.number().int().positive()
    })).mutation(async ({ctx,input})=>{
      const bookmark=await db.getBookmark(ctx.user.id,input.bookmarkId);
      if(!bookmark)throw new TRPCError({code:"NOT_FOUND",message:"Bookmark not found"});
      if(!["relocation","cross_domain"].includes(bookmark.moveClass??""))
        throw new TRPCError({code:"BAD_REQUEST",message:"No meaningful relocation recorded"});
      const entries=await db.listBookmarkTimeline(ctx.user.id,input.bookmarkId,1);
      const finalUrl=entries[0]?.finalUrl;
      if(!finalUrl || finalUrl===bookmark.url)
        throw new TRPCError({code:"BAD_REQUEST",message:"No new address recorded"});
      const normalized=normalizeBookmarkUrl(finalUrl);
      await db.updateBookmarkUrl(ctx.user.id,input.bookmarkId,normalized);
      await db.updateBookmarkHealth(ctx.user.id,input.bookmarkId,{
        healthStatus:"unchecked",httpStatus:null,healthError:null,lastCheckedAt:null,
        failureClass:null,moveClass:null,persistentFailure:false,
        persistentFailureClass:null,persistentFailureStreak:0,soft404Streak:0,soft404LastRunId:null
      });
      publishFihristEvent({type:"bookmark.updated",userId:ctx.user.id,bookmarkId:bookmark.id});
      return db.getBookmark(ctx.user.id,bookmark.id);
    }),
  }),

  topics: router({
    shelves: protectedProcedure.query(({ctx})=>listTopicShelves(ctx.user.id)),
    refresh: protectedProcedure.mutation(async ({ctx})=>{
      const count=await refreshTopicShelves(ctx.user.id);
      publishFihristEvent({type:"bookmark.updated",userId:ctx.user.id,bookmarkId:0});
      return {count};
    }),
    dismiss: protectedProcedure.input(z.object({
      normalizedName:z.string().startsWith("topic:").max(400),
      bookmarkId:z.number().int().nonnegative().default(0)
    })).mutation(async ({ctx,input})=>{
      const links=await db.listTopicLinks(ctx.user.id);
      const owned=links.some(link=>link.normalizedName===input.normalizedName &&
        (input.bookmarkId===0 || link.bookmarkId===input.bookmarkId));
      if(!owned) throw new TRPCError({code:"NOT_FOUND",message:"Shelf not found"});
      await db.dismissTopic(ctx.user.id,input.normalizedName,input.bookmarkId);
      await refreshTopicShelves(ctx.user.id);
      return {ok:true as const};
    })
  }),

  /** The narrative rot report — one digest per completed full-drain run. */
  digest: router({
    latest: protectedProcedure.query(async ({ ctx }) => {
      const digest = await db.latestRotDigest(ctx.user.id);
      if (!digest) return null;
      const current=await db.listBookmarkTitleIndex(ctx.user.id);
      return {...digest,facts:withCurrentRecovery(parseDigestFacts(digest.facts),current)};
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const digests = await db.listRotDigests(ctx.user.id, 20);
      const current=await db.listBookmarkTitleIndex(ctx.user.id);
      return digests.map(digest=>({...digest,
        facts:withCurrentRecovery(parseDigestFacts(digest.facts),current)}));
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await db.markRotDigestRead(ctx.user.id, input.id);
        return { success: true } as const;
      }),
    /** Hide a link from the digest until its next status transition. */
    dismiss: protectedProcedure
      .input(z.object({ bookmarkId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await db.dismissHealthAlert(ctx.user.id, input.bookmarkId);
        return { success: true } as const;
      }),
    /** Point a bookmark at the address its last check recorded. */
    updateUrl: protectedProcedure
      .input(z.object({ bookmarkId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const bookmark = await db.getBookmark(ctx.user.id, input.bookmarkId);
        if (!bookmark) throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
        const timeline = await db.listBookmarkTimeline(ctx.user.id, input.bookmarkId, 1);
        const finalUrl = timeline[0]?.finalUrl;
        if (!finalUrl || finalUrl === bookmark.url) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No new address was recorded for this link.",
          });
        }
        const normalized = normalizeBookmarkUrl(finalUrl);
        await db.updateBookmarkUrl(ctx.user.id, input.bookmarkId, {
          url: normalized.url,
          normalizedUrl: normalized.normalizedUrl,
          normalizedUrlHash: normalized.normalizedUrlHash,
          host: normalized.host,
        });
        // The old verdict described the old address. The new one has not been
        // checked yet, so say so rather than keep a stale status.
        await db.updateBookmarkHealth(ctx.user.id, input.bookmarkId, {
          healthStatus: "unchecked",
          httpStatus: null,
          healthError: null,
          lastCheckedAt: null,
        });
        publishFihristEvent({
          type: "bookmark.updated",
          userId: ctx.user.id,
          bookmarkId: input.bookmarkId,
        });
        return db.getBookmark(ctx.user.id, input.bookmarkId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
