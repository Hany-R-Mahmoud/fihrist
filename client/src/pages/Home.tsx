import DashboardLayout, { type FihristView } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BookmarkCover } from "@/components/BookmarkCover";
import { HealthStamp } from "@/components/HealthStamp";
import { HealthTimeline, type TimelineEntry, type TimelineSummary } from "@/components/HealthTimeline";
import { RotDigestCard, type DigestRecord, type ResolvedDigestItem } from "@/components/RotDigestCard";
import { useFihristEvents } from "@/hooks/useFihristEvents";
import { useLocale } from "@/i18n/LocaleContext";
import { formatRelativeTime } from "@/i18n/format";
import { trpc } from "@/lib/trpc";
import type { AiTagSuggestionRecord, BookmarkRecord, JobQueueSummary } from "../../../server/db";
import {
  healthStateClasses,
  healthStateLabels,
  type HealthLocale,
} from "@shared/healthLanguage";
import {
  AlertCircle,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleAlert,
  FileUp,
  Folder,
  FolderPlus,
  HeartPulse,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Collection = { id: number; name: string };

function healthAppearance(status: BookmarkRecord["healthStatus"], locale: HealthLocale) {
  return { label: healthStateLabels[status][locale], className: healthStateClasses[status] };
}

export default function Home() {
  const utils = trpc.useUtils();
  const { t, locale } = useLocale();
  const [activeView, setActiveView] = useState<FihristView>("all");
  const [search, setSearch] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [addCollectionId, setAddCollectionId] = useState<string>("none");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [editingCollection, setEditingCollection] = useState<number | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState("");
  const [notesBookmark, setNotesBookmark] = useState<BookmarkRecord | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [deleteBookmark, setDeleteBookmark] = useState<BookmarkRecord | null>(null);
  const [deleteCollection, setDeleteCollection] = useState<Collection | null>(null);
  const [healthDeleteIds, setHealthDeleteIds] = useState<number[]>([]);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<number[]>([]);
  const [timelineBookmarkId, setTimelineBookmarkId] = useState<number | null>(null);
  const [selectedDigestId, setSelectedDigestId] = useState<number | null>(null);
  const [resolvedItems, setResolvedItems] = useState<Record<number, ResolvedDigestItem>>({});
  const [healthFilterRequest, setHealthFilterRequest] = useState<{ filter: HealthFilter; nonce: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bookmarkFilters = useMemo(
    () => (selectedCollectionId ? { collectionId: selectedCollectionId } : {}),
    [selectedCollectionId]
  );
  const bookmarksQuery = trpc.bookmarks.list.useInfiniteQuery(bookmarkFilters, {
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  });
  const searchQuery = trpc.bookmarks.search.useInfiniteQuery(
    { query: search.trim() },
    {
      enabled: search.trim().length > 0,
      getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    }
  );
  const collectionsQuery = trpc.collections.list.useQuery();
  const healthQuery = trpc.health.dashboard.useInfiniteQuery({}, {
    enabled: activeView === "health",
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  });
  const queueStatusQuery = trpc.bookmarks.queueStatus.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const healthRunProgressQuery = trpc.health.runProgress.useQuery(undefined, {
    enabled: activeView === "health",
    refetchInterval: query => {
      const data = query.state.data as
        | { completedAt?: Date | null; pending?: number; processing?: number }
        | undefined;
      const active = data && !data.completedAt && (data.pending || data.processing);
      return active ? 3000 : false;
    },
  });
  const exportQuery = trpc.bookmarks.exportNetscape.useQuery(undefined, { enabled: false });
  const digestQuery = trpc.digest.latest.useQuery();
  const digestListQuery = trpc.digest.list.useQuery();
  const timelineQuery = trpc.health.timeline.useQuery(
    { bookmarkId: timelineBookmarkId ?? 0 },
    { enabled: timelineBookmarkId !== null }
  );

  const libraryBookmarks = bookmarksQuery.data?.pages.flatMap(page => page.items) ?? [];
  const searchedBookmarks = searchQuery.data?.pages.flatMap(page => page.items) ?? [];
  const bookmarks = search.trim() ? searchedBookmarks : libraryBookmarks;
  const totalBookmarkCount = search.trim()
    ? searchQuery.data?.pages[0]?.totalCount ?? bookmarks.length
    : bookmarksQuery.data?.pages[0]?.totalCount ?? bookmarks.length;
  const healthPages = healthQuery.data?.pages ?? [];
  const healthData = healthPages[0]
    ? {
        bookmarks: healthPages.flatMap(page => page.bookmarks),
        counts: healthPages[0].counts,
        settings: healthPages[0].settings,
      }
    : undefined;
  const collections = collectionsQuery.data ?? [];
  const selectedBookmarkIdSet = useMemo(() => new Set(selectedBookmarkIds), [selectedBookmarkIds]);
  const allVisibleBookmarksSelected = Boolean(bookmarks.length) && bookmarks.every(bookmark => selectedBookmarkIdSet.has(bookmark.id));

  const digestList = (digestListQuery.data ?? []) as DigestRecord[];
  const latestDigest = (digestQuery.data ?? null) as DigestRecord | null;
  // The owner can re-open a past report from the card; the latest stays the
  // one the shell counts as unread.
  const activeDigest = (selectedDigestId
    ? digestList.find(digest => digest.id === selectedDigestId) ?? latestDigest
    : latestDigest) as DigestRecord | null;
  const pastDigests = digestList.filter(digest => digest.id !== activeDigest?.id) as DigestRecord[];
  const digestUnread = Boolean(latestDigest && !latestDigest.readAt);

  useEffect(() => {
    const visibleIds = new Set(bookmarks.map(bookmark => bookmark.id));
    setSelectedBookmarkIds(ids => {
      const next = ids.filter(id => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [bookmarks]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      utils.bookmarks.list.invalidate(),
      utils.bookmarks.search.invalidate(),
      utils.collections.list.invalidate(),
      utils.health.dashboard.invalidate(),
      utils.health.timeline.invalidate(),
      utils.bookmarks.queueStatus.invalidate(),
      utils.bookmarks.aiTagSuggestions.invalidate(),
      utils.digest.latest.invalidate(),
      utils.digest.list.invalidate(),
    ]);
  }, [utils]);

  useFihristEvents(
    useCallback(
      () => {
        void refreshWorkspace();
      },
      [refreshWorkspace]
    )
  );

  const markDigestRead = trpc.digest.markRead.useMutation({
    onSuccess: () => {
      void utils.digest.latest.invalidate();
    },
  });
  const dismissDigestItem = trpc.digest.dismiss.useMutation({
    onSuccess: (_result, variables) => {
      // Show the owner that the action landed, rather than leaving the item
      // looking untouched in a report that is a snapshot.
      setResolvedItems(current => ({
        ...current,
        [variables.bookmarkId]: { state: "dismissed" },
      }));
      void refreshWorkspace();
    },
  });
  const updateDigestUrl = trpc.digest.updateUrl.useMutation({
    onSuccess: bookmark => {
      setResolvedItems(current => ({
        ...current,
        [bookmark.id]: { state: "updated", url: bookmark.url },
      }));
      void refreshWorkspace();
      toast.success(t("digest.updateUrlDone"));
    },
    onError: error => toast.error(t("digest.updateUrlFailed"), { description: error.message }),
  });

  // A newly landed report takes over the card — unless the owner is reading
  // it, in which case the shell badge is the nudge.
  const lastSeenLatestId = useRef<number | null>(null);
  useEffect(() => {
    const id = latestDigest?.id ?? null;
    if (id === null) return;
    if (lastSeenLatestId.current !== null && lastSeenLatestId.current !== id) {
      setSelectedDigestId(null);
    }
    lastSeenLatestId.current = id;
  }, [latestDigest?.id]);

  // The report is marked read once it has been shown on the home surface.
  useEffect(() => {
    if (!activeDigest || activeDigest.readAt || activeView !== "all") return;
    markDigestRead.mutate({ id: activeDigest.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDigest?.id, activeDigest?.readAt, activeView]);

  // A newly landed report surfaces its cost where the AI path surfaces cost:
  // in a toast.
  const seenDigestId = useRef<number | null>(null);
  useEffect(() => {
    const current = latestDigest;
    if (!current) return;
    const id = current.id;
    if (seenDigestId.current === null) {
      seenDigestId.current = id;
      return;
    }
    if (seenDigestId.current === id) return;
    seenDigestId.current = id;
    toast.success(t("digest.cardTitle"), {
      description: t("digest.costToast", {
        prompt: current.promptTokens ?? current.estimatedPromptTokens ?? 0,
        completion: current.completionTokens ?? 0,
      }),
    });
  }, [latestDigest, t]);

  const addBookmark = trpc.bookmarks.add.useMutation({
    onSuccess: () => {
      setUrlDraft("");
      setAddCollectionId("none");
      setAddOpen(false);
      toast.success(t("toast.bookmarkSaved"), { description: t("toast.bookmarkSavedBody") });
      void refreshWorkspace();
    },
    onError: error => toast.error(t("toast.bookmarkSaveFailed"), { description: error.message }),
  });
  const importBookmarks = trpc.bookmarks.importNetscape.useMutation({
    onSuccess: result => {
      setImportOpen(false);
      setSelectedCollectionId(null);
      setActiveView("collections");
      toast.success(t("toast.imported", { count: result.importedCount }), {
        description: t("toast.importedBody", {
          collections: result.collectionCount,
          uncategorized: result.uncategorizedCount ? `, ${result.uncategorizedCount}` : "",
        }),
      });
      void refreshWorkspace();
    },
    onError: error => toast.error(t("toast.importFailed"), { description: error.message }),
  });
  const createCollection = trpc.collections.create.useMutation({
    onSuccess: () => {
      setCollectionDraft("");
      void refreshWorkspace();
      toast.success(t("toast.collectionCreated"));
    },
    onError: error => toast.error(t("toast.collectionCreateFailed"), { description: error.message }),
  });
  const renameCollection = trpc.collections.rename.useMutation({
    onSuccess: () => {
      setEditingCollection(null);
      setEditingCollectionName("");
      void refreshWorkspace();
    },
    onError: error => toast.error(t("toast.collectionRenameFailed"), { description: error.message }),
  });
  const removeCollection = trpc.collections.remove.useMutation({
    onSuccess: () => {
      setDeleteCollection(null);
      if (selectedCollectionId === deleteCollection?.id) setSelectedCollectionId(null);
      void refreshWorkspace();
      toast.success(t("toast.collectionDeleted"));
    },
    onError: error => toast.error(t("toast.collectionDeleteFailed"), { description: error.message }),
  });
  const moveBookmark = trpc.bookmarks.move.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error(t("toast.moveFailed"), { description: error.message }),
  });
  const updateNotes = trpc.bookmarks.updateNotes.useMutation({
    onSuccess: () => {
      setNotesBookmark(null);
      setNotesDraft("");
      void refreshWorkspace();
      toast.success(t("toast.notesUpdated"));
    },
    onError: error => toast.error(t("toast.notesFailed"), { description: error.message }),
  });
  const removeBookmark = trpc.bookmarks.remove.useMutation({
    onSuccess: () => {
      if (deleteBookmark) setSelectedBookmarkIds(ids => ids.filter(id => id !== deleteBookmark.id));
      setDeleteBookmark(null);
      void refreshWorkspace();
      toast.success(t("toast.bookmarkRemoved"));
    },
    onError: error => toast.error(t("toast.bookmarkRemoveFailed"), { description: error.message }),
  });
  const bulkRemoveBookmarks = trpc.bookmarks.bulkRemove.useMutation({
    onSuccess: (result, variables) => {
      setSelectedBookmarkIds(ids => ids.filter(id => !variables.ids.includes(id)));
      setHealthDeleteIds([]);
      void refreshWorkspace();
      toast.success(t("toast.bulkRemoved", { count: result.deletedCount }));
    },
    onError: error => toast.error(t("toast.bulkRemoveFailed"), { description: error.message }),
  });
  const addTag = trpc.bookmarks.addTag.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error(t("toast.tagAddFailed"), { description: error.message }),
  });
  const removeTag = trpc.bookmarks.removeTag.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error(t("toast.tagRemoveFailed"), { description: error.message }),
  });
  const analyzeBookmark = trpc.bookmarks.analyze.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
      toast.success(t("toast.insightReady"));
    },
    onError: error => toast.error(t("toast.analyzeFailed"), { description: error.message }),
  });
  const aiStatusQuery = trpc.bookmarks.aiStatus.useQuery();
  const aiSuggestionsQuery = trpc.bookmarks.aiTagSuggestions.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const suggestAiTags = trpc.bookmarks.suggestAiTags.useMutation({
    onSuccess: result => {
      void refreshWorkspace();
      toast.success(
        result.created
          ? t("toast.aiSuggestionsReady", { count: result.created })
          : t("toast.aiSuggestionsNone"),
        result.promptTokens
          ? { description: `~${result.promptTokens} in / ${result.completionTokens ?? 0} out tokens` }
          : undefined
      );
    },
    onError: error => toast.error(t("toast.aiSuggestionsFailed"), { description: error.message }),
  });
  const approveAiTag = trpc.bookmarks.approveAiTag.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error(t("toast.aiApproveFailed"), { description: error.message }),
  });
  const rejectAiTag = trpc.bookmarks.rejectAiTag.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error(t("toast.aiRejectFailed"), { description: error.message }),
  });
  const bulkMoveBookmarks = trpc.bookmarks.bulkMove.useMutation({
    onSuccess: result => {
      setSelectedBookmarkIds([]);
      void refreshWorkspace();
      toast.success(t("toast.bulkMoved", { count: result.updatedCount }));
    },
    onError: error => toast.error(t("toast.bulkMoveFailed"), { description: error.message }),
  });
  const bulkAddTag = trpc.bookmarks.bulkAddTag.useMutation({
    onSuccess: result => {
      void refreshWorkspace();
      toast.success(t("toast.bulkTagged", { count: result.updatedCount }));
    },
    onError: error => toast.error(t("toast.bulkTagFailed"), { description: error.message }),
  });
  const queueHealth = trpc.health.queueNow.useMutation({
    onSuccess: result => {
      void refreshWorkspace();
      toast.success(t("toast.healthRefreshStarted"), {
        description: result.pendingCount
          ? t("toast.healthRefreshQueued", { count: result.queuedCount })
          : t("toast.healthRefreshUpToDate"),
      });
    },
    onError: error => toast.error(t("toast.healthRefreshFailed"), { description: error.message }),
  });
  const checkOne = trpc.health.checkOne.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
    },
    onError: error => toast.error(t("timeline.checkFailed"), { description: error.message }),
  });
  const retryFailedJobs = trpc.bookmarks.retryFailed.useMutation({
    onSuccess: count => {
      void refreshWorkspace();
      toast.success(t("toast.jobsRequeued", { count }), {
        description: t("toast.jobsRequeuedBody"),
      });
    },
    onError: error => toast.error(t("toast.jobsRequeueFailed"), { description: error.message }),
  });
  const enableWeekly = trpc.health.enableWeeklyChecks.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
      toast.success(t("toast.weeklyActive"));
    },
    onError: error => toast.error(t("toast.weeklyActiveFailed"), { description: error.message }),
  });
  const pauseWeekly = trpc.health.pauseWeeklyChecks.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
      toast.success(t("toast.weeklyPaused"));
    },
    onError: error => toast.error(t("toast.weeklyPauseFailed"), { description: error.message }),
  });

  const onSubmitUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!urlDraft.trim()) return;
    addBookmark.mutate({
      url: urlDraft.trim(),
      collectionId: addCollectionId === "none" ? null : Number(addCollectionId),
    });
  };

  const onImportFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error(t("toast.fileTooLarge"), { description: t("toast.fileTooLargeBody") });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") importBookmarks.mutate({ html: reader.result });
    };
    reader.onerror = () => toast.error(t("toast.fileReadFailed"));
    reader.readAsText(file);
  };

  const onExportBookmarks = async () => {
    const result = await exportQuery.refetch();
    if (!result.data) {
      toast.error(t("toast.exportFailed"), { description: result.error?.message });
      return;
    }
    const href = window.URL.createObjectURL(new Blob([result.data.html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = result.data.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(href);
    toast.success(t("toast.exported"));
  };

  const toggleBookmarkSelection = (bookmarkId: number, checked: boolean) => {
    setSelectedBookmarkIds(ids =>
      checked ? Array.from(new Set([...ids, bookmarkId])) : ids.filter(id => id !== bookmarkId)
    );
  };

  const toggleVisibleBookmarkSelection = () => {
    const visibleIds = bookmarks.map(bookmark => bookmark.id);
    setSelectedBookmarkIds(ids =>
      allVisibleBookmarksSelected
        ? ids.filter(id => !visibleIds.includes(id))
        : Array.from(new Set([...ids, ...visibleIds]))
    );
  };

  const openTimeline = (bookmarkId: number) => setTimelineBookmarkId(bookmarkId);

  const openHealthFilter = (filter: "broken" | "needs_review") => {
    setActiveView("health");
    setHealthFilterRequest({ filter, nonce: Date.now() });
  };

  const viewContent = () => {
    if (activeView === "collections") {
      if (collectionsQuery.isError) {
        return <QueryErrorState onRetry={() => void collectionsQuery.refetch()} />;
      }
      return (
        <CollectionsView
          collections={collections}
          bookmarks={libraryBookmarks}
          selectedCollectionId={selectedCollectionId}
          onSelectCollection={collectionId => {
            setSelectedCollectionId(collectionId);
            setSearch("");
            setActiveView("all");
          }}
          collectionDraft={collectionDraft}
          setCollectionDraft={setCollectionDraft}
          createCollection={name => createCollection.mutate({ name })}
          creating={createCollection.isPending}
          editingCollection={editingCollection}
          editingCollectionName={editingCollectionName}
          onEdit={(collection) => {
            setEditingCollection(collection.id);
            setEditingCollectionName(collection.name);
          }}
          setEditingCollectionName={setEditingCollectionName}
          onCancelEdit={() => setEditingCollection(null)}
          onSaveEdit={collection => renameCollection.mutate({ id: collection.id, name: editingCollectionName })}
          renamePending={renameCollection.isPending}
          onDelete={setDeleteCollection}
        />
      );
    }

    if (activeView === "health") {
      if (healthQuery.isError) {
        return <QueryErrorState onRetry={() => void healthQuery.refetch()} />;
      }
      return (
        <HealthView
          data={healthData}
          loading={healthQuery.isLoading}
          hasMore={healthQuery.hasNextPage}
          loadingMore={healthQuery.isFetchingNextPage}
          onLoadMore={() => void healthQuery.fetchNextPage()}
          onQueue={() => queueHealth.mutate()}
          queuePending={queueHealth.isPending}
          onEnable={() => enableWeekly.mutate()}
          enablePending={enableWeekly.isPending}
          onPause={() => pauseWeekly.mutate()}
          pausePending={pauseWeekly.isPending}
          onOpenBookmark={() => setActiveView("all")}
          onRequestDelete={setHealthDeleteIds}
          onOpenTimeline={openTimeline}
          filterRequest={healthFilterRequest}
          deletePending={bulkRemoveBookmarks.isPending}
          runProgress={healthRunProgressQuery.data ?? null}
        />
      );
    }

    if (bookmarksQuery.isError || (search.trim() && searchQuery.isError)) {
      return <QueryErrorState onRetry={() => void refreshWorkspace()} />;
    }

    return (
      <>
        <RotDigestCard
          digest={activeDigest}
          unread={digestUnread}
          pastDigests={pastDigests}
          resolvedItems={resolvedItems}
          updatingBookmarkId={updateDigestUrl.isPending ? updateDigestUrl.variables?.bookmarkId ?? null : null}
          dismissingBookmarkId={dismissDigestItem.isPending ? dismissDigestItem.variables?.bookmarkId ?? null : null}
          onOpenTimeline={openTimeline}
          onDelete={bookmarkId => setHealthDeleteIds([bookmarkId])}
          onDismiss={bookmarkId => dismissDigestItem.mutate({ bookmarkId })}
          onUpdateUrl={bookmarkId => updateDigestUrl.mutate({ bookmarkId })}
          onOpenFilter={openHealthFilter}
          onSelectDigest={setSelectedDigestId}
        />
        <BookmarksView
          bookmarks={bookmarks}
          collections={collections}
          loading={bookmarksQuery.isLoading || (Boolean(search.trim()) && searchQuery.isLoading)}
          totalCount={totalBookmarkCount}
          hasMore={search.trim() ? searchQuery.hasNextPage : bookmarksQuery.hasNextPage}
          loadingMore={search.trim() ? searchQuery.isFetchingNextPage : bookmarksQuery.isFetchingNextPage}
          onLoadMore={() => void (search.trim() ? searchQuery.fetchNextPage() : bookmarksQuery.fetchNextPage())}
          search={search}
          onSearch={setSearch}
          selectedCollectionId={selectedCollectionId}
          onClearCollection={() => setSelectedCollectionId(null)}
          onAddBookmark={() => setAddOpen(true)}
          onMove={(bookmarkId, collectionId) => moveBookmark.mutate({ id: bookmarkId, collectionId })}
          moving={moveBookmark.isPending}
          onAddTag={(bookmarkId, name) => addTag.mutate({ id: bookmarkId, name })}
          onRemoveTag={(bookmarkId, tagId) => removeTag.mutate({ id: bookmarkId, tagId })}
          onEditNotes={bookmark => {
            setNotesBookmark(bookmark);
            setNotesDraft(bookmark.notes ?? "");
          }}
          onDelete={setDeleteBookmark}
          onOpenTimeline={openTimeline}
          selectedIds={selectedBookmarkIdSet}
          allVisibleSelected={allVisibleBookmarksSelected}
          onToggleSelection={toggleBookmarkSelection}
          onToggleAll={toggleVisibleBookmarkSelection}
          onClearSelection={() => setSelectedBookmarkIds([])}
          onBulkMove={collectionId => bulkMoveBookmarks.mutate({ ids: selectedBookmarkIds, collectionId })}
          bulkMoving={bulkMoveBookmarks.isPending}
          onBulkAddTag={name => bulkAddTag.mutate({ ids: selectedBookmarkIds, name })}
          bulkTagging={bulkAddTag.isPending}
          onAnalyze={bookmarkId => analyzeBookmark.mutate({ id: bookmarkId })}
          analyzingBookmarkId={analyzeBookmark.isPending ? analyzeBookmark.variables?.id ?? null : null}
          aiConfigured={aiStatusQuery.data?.configured ?? false}
          aiSuggestions={aiSuggestionsQuery.data ?? []}
          onSuggestAiTags={bookmarkId => suggestAiTags.mutate({ id: bookmarkId })}
          suggestingAiTags={suggestAiTags.isPending}
          suggestingBookmarkId={suggestAiTags.isPending ? suggestAiTags.variables?.id ?? null : null}
          onApproveAiTag={suggestionId => approveAiTag.mutate({ suggestionId })}
          onRejectAiTag={suggestionId => rejectAiTag.mutate({ suggestionId })}
        />
      </>
    );
  };

  const timelineBookmark = timelineQuery.data?.bookmark ?? null;

  return (
    <DashboardLayout
      activeView={activeView}
      onViewChange={view => {
        setActiveView(view);
        if (view !== "all") setSearch("");
      }}
      onAddBookmark={() => setAddOpen(true)}
      onImport={() => setImportOpen(true)}
      onExport={() => void onExportBookmarks()}
      exportPending={exportQuery.isFetching}
      digestUnread={digestUnread}
    >
      {queueStatusQuery.isError ? <QueueStatusError onRetry={() => void queueStatusQuery.refetch()} /> : null}
      {queueStatusQuery.data ? (
        <QueueStatusBanner
          summary={queueStatusQuery.data}
          retryPending={retryFailedJobs.isPending}
          onRetry={() => retryFailedJobs.mutate({ limit: 100 })}
        />
      ) : null}
      {viewContent()}

      <Dialog open={timelineBookmarkId !== null} onOpenChange={open => !open && setTimelineBookmarkId(null)}>
        <DialogContent className="fihrist-panel max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">
              {t("timeline.title")}
            </p>
            <DialogTitle className="fihrist-heading line-clamp-2 text-xl tracking-[-0.03em]">
              {timelineBookmark?.title ?? timelineBookmark?.host ?? t("common.untitled")}
            </DialogTitle>
            <DialogDescription className="fihrist-muted leading-6">
              {t("timeline.description")}
            </DialogDescription>
          </DialogHeader>
          <HealthTimeline
            key={timelineBookmarkId ?? "none"}
            entries={(timelineQuery.data?.entries ?? []) as TimelineEntry[]}
            summary={(timelineQuery.data?.summary ?? null) as TimelineSummary | null}
            loading={timelineQuery.isLoading}
            checking={checkOne.isPending}
            onCheckNow={() => {
              if (timelineBookmarkId) checkOne.mutate({ id: timelineBookmarkId });
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="fihrist-panel rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">{t("dialog.newBookmark")}</p>
            <DialogTitle className="fihrist-heading text-2xl tracking-[-0.035em]">{t("dialog.saveLink")}</DialogTitle>
            <DialogDescription className="fihrist-muted leading-6">{t("dialog.saveLinkBody")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitUrl} className="mt-3 space-y-4">
            <div className="space-y-2">
              <label htmlFor="bookmark-url" className="fihrist-heading text-sm font-medium">{t("dialog.url")}</label>
              <Input
                id="bookmark-url"
                autoFocus
                value={urlDraft}
                onChange={event => setUrlDraft(event.target.value)}
                placeholder="https://example.com/article"
                className="fihrist-input h-11 rounded-xl"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="bookmark-collection" className="fihrist-heading text-sm font-medium">{t("dialog.collection")}</label>
              <Select value={addCollectionId} onValueChange={setAddCollectionId}>
                <SelectTrigger id="bookmark-collection" className="fihrist-input h-11 rounded-xl">
                  <SelectValue placeholder={t("dialog.noCollection")} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="none">{t("dialog.noCollection")}</SelectItem>
                  {collections.map(collection => (
                    <SelectItem key={collection.id} value={String(collection.id)}>{collection.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={addBookmark.isPending} className="fihrist-primary-action rounded-xl">
                {addBookmark.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
                {t("dialog.saveBookmark")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="fihrist-panel rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">{t("dialog.import")}</p>
            <DialogTitle className="fihrist-heading text-2xl tracking-[-0.035em]">{t("dialog.importTitle")}</DialogTitle>
            <DialogDescription className="fihrist-muted leading-6">{t("dialog.importBody")}</DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importBookmarks.isPending}
            className="fihrist-empty mt-4 flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 text-center transition-colors hover:bg-accent disabled:opacity-60"
          >
            {importBookmarks.isPending ? <Loader2 className="mb-3 h-6 w-6 animate-spin text-primary" /> : <FileUp className="mb-3 h-6 w-6 text-primary" />}
            <span className="fihrist-heading text-sm font-medium">{t("dialog.importChoose")}</span>
            <span className="fihrist-muted mt-1 text-xs">{t("dialog.importSize")}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,text/html"
            className="sr-only"
            onChange={event => onImportFile(event.target.files?.[0])}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(notesBookmark)} onOpenChange={open => !open && setNotesBookmark(null)}>
        <DialogContent className="fihrist-panel rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">{t("dialog.privateNote")}</p>
            <DialogTitle className="fihrist-heading line-clamp-2 text-xl tracking-[-0.03em]">{bookmarkLabel(notesBookmark, t("common.untitled"))}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={event => setNotesDraft(event.target.value)}
            placeholder={t("dialog.notePlaceholder")}
            className="fihrist-input min-h-40 rounded-xl"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setNotesBookmark(null)}>{t("common.cancel")}</Button>
            <Button
              className="fihrist-primary-action rounded-xl"
              disabled={!notesBookmark || updateNotes.isPending}
              onClick={() => notesBookmark && updateNotes.mutate({ id: notesBookmark.id, notes: notesDraft.trim() || null })}
            >
              {updateNotes.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Check className="me-2 h-4 w-4" />}
              {t("dialog.saveNote")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteBookmark)}
        onOpenChange={open => !open && setDeleteBookmark(null)}
        title={t("confirm.removeBookmarkTitle")}
        description={t("confirm.removeBookmarkBody")}
        confirmLabel={t("confirm.removeBookmarkAction")}
        pending={removeBookmark.isPending}
        onConfirm={() => deleteBookmark && removeBookmark.mutate({ id: deleteBookmark.id })}
      />
      <ConfirmDialog
        open={Boolean(deleteCollection)}
        onOpenChange={open => !open && setDeleteCollection(null)}
        title={t("confirm.removeCollectionTitle")}
        description={t("confirm.removeCollectionBody")}
        confirmLabel={t("confirm.removeCollectionAction")}
        pending={removeCollection.isPending}
        onConfirm={() => deleteCollection && removeCollection.mutate({ id: deleteCollection.id })}
      />
      <ConfirmDialog
        open={healthDeleteIds.length > 0}
        onOpenChange={open => !open && setHealthDeleteIds([])}
        title={t("confirm.removeManyTitle", { count: healthDeleteIds.length })}
        description={t("confirm.removeManyBody")}
        confirmLabel={t("confirm.removeManyAction", { count: healthDeleteIds.length })}
        pending={bulkRemoveBookmarks.isPending}
        onConfirm={() => healthDeleteIds.length && bulkRemoveBookmarks.mutate({ ids: healthDeleteIds })}
      />
    </DashboardLayout>
  );
}

export function BookmarksView({
  bookmarks,
  collections,
  loading,
  totalCount = bookmarks.length,
  hasMore = false,
  loadingMore = false,
  onLoadMore = () => undefined,
  search,
  onSearch,
  selectedCollectionId,
  onClearCollection,
  onAddBookmark,
  onMove,
  moving,
  onAddTag,
  onRemoveTag,
  onEditNotes,
  onDelete,
  onOpenTimeline,
  selectedIds,
  allVisibleSelected,
  onToggleSelection,
  onToggleAll,
  onClearSelection,
  onBulkMove,
  bulkMoving,
  onBulkAddTag,
  bulkTagging,
  onAnalyze,
  analyzingBookmarkId,
  aiConfigured,
  aiSuggestions,
  onSuggestAiTags,
  suggestingAiTags,
  suggestingBookmarkId,
  onApproveAiTag,
  onRejectAiTag,
}: {
  bookmarks: BookmarkRecord[];
  collections: Collection[];
  loading: boolean;
  totalCount?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  search: string;
  onSearch: (value: string) => void;
  selectedCollectionId: number | null;
  onClearCollection: () => void;
  onAddBookmark: () => void;
  onMove: (bookmarkId: number, collectionId: number | null) => void;
  moving: boolean;
  onAddTag: (bookmarkId: number, name: string) => void;
  onRemoveTag: (bookmarkId: number, tagId: number) => void;
  onEditNotes: (bookmark: BookmarkRecord) => void;
  onDelete: (bookmark: BookmarkRecord) => void;
  onOpenTimeline: (bookmarkId: number) => void;
  selectedIds: Set<number>;
  allVisibleSelected: boolean;
  onToggleSelection: (bookmarkId: number, checked: boolean) => void;
  onToggleAll: () => void;
  onClearSelection: () => void;
  onBulkMove: (collectionId: number | null) => void;
  bulkMoving: boolean;
  onBulkAddTag: (name: string) => void;
  bulkTagging: boolean;
  onAnalyze: (bookmarkId: number) => void;
  analyzingBookmarkId: number | null;
  aiConfigured: boolean;
  aiSuggestions: AiTagSuggestionRecord[];
  onSuggestAiTags: (bookmarkId: number) => void;
  suggestingAiTags: boolean;
  suggestingBookmarkId: number | null;
  onApproveAiTag: (suggestionId: number) => void;
  onRejectAiTag: (suggestionId: number) => void;
}) {
  const { t } = useLocale();
  const selectedCollection = collections.find(collection => collection.id === selectedCollectionId);
  const [bulkTagDraft, setBulkTagDraft] = useState("");
  const submitBulkTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bulkTagDraft.trim()) return;
    onBulkAddTag(bulkTagDraft.trim());
    setBulkTagDraft("");
  };
  return (
    <section className="mx-auto max-w-6xl" aria-busy={loading}>
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="fihrist-muted mb-2 text-xs font-semibold uppercase tracking-[0.17em]">
            {selectedCollection ? t("library.eyebrow.collection") : t("library.eyebrow.library")}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="fihrist-heading text-3xl font-semibold tracking-[-0.045em] sm:text-[2.15rem]">
              {selectedCollection?.name ?? t("library.title.allLinks")}
            </h1>
            {selectedCollection ? (
              <button className="fihrist-subtle-action rounded-full px-3 py-1 text-xs font-medium" onClick={onClearCollection}>
                {t("library.clearFilter")}
              </button>
            ) : null}
          </div>
          <p className="fihrist-muted mt-2 text-sm">
            {t("library.savedLinks", { count: totalCount })}
            {search ? ` ${t("library.matchingSearch")}` : ""}
          </p>
        </div>
        <Button onClick={onAddBookmark} className="fihrist-primary-action hidden h-11 rounded-xl px-4 lg:inline-flex">
          <Plus className="me-2 h-4 w-4" /> {t("app.addBookmark")}
        </Button>
      </div>

      <div className="relative mb-7 max-w-xl">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={event => onSearch(event.target.value)}
          aria-label={t("library.searchAria")}
          placeholder={t("library.searchPlaceholder")}
          className="fihrist-input h-12 rounded-2xl ps-10 pe-10 shadow-sm"
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="absolute end-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label={t("library.clearSearch")}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {bookmarks.length ? (
        <div className="fihrist-panel mb-6 rounded-2xl border p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleAll}
                className="h-4 w-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("library.selectAllVisible")}
              />
              {allVisibleSelected ? t("library.allVisibleSelected") : t("library.selectVisible")}
            </label>
            {selectedIds.size ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="toolbar" aria-label={t("library.bulkActions")}>
                <span className="fihrist-subtle-action rounded-full px-2.5 py-1 text-xs font-semibold">
                  {t("library.selectedCount", { count: selectedIds.size })}
                </span>
                <Select onValueChange={value => onBulkMove(value === "none" ? null : Number(value))} disabled={bulkMoving}>
                  <SelectTrigger className="fihrist-input h-8 w-[168px] rounded-lg text-xs">
                    <SelectValue placeholder={t("library.moveToCollection")} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none">{t("library.removeFromCollection")}</SelectItem>
                    {collections.map(collection => <SelectItem key={collection.id} value={String(collection.id)}>{collection.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <form onSubmit={submitBulkTag} className="fihrist-input flex h-8 min-w-[180px] flex-1 items-center rounded-lg border px-2">
                  <Tag className="me-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    value={bulkTagDraft}
                    onChange={event => setBulkTagDraft(event.target.value)}
                    maxLength={96}
                    placeholder={t("library.addTagToSelected")}
                    className="h-7 min-w-0 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button type="submit" variant="ghost" size="sm" disabled={!bulkTagDraft.trim() || bulkTagging} className="h-6 rounded-md px-1.5 text-xs text-primary">
                    {t("common.add")}
                  </Button>
                </form>
                <button type="button" onClick={onClearSelection} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  {t("common.clear")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? <BookmarkSkeletons /> : null}
      {!loading && !bookmarks.length ? <EmptyBookmarks hasSearch={Boolean(search)} onAddBookmark={onAddBookmark} /> : null}
      {!loading && bookmarks.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bookmarks.map(bookmark => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              collections={collections}
              moving={moving}
              onMove={onMove}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              onEditNotes={onEditNotes}
              onDelete={onDelete}
              onOpenTimeline={onOpenTimeline}
              selected={selectedIds.has(bookmark.id)}
              onToggleSelection={onToggleSelection}
              onAnalyze={onAnalyze}
              analyzing={analyzingBookmarkId === bookmark.id}
              aiConfigured={aiConfigured}
              aiSuggestions={aiSuggestions.filter(suggestion => suggestion.bookmarkId === bookmark.id)}
              onSuggestAiTags={onSuggestAiTags}
              suggestingAiTags={suggestingAiTags}
              suggestingBookmarkId={suggestingBookmarkId}
              onApproveAiTag={onApproveAiTag}
              onRejectAiTag={onRejectAiTag}
            />
          ))}
        </div>
      ) : null}
      {!loading && hasMore ? <div className="mt-6 flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore} className="rounded-xl">{loadingMore ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}{t("library.loadMoreLinks")}</Button></div> : null}
    </section>
  );
}

export function BookmarkCard({
  bookmark,
  collections,
  moving,
  onMove,
  onAddTag,
  onRemoveTag,
  onEditNotes,
  onDelete,
  onOpenTimeline,
  selected,
  onToggleSelection,
  onAnalyze,
  analyzing,
  aiConfigured,
  aiSuggestions,
  onSuggestAiTags,
  suggestingAiTags,
  suggestingBookmarkId,
  onApproveAiTag,
  onRejectAiTag,
}: {
  bookmark: BookmarkRecord;
  collections: Collection[];
  moving: boolean;
  onMove: (bookmarkId: number, collectionId: number | null) => void;
  onAddTag: (bookmarkId: number, name: string) => void;
  onRemoveTag: (bookmarkId: number, tagId: number) => void;
  onEditNotes: (bookmark: BookmarkRecord) => void;
  onDelete: (bookmark: BookmarkRecord) => void;
  onOpenTimeline: (bookmarkId: number) => void;
  selected: boolean;
  onToggleSelection: (bookmarkId: number, checked: boolean) => void;
  onAnalyze: (bookmarkId: number) => void;
  analyzing: boolean;
  aiConfigured: boolean;
  aiSuggestions: AiTagSuggestionRecord[];
  onSuggestAiTags: (bookmarkId: number) => void;
  suggestingAiTags: boolean;
  suggestingBookmarkId: number | null;
  onApproveAiTag: (suggestionId: number) => void;
  onRejectAiTag: (suggestionId: number) => void;
}) {
  const { t, locale } = useLocale();
  const [tagDraft, setTagDraft] = useState("");
  const appearance = healthAppearance(bookmark.healthStatus, locale);
  const title = bookmarkLabel(bookmark, t("common.untitled"));
  // The collection owns the cover's masthead band colour.
  const collectionName = bookmark.collectionId
    ? collections.find(collection => collection.id === bookmark.collectionId)?.name ?? null
    : null;
  const addTagForBookmark = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tagDraft.trim()) return;
    onAddTag(bookmark.id, tagDraft.trim());
    setTagDraft("");
  };

  return (
    <article className={`fihrist-card group flex flex-col overflow-hidden rounded-[0.85rem] border transition duration-200 hover:-translate-y-0.5 ${selected ? "border-primary ring-2 ring-primary/25" : ""}`}>
      <BookmarkCover
        host={bookmark.host}
        imageUrl={bookmark.imageUrl}
        collectionName={collectionName}
        title={title}
      />
      <div className="flex flex-1 flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={event => onToggleSelection(bookmark.id, event.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("card.selectBookmark", { title })}
          />
          <Favicon bookmark={bookmark} />
        </div>
        <Badge className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${appearance.className}`}>
          {appearance.label}
        </Badge>
      </div>
      <a href={bookmark.url} target="_blank" rel="noreferrer" className="group/title rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" dir={bookmark.contentDirection}>
        <h2 className="fihrist-heading fihrist-display line-clamp-2 text-[1.06rem] font-semibold leading-6 tracking-[-0.025em] group-hover/title:text-primary">
          {title}
          <ArrowUpRight className="mb-0.5 ms-1 inline h-3.5 w-3.5 opacity-0 transition-opacity group-hover/title:opacity-100" />
        </h2>
      </a>
      <p className="fihrist-muted mt-2 line-clamp-2 text-sm leading-5" dir={bookmark.contentDirection}>
        {bookmark.ingestionStatus === "processing" || bookmark.ingestionStatus === "pending"
          ? t("card.collapsing")
          : bookmark.scrapeError
            ? t("card.scrapeFailed")
            : bookmark.description || t("card.noDescription")}
      </p>
      <BookmarkInsight bookmark={bookmark} onAnalyze={onAnalyze} analyzing={analyzing} />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {bookmark.tags.slice(0, 4).map(tag => (
          <span key={tag.id} className="group/tag inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">
            {tag.name}
            <button
              onClick={() => onRemoveTag(bookmark.id, tag.id)}
              className="inline-flex rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/tag:opacity-100"
              aria-label={t("card.removeTag", { tag: tag.name })}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {bookmark.tags.length > 4 ? <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">+{bookmark.tags.length - 4}</span> : null}
      </div>
      <AiTagSuggestions
        bookmarkId={bookmark.id}
        title={title}
        configured={aiConfigured}
        suggestions={aiSuggestions}
        suggesting={suggestingAiTags}
        onSuggest={() => onSuggestAiTags(bookmark.id)}
        onApprove={onApproveAiTag}
        onReject={onRejectAiTag}
      />
      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Select
            value={bookmark.collectionId ? String(bookmark.collectionId) : "none"}
            onValueChange={value => onMove(bookmark.id, value === "none" ? null : Number(value))}
            disabled={moving}
          >
            <SelectTrigger aria-label={t("card.collectionFor", { title })} className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none focus:ring-0">
              <Folder className="me-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder={t("dialog.noCollection")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="none">{t("dialog.noCollection")}</SelectItem>
              {collections.map(collection => <SelectItem key={collection.id} value={String(collection.id)}>{collection.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => onOpenTimeline(bookmark.id)}
            className="rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label={t("timeline.openAria", { title })}
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onEditNotes(bookmark)} className="rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={t("card.editNotes", { title })}>{t("card.notes")}</button>
          <button type="button" onClick={() => onDelete(bookmark)} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t("card.removeBookmark", { title })}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <form className="mt-3 flex items-center gap-2" onSubmit={addTagForBookmark}>
          <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={tagDraft}
            onChange={event => setTagDraft(event.target.value)}
            maxLength={96}
            aria-label={t("card.addTag", { title })}
            placeholder={t("card.addTagPlaceholder")}
            className="h-7 min-w-0 border-0 bg-transparent px-0 text-xs text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={!tagDraft.trim()} aria-label={t("card.addTag", { title })} className="h-7 rounded-md px-1.5 text-xs text-primary">{t("common.add")}</Button>
        </form>
      </div>
      </div>
    </article>
  );
}

function BookmarkInsight({
  bookmark,
  onAnalyze,
  analyzing,
}: {
  bookmark: BookmarkRecord;
  onAnalyze: (bookmarkId: number) => void;
  analyzing: boolean;
}) {
  const { t } = useLocale();
  const hasInsight = bookmark.analysisStatus === "ready" && bookmark.analysisSummary;
  const canAnalyze = bookmark.ingestionStatus === "ready" && Boolean(bookmark.contentText || bookmark.description || bookmark.title);

  if (hasInsight) {
    return (
      <section className="fihrist-insight mt-3 rounded-xl border px-3 py-2.5" dir={bookmark.contentDirection} aria-label={t("card.insightAria")}>
        <div className="fihrist-insight-label mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
          <Sparkles className="h-3.5 w-3.5" /> {t("card.insightLabel")}
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-foreground">{bookmark.analysisSummary}</p>
        <div className="fihrist-muted mt-2 grid gap-1.5 border-t border-primary/25 pt-2 text-[11px] leading-4">
          {bookmark.savedReason ? <p><span className="fihrist-insight-label font-semibold">{t("card.insightWhySave")}</span>{" "}<span className="fihrist-highlight">{bookmark.savedReason}</span></p> : null}
          {bookmark.savingBenefit ? <p><span className="fihrist-insight-label font-semibold">{t("card.insightBenefit")}</span> {bookmark.savingBenefit}</p> : null}
        </div>
      </section>
    );
  }

  if (analyzing || bookmark.analysisStatus === "processing") {
    return (
      <div className="fihrist-muted mt-3 flex items-center gap-2 text-xs" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("card.insightPreparing")}
      </div>
    );
  }

  if (bookmark.analysisStatus === "failed") {
    return (
      <div className="fihrist-danger mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs" role="alert">
        <span className="line-clamp-2">{bookmark.analysisError || t("card.insightFailed")}</span>
        <button type="button" onClick={() => onAnalyze(bookmark.id)} className="shrink-0 rounded-md px-1.5 py-1 font-semibold text-destructive hover:bg-destructive/10">
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!canAnalyze}
      onClick={() => onAnalyze(bookmark.id)}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55"
      title={canAnalyze ? t("card.analyzeTooltip") : t("card.analyzeUnavailable")}
    >
      <Sparkles className="h-3.5 w-3.5" /> {t("card.analyzeValue")}
    </button>
  );
}

export function CollectionsView({
  collections,
  bookmarks,
  selectedCollectionId,
  onSelectCollection,
  collectionDraft,
  setCollectionDraft,
  createCollection,
  creating,
  editingCollection,
  editingCollectionName,
  onEdit,
  setEditingCollectionName,
  onCancelEdit,
  onSaveEdit,
  renamePending,
  onDelete,
}: {
  collections: Collection[];
  bookmarks: BookmarkRecord[];
  selectedCollectionId: number | null;
  onSelectCollection: (collectionId: number) => void;
  collectionDraft: string;
  setCollectionDraft: (value: string) => void;
  createCollection: (name: string) => void;
  creating: boolean;
  editingCollection: number | null;
  editingCollectionName: string;
  onEdit: (collection: Collection) => void;
  setEditingCollectionName: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (collection: Collection) => void;
  renamePending: boolean;
  onDelete: (collection: Collection) => void;
}) {
  const { t } = useLocale();
  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (collectionDraft.trim()) createCollection(collectionDraft.trim());
  };
  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="fihrist-muted mb-2 text-xs font-semibold uppercase tracking-[0.17em]">{t("collections.eyebrow")}</p>
        <h1 className="fihrist-heading text-3xl font-semibold tracking-[-0.045em] sm:text-[2.15rem]">{t("collections.title")}</h1>
        <p className="fihrist-muted mt-2 text-sm">{t("collections.body")}</p>
      </div>
      <form onSubmit={onCreate} className="mb-8 flex max-w-lg gap-2">
        <Input
          value={collectionDraft}
          onChange={event => setCollectionDraft(event.target.value)}
          placeholder={t("collections.namePlaceholder")}
          aria-label={t("collections.nameAria")}
          className="fihrist-input h-11 rounded-xl"
        />
        <Button disabled={creating} className="fihrist-primary-action h-11 shrink-0 rounded-xl">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="me-2 h-4 w-4" />}
          <span className="hidden sm:inline">{t("collections.create")}</span>
        </Button>
      </form>
      {!collections.length ? (
        <div className="fihrist-empty rounded-[1.4rem] border border-dashed p-8 text-center">
          <Folder className="mx-auto mb-3 h-6 w-6 text-primary" />
          <p className="fihrist-heading font-medium">{t("collections.emptyTitle")}</p>
          <p className="fihrist-muted mx-auto mt-1 max-w-sm text-sm leading-6">{t("collections.emptyBody")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map(collection => {
            const count = bookmarks.filter(bookmark => bookmark.collectionId === collection.id).length;
            const isEditing = editingCollection === collection.id;
            return (
              <article key={collection.id} className="fihrist-card rounded-[1.35rem] border p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Folder className="h-5 w-5" /></span>
                  <button onClick={() => onDelete(collection)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t("collections.delete", { name: collection.name })}><Trash2 className="h-4 w-4" /></button>
                </div>
                {isEditing ? (
                  <div className="flex gap-2">
                    <Input autoFocus value={editingCollectionName} onChange={event => setEditingCollectionName(event.target.value)} className="fihrist-input h-9 rounded-lg" />
                    <Button size="icon" disabled={renamePending || !editingCollectionName.trim()} onClick={() => onSaveEdit(collection)} className="fihrist-primary-action h-9 w-9 rounded-lg"><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={onCancelEdit} className="h-9 w-9 rounded-lg"><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <>
                    <button className="flex w-full items-center justify-between gap-3 text-start" onClick={() => onSelectCollection(collection.id)}>
                      <h2 className="fihrist-heading truncate text-lg font-semibold tracking-[-0.025em]">{collection.name}</h2>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <p className="fihrist-muted mt-1.5 text-sm">{t("collections.linkCount", { count })}</p>
                    <button className="mt-5 inline-flex items-center text-xs font-medium text-primary hover:text-primary/80" onClick={() => onEdit(collection)}><Pencil className="me-1.5 h-3.5 w-3.5" />{t("collections.rename")}</button>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

type HealthFilter = BookmarkRecord["healthStatus"] | "all" | "confirmed";

function isConfirmedBroken(bookmark: BookmarkRecord) {
  return bookmark.healthStatus === "broken" && (bookmark.httpStatus === 404 || bookmark.httpStatus === 410);
}

export function HealthView({
  data,
  loading,
  onQueue,
  queuePending,
  onEnable,
  enablePending,
  onPause,
  pausePending,
  onOpenBookmark,
  onRequestDelete,
  onOpenTimeline,
  filterRequest,
  deletePending,
  hasMore = false,
  loadingMore = false,
  onLoadMore = () => undefined,
  runProgress = null,
}: {
  data: {
    bookmarks: BookmarkRecord[];
    counts: Record<BookmarkRecord["healthStatus"], number>;
    settings: { enabled: boolean; lastRunAt: Date | null };
  } | undefined;
  loading: boolean;
  onQueue: () => void;
  queuePending: boolean;
  onEnable: () => void;
  enablePending: boolean;
  onPause: () => void;
  pausePending: boolean;
  onOpenBookmark: () => void;
  onRequestDelete: (ids: number[]) => void;
  onOpenTimeline: (bookmarkId: number) => void;
  filterRequest?: { filter: HealthFilter; nonce: number } | null;
  deletePending: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  runProgress?: {
    total: number;
    checked: number;
    pending: number;
    processing: number;
    failed: number;
    startedAt: Date | null;
    completedAt: Date | null;
  } | null;
}) {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const bookmarks = data?.bookmarks ?? [];
  const confirmedCount = bookmarks.filter(isConfirmedBroken).length;
  const reviewCount = data?.counts.needs_review ?? 0;

  useEffect(() => {
    if (!filterRequest) return;
    setFilter(filterRequest.filter);
  }, [filterRequest?.nonce]);

  const cards = [
    { filter: "healthy", count: data?.counts.healthy ?? 0, className: healthAppearance("healthy", locale).className },
    { filter: "redirected", count: data?.counts.redirected ?? 0, className: healthAppearance("redirected", locale).className },
    { filter: "confirmed", count: confirmedCount, className: healthAppearance("broken", locale).className },
    { filter: "needs_review", count: reviewCount, className: healthAppearance("needs_review", locale).className },
    { filter: "unchecked", count: data?.counts.unchecked ?? 0, className: healthAppearance("unchecked", locale).className },
  ] satisfies readonly { readonly filter: HealthFilter; readonly count: number; readonly className: string }[];
  const filterChecks: Record<HealthFilter, (bookmark: BookmarkRecord) => boolean> = {
    all: () => true,
    healthy: bookmark => bookmark.healthStatus === "healthy",
    redirected: bookmark => bookmark.healthStatus === "redirected",
    broken: bookmark => bookmark.healthStatus === "broken",
    unchecked: bookmark => bookmark.healthStatus === "unchecked",
    needs_review: bookmark => bookmark.healthStatus === "needs_review",
    confirmed: isConfirmedBroken,
  };
  // A filter that is not one of the summary cards (the digest's broken
  // overflow links here) must still say what it is showing.
  const filterLabel = (() => {
    if (filter === "all") return t("health.filterAll");
    if (filter === "broken") return t("health.filterBroken");
    if (filter === "confirmed") return t("health.filterConfirmed");
    return healthStateLabels[filter][locale];
  })();
  const visibleBookmarks = bookmarks.filter(filterChecks[filter]);
  // Network and server failures aren't proof a bookmark is gone. Only offer
  // bulk deletion for consistently confirmed HTTP 404/410 responses.
  const deletableBookmarks = visibleBookmarks.filter(isConfirmedBroken);
  const selectedIdSet = new Set(selectedIds);
  const allDeletableSelected = Boolean(deletableBookmarks.length) && deletableBookmarks.every(bookmark => selectedIdSet.has(bookmark.id));

  useEffect(() => {
    if (!data) return;
    const availableIds = new Set(data.bookmarks.map(bookmark => bookmark.id));
    setSelectedIds(ids => ids.filter(id => availableIds.has(id)));
  }, [data]);

  const toggleVisibleSelection = () => {
    const visibleIds = deletableBookmarks.map(bookmark => bookmark.id);
    setSelectedIds(ids => allDeletableSelected
      ? ids.filter(id => !visibleIds.includes(id))
      : Array.from(new Set([...ids, ...visibleIds]))
    );
  };

  return (
    <section className="mx-auto max-w-6xl" aria-busy={loading}>
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="fihrist-muted mb-2 text-xs font-semibold uppercase tracking-[0.17em]">{t("health.eyebrow")}</p>
          <h1 className="fihrist-heading text-3xl font-semibold tracking-[-0.045em] sm:text-[2.15rem]">{t("health.title")}</h1>
          <p className="fihrist-muted mt-2 text-sm">{t("health.body")}</p>
        </div>
        <Button onClick={onQueue} disabled={queuePending} className="fihrist-primary-action h-11 rounded-xl">
          {queuePending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <HeartPulse className="me-2 h-4 w-4" />}
          {t("health.checkNow")}
        </Button>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(card => {
          const active = filter === card.filter;
          const label = healthStateLabels[card.filter === "confirmed" ? "broken" : card.filter as BookmarkRecord["healthStatus"]][locale];
          const filterDescription = card.filter === "confirmed" ? t("health.filterConfirmed") : label;
          return <button type="button" aria-pressed={active} aria-label={t("health.showFilter", { description: filterDescription, count: card.count })} key={card.filter} onClick={() => { setFilter(current => current === card.filter ? "all" : card.filter); setSelectedIds([]); }} className={`fihrist-card rounded-2xl border p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-2 ring-primary/20" : ""}`}><p className="fihrist-muted text-xs font-medium">{label}</p><p className="fihrist-heading mt-1 text-2xl font-semibold tracking-[-0.04em]">{card.count}</p><span className={`mt-3 inline-block h-1.5 w-12 rounded-full ${card.className.split(" ")[0]}`} /></button>;
        })}
      </div>
      <HealthRunProgress progress={runProgress} />
      <div className="fihrist-health-callout mb-6 flex flex-col gap-4 rounded-[1.35rem] border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">{t("health.weeklyTitle")}</p>
            <p className="fihrist-muted mt-1 text-sm leading-5">
              {data?.settings.enabled
                ? t("health.weeklyActive", {
                    relative: data.settings.lastRunAt
                      ? formatRelativeTime(data.settings.lastRunAt, locale)
                      : "",
                  })
                : t("health.weeklyInactive")}
            </p>
            {data?.settings.lastRunAt ? (
              <HealthStamp
                variant={reviewCount > 0 || confirmedCount > 0 ? "review" : "checked"}
                className="mt-3"
              />
            ) : null}
          </div>
        </div>
        {data?.settings.enabled ? (
          <Button variant="outline" disabled={pausePending} onClick={onPause} className="fihrist-health-action rounded-xl">{pausePending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}{t("health.pause")}</Button>
        ) : (
          <Button disabled={enablePending} onClick={onEnable} className="fihrist-primary-action rounded-xl">{enablePending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Check className="me-2 h-4 w-4" />}{t("health.activate")}</Button>
        )}
      </div>
      {bookmarks.length ? (
        <div className="fihrist-panel mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-3" role="toolbar" aria-label={t("health.actions")}>
          <span className="fihrist-muted text-xs font-medium">{t("health.shown", { count: visibleBookmarks.length })}</span>
          {filter !== "all" ? (
            <span className="fihrist-subtle-action rounded-full px-2.5 py-1 text-xs font-medium">
              {t("health.activeFilter", { label: filterLabel })}
            </span>
          ) : null}
          {filter !== "all" ? <button type="button" onClick={() => { setFilter("all"); setSelectedIds([]); }} className="fihrist-subtle-action rounded-lg px-2.5 py-1.5 text-xs font-medium">{t("health.showAll")}</button> : null}
          {deletableBookmarks.length ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={allDeletableSelected} onChange={toggleVisibleSelection} className="h-4 w-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("health.selectVisibleUnhealthy")} />
              {t("health.selectVisible")}
            </label>
          ) : null}
          {selectedIds.length ? <Button type="button" variant="outline" disabled={deletePending} onClick={() => onRequestDelete(selectedIds)} className="ms-auto h-8 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="me-1.5 h-3.5 w-3.5" />{t("health.deleteSelected")}</Button> : null}
          {confirmedCount ? <Button type="button" variant="outline" disabled={deletePending} onClick={() => onRequestDelete(bookmarks.filter(isConfirmedBroken).map(bookmark => bookmark.id))} className={`${selectedIds.length ? "" : "ms-auto"} h-8 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-destructive/10`}>{t("health.deleteAllConfirmed")}</Button> : null}
        </div>
      ) : null}
      {loading ? <BookmarkSkeletons /> : null}
      {!loading && !data?.bookmarks.length ? <EmptyHealth onOpenBookmark={onOpenBookmark} /> : null}
      {!loading && visibleBookmarks.length ? (
        <div className="fihrist-card overflow-hidden rounded-[1.35rem] border">
          {visibleBookmarks.map((bookmark, index) => {
            const appearance = healthAppearance(bookmark.healthStatus, locale);
            const label = appearance.label;
            const title = bookmarkLabel(bookmark, t("common.untitled"));
            return <div key={bookmark.id} className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${index ? "border-t border-border" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">{isConfirmedBroken(bookmark) ? <input type="checkbox" checked={selectedIdSet.has(bookmark.id)} onChange={event => setSelectedIds(ids => event.target.checked ? Array.from(new Set([...ids, bookmark.id])) : ids.filter(id => id !== bookmark.id))} className="h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("card.selectBookmark", { title })} /> : null}<Favicon bookmark={bookmark} /><div className="min-w-0"><a href={bookmark.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-foreground hover:text-primary">{title}</a><p className="fihrist-muted mt-1 truncate text-xs">{bookmark.healthError || (bookmark.lastCheckedAt ? t("health.checked", { relative: formatRelativeTime(bookmark.lastCheckedAt, locale) }) : t("common.notCheckedYet"))}</p></div></div>
              <div className="flex shrink-0 items-center gap-3"><span className="text-xs text-muted-foreground" dir="ltr">{bookmark.httpStatus ? t("common.httpCode", { code: bookmark.httpStatus }) : ""}</span><Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${appearance.className}`}>{label}</Badge><button type="button" onClick={() => onOpenTimeline(bookmark.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={t("timeline.openAria", { title })}><History className="h-4 w-4" /></button>{isConfirmedBroken(bookmark) ? <button type="button" disabled={deletePending} onClick={() => onRequestDelete([bookmark.id])} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label={t("card.removeBookmark", { title })}><Trash2 className="h-4 w-4" /></button> : null}</div>
            </div>;
          })}
        </div>
      ) : null}
      {!loading && hasMore ? <div className="mt-6 flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore} className="rounded-xl">{loadingMore ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}{t("health.loadMore")}</Button></div> : null}
      {!loading && bookmarks.length > 0 && visibleBookmarks.length === 0 ? <div className="fihrist-empty rounded-[1.35rem] border border-dashed p-8 text-center"><p className="fihrist-heading font-medium">{t("health.emptyStatusTitle")}</p><button type="button" onClick={() => { setFilter("all"); setSelectedIds([]); }} className="mt-2 text-sm font-medium text-primary hover:text-primary/80">{t("health.emptyStatusBody")}</button></div> : null}
    </section>
  );
}

function Favicon({ bookmark }: { bookmark: BookmarkRecord }) {
  return <span className="fihrist-empty grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border text-primary">{bookmark.faviconUrl ? <img src={bookmark.faviconUrl} alt="" className="h-4 w-4 object-contain" onError={event => { event.currentTarget.style.display = "none"; }} /> : <Bookmark className="h-3.5 w-3.5" />}</span>;
}

function EmptyBookmarks({ hasSearch, onAddBookmark }: { hasSearch: boolean; onAddBookmark: () => void }) {
  const { t } = useLocale();
  return <div className="fihrist-empty flex flex-col items-center rounded-[1.5rem] border border-dashed px-6 py-12 text-center">
    <img
      className="fihrist-empty-art"
      src={hasSearch ? "/kiosk/empty-search.webp" : "/kiosk/empty-library.webp"}
      alt=""
      width={1000}
      height={1000}
      loading="lazy"
      decoding="async"
    />
    <h2 className="fihrist-heading mt-5 text-lg font-semibold tracking-[-0.025em]">{hasSearch ? t("empty.noMatchTitle") : t("empty.readyTitle")}</h2>
    <p className="fihrist-muted mx-auto mt-2 max-w-sm text-sm leading-6">{hasSearch ? t("empty.noMatchBody") : t("empty.readyBody")}</p>
    {!hasSearch ? <Button onClick={onAddBookmark} className="fihrist-primary-action mt-5 rounded-xl"><Plus className="me-2 h-4 w-4" />{t("empty.saveFirst")}</Button> : null}
  </div>;
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return <div className="fihrist-danger rounded-[1.5rem] border p-8 text-center" role="alert"><CircleAlert className="mx-auto mb-3 h-7 w-7" /><h2 className="fihrist-heading text-lg font-semibold">{t("error.loadTitle")}</h2><p className="mt-2 text-sm">{t("error.loadBody")}</p><Button type="button" variant="outline" onClick={onRetry} className="mt-5 rounded-xl">{t("error.tryAgain")}</Button></div>;
}

/** Visible, honest progress for health-check sweeps: x of y, ETA, last full run. */
function HealthRunProgress({
  progress,
}: {
  progress?: {
    total: number;
    checked: number;
    pending: number;
    processing: number;
    failed: number;
    startedAt: Date | null;
    completedAt: Date | null;
  } | null;
}) {
  const { t, locale } = useLocale();
  if (!progress || !progress.total) return null;
  const active = !progress.completedAt && (progress.pending > 0 || progress.processing > 0);
  const percent = Math.min(100, Math.round((progress.checked / Math.max(1, progress.total)) * 100));
  const elapsedMin = progress.startedAt
    ? Math.max(0.1, (Date.now() - new Date(progress.startedAt).getTime()) / 60000)
    : 0;
  const rate = elapsedMin > 0 ? progress.checked / elapsedMin : 0;
  const remaining = progress.total - progress.checked;
  const etaMin = rate > 0 && remaining > 0 ? Math.ceil(remaining / rate) : null;
  return (
    <div className="fihrist-panel mb-6 rounded-[1.35rem] border p-5" aria-live="polite" aria-label={t("health.progressAria")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {active ? (
            <>{t("health.progressActive", { checked: progress.checked, total: progress.total })}</>
          ) : (
            <>{t("health.progressLast", {
              total: progress.total,
              relative: progress.completedAt ? ` ${formatRelativeTime(progress.completedAt, locale)}` : "",
            })}</>
          )}
        </p>
        <p className="fihrist-muted text-xs">
          {active ? (
            <>{t("health.progressRemaining", {
              count: progress.pending + progress.processing,
              eta: etaMin !== null && etaMin < 600 ? t("health.progressEta", { count: etaMin }) : "",
              failed: progress.failed ? t("health.progressFailed", { count: progress.failed }) : "",
            })}</>
          ) : (
            <>{t("health.progressIdle")}</>
          )}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("health.progressAria")}>
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function QueueStatusError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return <div className="fihrist-danger mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm" role="alert"><span>{t("queue.error")}</span><Button type="button" variant="outline" onClick={onRetry} className="h-8 rounded-lg text-xs">{t("queue.retryStatus")}</Button></div>;
}

function QueueStatusBanner({ summary, retryPending, onRetry }: { summary: JobQueueSummary; retryPending: boolean; onRetry: () => void }) {
  const { t } = useLocale();
  if (!summary.pending && !summary.processing && !summary.failed) return null;
  const activeCount = summary.pending + summary.processing;
  return <section className={`fihrist-panel mx-auto mb-6 flex max-w-6xl flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${summary.failed ? "border-amber-500/30" : ""}`} aria-live="polite" aria-label={t("queue.aria")}>
    <div className="flex min-w-0 items-start gap-3">
      {summary.failed ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
      <p className="text-sm leading-5">
        {activeCount
          ? t(activeCount === 1 ? "queue.running" : "queue.runningPlural", { count: activeCount })
          : t("queue.needAttention")}
        {summary.failed
          ? ` ${t(summary.failed === 1 ? "queue.failed" : "queue.failedPlural", { count: summary.failed })}`
          : ""}
      </p>
    </div>
    {summary.failed ? <Button type="button" variant="outline" disabled={retryPending} onClick={onRetry} className="h-8 shrink-0 rounded-lg text-xs"><RotateCcw className={`me-1.5 h-3.5 w-3.5 ${retryPending ? "animate-spin" : ""}`} />{retryPending ? t("queue.requeuing") : t("queue.retry100")}</Button> : null}
  </section>;
}

function EmptyHealth({ onOpenBookmark }: { onOpenBookmark: () => void }) {
  const { t } = useLocale();
  return <div className="fihrist-empty flex flex-col items-center rounded-[1.5rem] border border-dashed px-6 py-12 text-center">
    <img className="fihrist-empty-art" src="/kiosk/empty-library.webp" alt="" width={1000} height={1000} loading="lazy" decoding="async" />
    <h2 className="fihrist-heading mt-5 text-lg font-semibold tracking-[-0.025em]">{t("health.emptyTitle")}</h2>
    <p className="fihrist-muted mx-auto mt-2 max-w-sm text-sm leading-6">{t("health.emptyBody")}</p>
    <Button variant="outline" onClick={onOpenBookmark} className="fihrist-health-action mt-5 rounded-xl">{t("health.emptyAction")}</Button>
  </div>;
}

function BookmarkSkeletons() {
  const { t } = useLocale();
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label={t("common.loading")}>{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[300px] animate-pulse rounded-[1.35rem] border border-border bg-muted" />)}</div>;
}

/** Pending AI tag suggestions — approve or reject each. Nothing auto-applies. */
function AiTagSuggestions({
  bookmarkId,
  title,
  configured,
  suggestions,
  suggesting,
  onSuggest,
  onApprove,
  onReject,
}: {
  bookmarkId: number;
  title: string;
  configured: boolean;
  suggestions: AiTagSuggestionRecord[];
  suggesting: boolean;
  onSuggest: () => void;
  onApprove: (suggestionId: number) => void;
  onReject: (suggestionId: number) => void;
}) {
  const { t } = useLocale();
  if (!configured && !suggestions.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-dashed border-border p-3" aria-label={t("ai.aria", { title })}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {t("ai.title")}
        </p>
        {configured ? (
          <button
            type="button"
            onClick={onSuggest}
            disabled={suggesting}
            className="fihrist-subtle-action rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            {suggesting ? t("ai.suggesting") : suggestions.length ? t("ai.suggestMore") : t("ai.suggest")}
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">{t("ai.notConfigured")}</span>
        )}
      </div>
      {suggestions.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map(suggestion => (
            <li
              key={suggestion.id}
              className="flex items-center gap-1 rounded-full bg-primary/10 py-1 ps-2.5 pe-1 text-[11px] font-medium text-foreground"
              dir="auto"
            >
              {suggestion.tagName}
              <button
                type="button"
                onClick={() => onApprove(suggestion.id)}
                className="rounded-full p-1 text-primary hover:bg-primary/20"
                aria-label={t("ai.approve", { tag: suggestion.tagName })}
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onReject(suggestion.id)}
                className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("ai.reject", { tag: suggestion.tagName })}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : configured ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t("ai.none")}</p>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pending, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; pending: boolean; onConfirm: () => void }) {
  const { t } = useLocale();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="fihrist-panel rounded-2xl sm:max-w-md"><DialogHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5" /></div><DialogTitle className="fihrist-heading text-xl tracking-[-0.03em]">{title}</DialogTitle><DialogDescription className="fihrist-muted leading-6">{description}</DialogDescription></DialogHeader><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button disabled={pending} onClick={onConfirm} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">{pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Trash2 className="me-2 h-4 w-4" />}{confirmLabel}</Button></div></DialogContent></Dialog>;
}

function bookmarkLabel(bookmark: BookmarkRecord | null, fallback: string) {
  return bookmark?.title?.trim() || bookmark?.host || fallback;
}
