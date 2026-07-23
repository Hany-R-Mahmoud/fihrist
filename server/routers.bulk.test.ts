import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import * as bookmarkAnalysis from "./services/bookmarkAnalysis";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { BookmarkRecord } from "./db";

const readyBookmark = {
  id: 11,
  userId: 73,
  url: "https://example.org/reference",
  host: "example.org",
  title: "Reference",
  description: "A helpful saved reference.",
  contentText: "Useful content.",
  notes: null,
  collectionName: null,
  tags: [],
} as unknown as BookmarkRecord;

function authenticatedContext(): TrpcContext {
  return {
    user: {
      id: 73,
      openId: "bulk-owner",
      name: "Bulk Owner",
      email: "owner@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("bookmarks bulk actions", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("passes the authenticated owner ID into bulk collection updates", async () => {
    const bulkMove = vi.spyOn(db, "bulkMoveBookmarks").mockResolvedValue(2);
    const caller = appRouter.createCaller(authenticatedContext());

    await expect(caller.bookmarks.bulkMove({ ids: [11, 12], collectionId: 3 })).resolves.toEqual({ updatedCount: 2 });
    expect(bulkMove).toHaveBeenCalledWith(73, [11, 12], 3);
  });

  it("passes the authenticated owner ID into bulk tag assignment", async () => {
    const bulkTag = vi.spyOn(db, "bulkAddManualTag").mockResolvedValue(2);
    const caller = appRouter.createCaller(authenticatedContext());

    await expect(caller.bookmarks.bulkAddTag({ ids: [11, 12], name: "reading" })).resolves.toEqual({ updatedCount: 2 });
    expect(bulkTag).toHaveBeenCalledWith(73, [11, 12], "reading");
  });

  it("deletes only the authenticated owner's selected bookmarks", async () => {
    const bulkDelete = vi.spyOn(db, "bulkDeleteBookmarks").mockResolvedValue(2);
    const caller = appRouter.createCaller(authenticatedContext());

    await expect(caller.bookmarks.bulkRemove({ ids: [11, 12] })).resolves.toEqual({ deletedCount: 2 });
    expect(bulkDelete).toHaveBeenCalledWith(73, [11, 12]);
  });

  it("never surfaces provider details when protected AI analysis fails", async () => {
    vi.spyOn(db, "getBookmark").mockResolvedValue(readyBookmark);
    const updateAnalysis = vi.spyOn(db, "updateBookmarkAnalysis").mockResolvedValue(readyBookmark);
    vi.spyOn(bookmarkAnalysis, "generateBookmarkAnalysis").mockRejectedValue(new Error("provider token detail"));
    const serverError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const caller = appRouter.createCaller(authenticatedContext());

    await expect(caller.bookmarks.analyze({ id: 11 })).rejects.toMatchObject({
      message: "Analysis could not be completed. Please try again in a moment.",
    });
    expect(updateAnalysis).toHaveBeenLastCalledWith(73, 11, {
      analysisStatus: "failed",
      analysisError: "Analysis could not be completed. Please try again in a moment.",
    });
    expect(serverError).toHaveBeenCalledWith("[Fihrist] Bookmark analysis failed", expect.any(Error));
  });
});
