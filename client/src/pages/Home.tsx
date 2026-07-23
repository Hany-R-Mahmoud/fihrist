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
import { useFihristEvents } from "@/hooks/useFihristEvents";
import { trpc } from "@/lib/trpc";
import type { BookmarkRecord, JobQueueSummary } from "../../../server/db";
import { formatDistanceToNowStrict } from "date-fns";
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
  Inbox,
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

const healthAppearance: Record<BookmarkRecord["healthStatus"], { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "fihrist-health-healthy !bg-emerald-500/15 !text-emerald-800 dark:!text-emerald-300" },
  redirected: { label: "Redirected", className: "fihrist-health-redirected !bg-amber-500/15 !text-amber-800 dark:!text-amber-300" },
  broken: { label: "Broken", className: "fihrist-health-broken !bg-red-500/15 !text-red-800 dark:!text-red-300" },
  unchecked: { label: "Unchecked", className: "fihrist-health-unchecked !bg-muted !text-muted-foreground" },
};

export default function Home() {
  const utils = trpc.useUtils();
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
  const exportQuery = trpc.bookmarks.exportNetscape.useQuery(undefined, { enabled: false });

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
      utils.bookmarks.queueStatus.invalidate(),
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

  const addBookmark = trpc.bookmarks.add.useMutation({
    onSuccess: bookmark => {
      setUrlDraft("");
      setAddCollectionId("none");
      setAddOpen(false);
      toast.success("Bookmark saved", { description: "Retrieving page details now." });
      void refreshWorkspace();
    },
    onError: error => toast.error("Could not save bookmark", { description: error.message }),
  });
  const importBookmarks = trpc.bookmarks.importNetscape.useMutation({
    onSuccess: result => {
      setImportOpen(false);
      setSelectedCollectionId(null);
      setActiveView("collections");
      toast.success(`${result.importedCount} bookmark${result.importedCount === 1 ? "" : "s"} imported`, {
        description: `${result.collectionCount} collection${result.collectionCount === 1 ? "" : "s"}${result.uncategorizedCount ? `, ${result.uncategorizedCount} uncategorized` : ""}`,
      });
      void refreshWorkspace();
    },
    onError: error => toast.error("Could not import bookmarks", { description: error.message }),
  });
  const createCollection = trpc.collections.create.useMutation({
    onSuccess: () => {
      setCollectionDraft("");
      void refreshWorkspace();
      toast.success("Collection created");
    },
    onError: error => toast.error("Could not create collection", { description: error.message }),
  });
  const renameCollection = trpc.collections.rename.useMutation({
    onSuccess: () => {
      setEditingCollection(null);
      setEditingCollectionName("");
      void refreshWorkspace();
    },
    onError: error => toast.error("Could not rename collection", { description: error.message }),
  });
  const removeCollection = trpc.collections.remove.useMutation({
    onSuccess: () => {
      setDeleteCollection(null);
      if (selectedCollectionId === deleteCollection?.id) setSelectedCollectionId(null);
      void refreshWorkspace();
      toast.success("Collection deleted");
    },
    onError: error => toast.error("Could not delete collection", { description: error.message }),
  });
  const moveBookmark = trpc.bookmarks.move.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error("Could not move bookmark", { description: error.message }),
  });
  const updateNotes = trpc.bookmarks.updateNotes.useMutation({
    onSuccess: () => {
      setNotesBookmark(null);
      setNotesDraft("");
      void refreshWorkspace();
      toast.success("Notes updated");
    },
    onError: error => toast.error("Could not save notes", { description: error.message }),
  });
  const removeBookmark = trpc.bookmarks.remove.useMutation({
    onSuccess: () => {
      if (deleteBookmark) setSelectedBookmarkIds(ids => ids.filter(id => id !== deleteBookmark.id));
      setDeleteBookmark(null);
      void refreshWorkspace();
      toast.success("Bookmark removed");
    },
    onError: error => toast.error("Could not remove bookmark", { description: error.message }),
  });
  const bulkRemoveBookmarks = trpc.bookmarks.bulkRemove.useMutation({
    onSuccess: (result, variables) => {
      setSelectedBookmarkIds(ids => ids.filter(id => !variables.ids.includes(id)));
      setHealthDeleteIds([]);
      void refreshWorkspace();
      toast.success(`${result.deletedCount} bookmark${result.deletedCount === 1 ? "" : "s"} removed`);
    },
    onError: error => toast.error("Could not remove selected bookmarks", { description: error.message }),
  });
  const addTag = trpc.bookmarks.addTag.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error("Could not add tag", { description: error.message }),
  });
  const removeTag = trpc.bookmarks.removeTag.useMutation({
    onSuccess: () => void refreshWorkspace(),
    onError: error => toast.error("Could not remove tag", { description: error.message }),
  });
  const analyzeBookmark = trpc.bookmarks.analyze.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
      toast.success("Bookmark insight prepared");
    },
    onError: error => toast.error("Could not analyze this link", { description: error.message }),
  });
  const bulkMoveBookmarks = trpc.bookmarks.bulkMove.useMutation({
    onSuccess: result => {
      setSelectedBookmarkIds([]);
      void refreshWorkspace();
      toast.success(`${result.updatedCount} bookmark${result.updatedCount === 1 ? "" : "s"} moved`);
    },
    onError: error => toast.error("Could not move selected bookmarks", { description: error.message }),
  });
  const bulkAddTag = trpc.bookmarks.bulkAddTag.useMutation({
    onSuccess: result => {
      void refreshWorkspace();
      toast.success(`Tag added to ${result.updatedCount} bookmark${result.updatedCount === 1 ? "" : "s"}`);
    },
    onError: error => toast.error("Could not tag selected bookmarks", { description: error.message }),
  });
  const queueHealth = trpc.health.queueNow.useMutation({
    onSuccess: result => {
      void refreshWorkspace();
      toast.success("Health refresh started", {
        description: result.pendingCount
          ? `${result.queuedCount} links queued; the worker will continue automatically.`
          : "All eligible links are already up to date.",
      });
    },
    onError: error => toast.error("Could not refresh link health", { description: error.message }),
  });
  const retryFailedJobs = trpc.bookmarks.retryFailed.useMutation({
    onSuccess: count => {
      void refreshWorkspace();
      toast.success(`${count} failed job${count === 1 ? "" : "s"} requeued`, {
        description: "The worker will retry them in the background.",
      });
    },
    onError: error => toast.error("Could not requeue failed jobs", { description: error.message }),
  });
  const enableWeekly = trpc.health.enableWeeklyChecks.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
      toast.success("Weekly health checks are active");
    },
    onError: error => toast.error("Could not activate weekly checks", { description: error.message }),
  });
  const pauseWeekly = trpc.health.pauseWeeklyChecks.useMutation({
    onSuccess: () => {
      void refreshWorkspace();
      toast.success("Weekly health checks are paused");
    },
    onError: error => toast.error("Could not pause weekly checks", { description: error.message }),
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
      toast.error("This file is too large", { description: "Use a bookmark HTML file under 2 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") importBookmarks.mutate({ html: reader.result });
    };
    reader.onerror = () => toast.error("Could not read this bookmark file");
    reader.readAsText(file);
  };

  const onExportBookmarks = async () => {
    const result = await exportQuery.refetch();
    if (!result.data) {
      toast.error("Could not export bookmarks", { description: result.error?.message });
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
    toast.success("Browser bookmark file exported");
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
          deletePending={bulkRemoveBookmarks.isPending}
        />
      );
    }

    if (bookmarksQuery.isError || (search.trim() && searchQuery.isError)) {
      return <QueryErrorState onRetry={() => void refreshWorkspace()} />;
    }

    return (
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
      />
    );
  };

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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="fihrist-panel rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">New bookmark</p>
            <DialogTitle className="fihrist-heading text-2xl tracking-[-0.035em]">Save a link</DialogTitle>
            <DialogDescription className="fihrist-muted leading-6">
              Fihrist will retrieve page details and assign useful tags after you save it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitUrl} className="mt-3 space-y-4">
            <div className="space-y-2">
              <label htmlFor="bookmark-url" className="fihrist-heading text-sm font-medium">URL</label>
              <Input
                id="bookmark-url"
                autoFocus
                value={urlDraft}
                onChange={event => setUrlDraft(event.target.value)}
                placeholder="https://example.com/article"
                className="fihrist-input h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="bookmark-collection" className="fihrist-heading text-sm font-medium">Collection</label>
              <Select value={addCollectionId} onValueChange={setAddCollectionId}>
                <SelectTrigger id="bookmark-collection" className="fihrist-input h-11 rounded-xl">
                  <SelectValue placeholder="No collection" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="none">No collection</SelectItem>
                  {collections.map(collection => (
                    <SelectItem key={collection.id} value={String(collection.id)}>{collection.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addBookmark.isPending} className="fihrist-primary-action rounded-xl">
                {addBookmark.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Save bookmark
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="fihrist-panel rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">Browser import</p>
            <DialogTitle className="fihrist-heading text-2xl tracking-[-0.035em]">Bring your bookmarks in</DialogTitle>
            <DialogDescription className="fihrist-muted leading-6">
              Select a Netscape-format HTML file exported from your browser. Nested folders become collections.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importBookmarks.isPending}
            className="fihrist-empty mt-4 flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 text-center transition-colors hover:bg-accent disabled:opacity-60"
          >
            {importBookmarks.isPending ? <Loader2 className="mb-3 h-6 w-6 animate-spin text-primary" /> : <FileUp className="mb-3 h-6 w-6 text-primary" />}
            <span className="fihrist-heading text-sm font-medium">Choose exported bookmarks HTML</span>
            <span className="fihrist-muted mt-1 text-xs">Up to 10 MB</span>
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
            <p className="fihrist-muted text-xs font-semibold uppercase tracking-[0.16em]">Private note</p>
            <DialogTitle className="fihrist-heading line-clamp-2 text-xl tracking-[-0.03em]">{bookmarkLabel(notesBookmark)}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={event => setNotesDraft(event.target.value)}
            placeholder="Why you saved this, a useful quote, a follow-up…"
            className="fihrist-input min-h-40 rounded-xl"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setNotesBookmark(null)}>Cancel</Button>
            <Button
              className="fihrist-primary-action rounded-xl"
              disabled={!notesBookmark || updateNotes.isPending}
              onClick={() => notesBookmark && updateNotes.mutate({ id: notesBookmark.id, notes: notesDraft.trim() || null })}
            >
              {updateNotes.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteBookmark)}
        onOpenChange={open => !open && setDeleteBookmark(null)}
        title="Remove this bookmark?"
        description="This removes the saved link, its tags, notes, and health history from Fihrist."
        confirmLabel="Remove bookmark"
        pending={removeBookmark.isPending}
        onConfirm={() => deleteBookmark && removeBookmark.mutate({ id: deleteBookmark.id })}
      />
      <ConfirmDialog
        open={Boolean(deleteCollection)}
        onOpenChange={open => !open && setDeleteCollection(null)}
        title="Delete this collection?"
        description="Bookmarks inside it will remain saved but will no longer belong to this collection."
        confirmLabel="Delete collection"
        pending={removeCollection.isPending}
        onConfirm={() => deleteCollection && removeCollection.mutate({ id: deleteCollection.id })}
      />
      <ConfirmDialog
        open={healthDeleteIds.length > 0}
        onOpenChange={open => !open && setHealthDeleteIds([])}
        title={`Remove ${healthDeleteIds.length} bookmark${healthDeleteIds.length === 1 ? "" : "s"}?`}
        description="This permanently removes the selected links, tags, notes, and health history. Review uncertain network failures before continuing."
        confirmLabel={`Remove ${healthDeleteIds.length}`}
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
}) {
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
            {selectedCollection ? "Collection" : "Your library"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="fihrist-heading text-3xl font-semibold tracking-[-0.045em] sm:text-[2.15rem]">
              {selectedCollection?.name ?? "All links"}
            </h1>
            {selectedCollection ? (
              <button className="fihrist-subtle-action rounded-full px-3 py-1 text-xs font-medium" onClick={onClearCollection}>
                Clear filter
              </button>
            ) : null}
          </div>
          <p className="fihrist-muted mt-2 text-sm">
            {totalCount} {totalCount === 1 ? "saved link" : "saved links"}{search ? " matching your search" : ""}
          </p>
        </div>
        <Button onClick={onAddBookmark} className="fihrist-primary-action hidden h-11 rounded-xl px-4 lg:inline-flex">
          <Plus className="mr-2 h-4 w-4" /> Add bookmark
        </Button>
      </div>

      <div className="relative mb-7 max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={event => onSearch(event.target.value)}
          aria-label="Search saved links"
          placeholder="Search titles, tags, notes, and saved pages"
          className="fihrist-input h-12 rounded-2xl pl-10 pr-10 shadow-sm"
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
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
                aria-label="Select all visible bookmarks"
              />
              {allVisibleSelected ? "All visible selected" : "Select visible"}
            </label>
            {selectedIds.size ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="toolbar" aria-label="Bulk bookmark actions">
                <span className="fihrist-subtle-action rounded-full px-2.5 py-1 text-xs font-semibold">
                  {selectedIds.size} selected
                </span>
                <Select onValueChange={value => onBulkMove(value === "none" ? null : Number(value))} disabled={bulkMoving}>
                  <SelectTrigger className="fihrist-input h-8 w-[168px] rounded-lg text-xs">
                    <SelectValue placeholder="Move to collection" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none">Remove from collection</SelectItem>
                    {collections.map(collection => <SelectItem key={collection.id} value={String(collection.id)}>{collection.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <form onSubmit={submitBulkTag} className="fihrist-input flex h-8 min-w-[180px] flex-1 items-center rounded-lg border px-2">
                  <Tag className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    value={bulkTagDraft}
                    onChange={event => setBulkTagDraft(event.target.value)}
                    maxLength={96}
                    placeholder="Add tag to selected"
                    className="h-7 min-w-0 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button type="submit" variant="ghost" size="sm" disabled={!bulkTagDraft.trim() || bulkTagging} className="h-6 rounded-md px-1.5 text-xs text-primary">
                    Add
                  </Button>
                </form>
                <button type="button" onClick={onClearSelection} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  Clear
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
              selected={selectedIds.has(bookmark.id)}
              onToggleSelection={onToggleSelection}
              onAnalyze={onAnalyze}
              analyzing={analyzingBookmarkId === bookmark.id}
            />
          ))}
        </div>
      ) : null}
      {!loading && hasMore ? <div className="mt-6 flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore} className="rounded-xl">{loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Load more links</Button></div> : null}
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
  selected,
  onToggleSelection,
  onAnalyze,
  analyzing,
}: {
  bookmark: BookmarkRecord;
  collections: Collection[];
  moving: boolean;
  onMove: (bookmarkId: number, collectionId: number | null) => void;
  onAddTag: (bookmarkId: number, name: string) => void;
  onRemoveTag: (bookmarkId: number, tagId: number) => void;
  onEditNotes: (bookmark: BookmarkRecord) => void;
  onDelete: (bookmark: BookmarkRecord) => void;
  selected: boolean;
  onToggleSelection: (bookmarkId: number, checked: boolean) => void;
  onAnalyze: (bookmarkId: number) => void;
  analyzing: boolean;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const appearance = healthAppearance[bookmark.healthStatus];
  const title = bookmarkLabel(bookmark);
  const addTagForBookmark = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tagDraft.trim()) return;
    onAddTag(bookmark.id, tagDraft.trim());
    setTagDraft("");
  };

  return (
    <article className={`fihrist-card group flex min-h-[300px] flex-col rounded-[1.35rem] border p-5 transition duration-200 hover:-translate-y-0.5 ${selected ? "border-primary ring-2 ring-primary/25" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={event => onToggleSelection(bookmark.id, event.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Select ${title}`}
          />
          <Favicon bookmark={bookmark} />
          <span className="truncate text-xs font-medium text-muted-foreground">{bookmark.host}</span>
        </div>
        <Badge className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${appearance.className}`}>
          {appearance.label}
        </Badge>
      </div>
      <a href={bookmark.url} target="_blank" rel="noreferrer" className="group/title rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" dir={bookmark.contentDirection}>
        <h2 className="fihrist-heading line-clamp-2 text-[1.06rem] font-semibold leading-6 tracking-[-0.025em] group-hover/title:text-primary">
          {title}
          <ArrowUpRight className="mb-0.5 ml-1 inline h-3.5 w-3.5 opacity-0 transition-opacity group-hover/title:opacity-100" />
        </h2>
      </a>
      <p className="fihrist-muted mt-2 line-clamp-3 min-h-[3.8rem] text-sm leading-5" dir={bookmark.contentDirection}>
        {bookmark.ingestionStatus === "processing" || bookmark.ingestionStatus === "pending"
          ? "Retrieving page details…"
          : bookmark.scrapeError
            ? "Page details could not be retrieved. The saved link is still available."
            : bookmark.description || "No description was supplied by this page."}
      </p>
      <BookmarkInsight bookmark={bookmark} onAnalyze={onAnalyze} analyzing={analyzing} />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {bookmark.tags.slice(0, 4).map(tag => (
          <span key={tag.id} className="group/tag inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">
            {tag.name}
            <button
              onClick={() => onRemoveTag(bookmark.id, tag.id)}
              className="inline-flex rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/tag:opacity-100"
              aria-label={`Remove ${tag.name} tag`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {bookmark.tags.length > 4 ? <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">+{bookmark.tags.length - 4}</span> : null}
      </div>
      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Select
            value={bookmark.collectionId ? String(bookmark.collectionId) : "none"}
            onValueChange={value => onMove(bookmark.id, value === "none" ? null : Number(value))}
            disabled={moving}
          >
            <SelectTrigger aria-label={`Collection for ${title}`} className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none focus:ring-0">
              <Folder className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="No collection" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="none">No collection</SelectItem>
              {collections.map(collection => <SelectItem key={collection.id} value={String(collection.id)}>{collection.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => onEditNotes(bookmark)} className="rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`Edit notes for ${title}`}>Notes</button>
          <button type="button" onClick={() => onDelete(bookmark)} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${title}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <form className="mt-3 flex items-center gap-2" onSubmit={addTagForBookmark}>
          <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={tagDraft}
            onChange={event => setTagDraft(event.target.value)}
            maxLength={96}
            aria-label={`Add tag to ${title}`}
            placeholder="Add a tag"
            className="h-7 min-w-0 border-0 bg-transparent px-0 text-xs text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={!tagDraft.trim()} aria-label={`Add tag to ${title}`} className="h-7 rounded-md px-1.5 text-xs text-primary">Add</Button>
        </form>
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
  const hasInsight = bookmark.analysisStatus === "ready" && bookmark.analysisSummary;
  const canAnalyze = bookmark.ingestionStatus === "ready" && Boolean(bookmark.contentText || bookmark.description || bookmark.title);

  if (hasInsight) {
    return (
      <section className="fihrist-insight mt-3 rounded-xl border px-3 py-2.5" dir={bookmark.contentDirection} aria-label="Saved link insight">
        <div className="fihrist-insight-label mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
          <Sparkles className="h-3.5 w-3.5" /> Library insight
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-foreground">{bookmark.analysisSummary}</p>
        <div className="fihrist-muted mt-2 grid gap-1.5 border-t border-primary/25 pt-2 text-[11px] leading-4">
          {bookmark.savedReason ? <p><span className="fihrist-insight-label font-semibold">Why save:</span> {bookmark.savedReason}</p> : null}
          {bookmark.savingBenefit ? <p><span className="fihrist-insight-label font-semibold">Benefit:</span> {bookmark.savingBenefit}</p> : null}
        </div>
      </section>
    );
  }

  if (analyzing || bookmark.analysisStatus === "processing") {
    return (
      <div className="fihrist-muted mt-3 flex items-center gap-2 text-xs" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing a library insight…
      </div>
    );
  }

  if (bookmark.analysisStatus === "failed") {
    return (
      <div className="fihrist-danger mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs" role="alert">
        <span className="line-clamp-2">{bookmark.analysisError || "The library insight could not be prepared."}</span>
        <button type="button" onClick={() => onAnalyze(bookmark.id)} className="shrink-0 rounded-md px-1.5 py-1 font-semibold text-destructive hover:bg-destructive/10">
          Retry
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
      title={canAnalyze ? "Analyze why this link belongs in your library" : "Analysis is available after page details have been retrieved"}
    >
      <Sparkles className="h-3.5 w-3.5" /> Analyze saved value
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
  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (collectionDraft.trim()) createCollection(collectionDraft.trim());
  };
  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="fihrist-muted mb-2 text-xs font-semibold uppercase tracking-[0.17em]">Structure</p>
        <h1 className="fihrist-heading text-3xl font-semibold tracking-[-0.045em] sm:text-[2.15rem]">Collections</h1>
        <p className="fihrist-muted mt-2 text-sm">Group saved links into named shelves that make sense to you.</p>
      </div>
      <form onSubmit={onCreate} className="mb-8 flex max-w-lg gap-2">
        <Input
          value={collectionDraft}
          onChange={event => setCollectionDraft(event.target.value)}
          placeholder="e.g. Research, recipes, reading"
          aria-label="New collection name"
          className="fihrist-input h-11 rounded-xl"
        />
        <Button disabled={creating} className="fihrist-primary-action h-11 shrink-0 rounded-xl">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
          <span className="hidden sm:inline">Create</span>
        </Button>
      </form>
      {!collections.length ? (
        <div className="fihrist-empty rounded-[1.4rem] border border-dashed p-8 text-center">
          <Folder className="mx-auto mb-3 h-6 w-6 text-primary" />
          <p className="fihrist-heading font-medium">No collections yet</p>
          <p className="fihrist-muted mx-auto mt-1 max-w-sm text-sm leading-6">Create a named group to start arranging your saved links.</p>
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
                  <button onClick={() => onDelete(collection)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${collection.name}`}><Trash2 className="h-4 w-4" /></button>
                </div>
                {isEditing ? (
                  <div className="flex gap-2">
                    <Input autoFocus value={editingCollectionName} onChange={event => setEditingCollectionName(event.target.value)} className="fihrist-input h-9 rounded-lg" />
                    <Button size="icon" disabled={renamePending || !editingCollectionName.trim()} onClick={() => onSaveEdit(collection)} className="fihrist-primary-action h-9 w-9 rounded-lg"><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={onCancelEdit} className="h-9 w-9 rounded-lg"><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <>
                    <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => onSelectCollection(collection.id)}>
                      <h2 className="fihrist-heading truncate text-lg font-semibold tracking-[-0.025em]">{collection.name}</h2>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <p className="fihrist-muted mt-1.5 text-sm">{count} {count === 1 ? "link" : "links"}</p>
                    <button className="mt-5 inline-flex items-center text-xs font-medium text-primary hover:text-primary/80" onClick={() => onEdit(collection)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Rename</button>
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

type HealthFilter = BookmarkRecord["healthStatus"] | "all" | "confirmed" | "review";

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
  deletePending,
  hasMore = false,
  loadingMore = false,
  onLoadMore = () => undefined,
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
  deletePending: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const bookmarks = data?.bookmarks ?? [];
  const confirmedCount = bookmarks.filter(isConfirmedBroken).length;
  const reviewCount = bookmarks.filter(bookmark => bookmark.healthStatus === "broken" && !isConfirmedBroken(bookmark)).length;
  const cards = [
    { filter: "healthy", label: "Healthy", count: data?.counts.healthy ?? 0, className: healthAppearance.healthy.className },
    { filter: "redirected", label: "Redirected", count: data?.counts.redirected ?? 0, className: healthAppearance.redirected.className },
    { filter: "confirmed", label: "Broken", count: confirmedCount, className: healthAppearance.broken.className },
    { filter: "review", label: "Needs review", count: reviewCount, className: healthAppearance.redirected.className },
    { filter: "unchecked", label: "Unchecked", count: data?.counts.unchecked ?? 0, className: healthAppearance.unchecked.className },
  ] satisfies readonly { readonly filter: HealthFilter; readonly label: string; readonly count: number; readonly className: string }[];
  const filterChecks: Record<HealthFilter, (bookmark: BookmarkRecord) => boolean> = {
    all: () => true,
    healthy: bookmark => bookmark.healthStatus === "healthy",
    redirected: bookmark => bookmark.healthStatus === "redirected",
    broken: bookmark => bookmark.healthStatus === "broken",
    unchecked: bookmark => bookmark.healthStatus === "unchecked",
    confirmed: isConfirmedBroken,
    review: bookmark => bookmark.healthStatus === "broken" && !isConfirmedBroken(bookmark),
  };
  const visibleBookmarks = bookmarks.filter(filterChecks[filter]);
  const deletableBookmarks = visibleBookmarks.filter(bookmark => bookmark.healthStatus === "broken");
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
          <p className="fihrist-muted mb-2 text-xs font-semibold uppercase tracking-[0.17em]">Maintenance</p>
          <h1 className="fihrist-heading text-3xl font-semibold tracking-[-0.045em] sm:text-[2.15rem]">Link health</h1>
          <p className="fihrist-muted mt-2 text-sm">Check whether the paths in your library still lead somewhere useful.</p>
        </div>
        <Button onClick={onQueue} disabled={queuePending} className="fihrist-primary-action h-11 rounded-xl">
          {queuePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HeartPulse className="mr-2 h-4 w-4" />}
          Check links now
        </Button>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(card => {
          const active = filter === card.filter;
          const filterDescription = card.filter === "confirmed" ? "confirmed broken" : card.label.toLocaleLowerCase();
          return <button type="button" aria-pressed={active} aria-label={`Show ${filterDescription} links, ${card.count}`} key={card.filter} onClick={() => { setFilter(current => current === card.filter ? "all" : card.filter); setSelectedIds([]); }} className={`fihrist-card rounded-2xl border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-2 ring-primary/20" : ""}`}><p className="fihrist-muted text-xs font-medium">{card.label}</p><p className="fihrist-heading mt-1 text-2xl font-semibold tracking-[-0.04em]">{card.count}</p><span className={`mt-3 inline-block h-1.5 w-12 rounded-full ${card.className.split(" ")[0]}`} /></button>;
        })}
      </div>
      <div className="fihrist-health-callout mb-6 flex flex-col gap-4 rounded-[1.35rem] border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">Weekly health check</p>
            <p className="fihrist-muted mt-1 text-sm leading-5">
              {data?.settings.enabled
                ? `Active${data?.settings.lastRunAt ? ` · last sweep ${formatRelative(data.settings.lastRunAt)}` : ""}`
                : "Activate a recurring weekly sweep for this library."}
            </p>
          </div>
        </div>
        {data?.settings.enabled ? (
          <Button variant="outline" disabled={pausePending} onClick={onPause} className="fihrist-health-action rounded-xl">{pausePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Pause checks</Button>
        ) : (
          <Button disabled={enablePending} onClick={onEnable} className="fihrist-primary-action rounded-xl">{enablePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Activate weekly checks</Button>
        )}
      </div>
      {bookmarks.length ? (
        <div className="fihrist-panel mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-3" role="toolbar" aria-label="Link health actions">
          <span className="fihrist-muted text-xs font-medium">{visibleBookmarks.length} shown</span>
          {filter !== "all" ? <button type="button" onClick={() => { setFilter("all"); setSelectedIds([]); }} className="fihrist-subtle-action rounded-lg px-2.5 py-1.5 text-xs font-medium">Show all</button> : null}
          {deletableBookmarks.length ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={allDeletableSelected} onChange={toggleVisibleSelection} className="h-4 w-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring" aria-label="Select visible unhealthy links" />
              Select visible
            </label>
          ) : null}
          {selectedIds.length ? <Button type="button" variant="outline" disabled={deletePending} onClick={() => onRequestDelete(selectedIds)} className="ml-auto h-8 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete selected</Button> : null}
          {confirmedCount ? <Button type="button" variant="outline" disabled={deletePending} onClick={() => onRequestDelete(bookmarks.filter(isConfirmedBroken).map(bookmark => bookmark.id))} className={`${selectedIds.length ? "" : "ml-auto"} h-8 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-destructive/10`}>Delete all confirmed</Button> : null}
        </div>
      ) : null}
      {loading ? <BookmarkSkeletons /> : null}
      {!loading && !data?.bookmarks.length ? <EmptyHealth onOpenBookmark={onOpenBookmark} /> : null}
      {!loading && visibleBookmarks.length ? (
        <div className="fihrist-card overflow-hidden rounded-[1.35rem] border">
          {visibleBookmarks.map((bookmark, index) => {
            const confirmedBroken = isConfirmedBroken(bookmark);
            const needsReview = bookmark.healthStatus === "broken" && !confirmedBroken;
            const appearance = needsReview ? healthAppearance.redirected : healthAppearance[bookmark.healthStatus];
            const label = needsReview ? "Needs review" : appearance.label;
            const title = bookmarkLabel(bookmark);
            return <div key={bookmark.id} className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${index ? "border-t border-border" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">{bookmark.healthStatus === "broken" ? <input type="checkbox" checked={selectedIdSet.has(bookmark.id)} onChange={event => setSelectedIds(ids => event.target.checked ? Array.from(new Set([...ids, bookmark.id])) : ids.filter(id => id !== bookmark.id))} className="h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Select ${title}`} /> : null}<Favicon bookmark={bookmark} /><div className="min-w-0"><a href={bookmark.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-foreground hover:text-primary">{title}</a><p className="fihrist-muted mt-1 truncate text-xs">{bookmark.healthError || (bookmark.lastCheckedAt ? `Checked ${formatRelative(bookmark.lastCheckedAt)}` : "Not checked yet")}</p></div></div>
              <div className="flex shrink-0 items-center gap-3"><span className="text-xs text-muted-foreground">{bookmark.httpStatus ? `HTTP ${bookmark.httpStatus}` : ""}</span><Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${appearance.className}`}>{label}</Badge>{bookmark.healthStatus === "broken" ? <button type="button" disabled={deletePending} onClick={() => onRequestDelete([bookmark.id])} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label={`Remove ${title}`}><Trash2 className="h-4 w-4" /></button> : null}</div>
            </div>;
          })}
        </div>
      ) : null}
      {!loading && hasMore ? <div className="mt-6 flex justify-center"><Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore} className="rounded-xl">{loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Load more health results</Button></div> : null}
      {!loading && bookmarks.length > 0 && visibleBookmarks.length === 0 ? <div className="fihrist-empty rounded-[1.35rem] border border-dashed p-8 text-center"><p className="fihrist-heading font-medium">No links in this status</p><button type="button" onClick={() => { setFilter("all"); setSelectedIds([]); }} className="mt-2 text-sm font-medium text-primary hover:text-primary/80">Show all link health</button></div> : null}
    </section>
  );
}

function Favicon({ bookmark }: { bookmark: BookmarkRecord }) {
  return <span className="fihrist-empty grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border text-primary">{bookmark.faviconUrl ? <img src={bookmark.faviconUrl} alt="" className="h-4 w-4 object-contain" onError={event => { event.currentTarget.style.display = "none"; }} /> : <Bookmark className="h-3.5 w-3.5" />}</span>;
}

function EmptyBookmarks({ hasSearch, onAddBookmark }: { hasSearch: boolean; onAddBookmark: () => void }) {
  return <div className="fihrist-empty rounded-[1.5rem] border border-dashed px-6 py-14 text-center"><Inbox className="mx-auto mb-4 h-7 w-7 text-primary" /><h2 className="fihrist-heading text-lg font-semibold tracking-[-0.025em]">{hasSearch ? "No matching links" : "Your library is ready"}</h2><p className="fihrist-muted mx-auto mt-2 max-w-sm text-sm leading-6">{hasSearch ? "Try a different word from the title, a tag, or a saved note." : "Save a URL and Fihrist will collect page details, suggest tags, and keep its health in view."}</p>{!hasSearch ? <Button onClick={onAddBookmark} className="fihrist-primary-action mt-5 rounded-xl"><Plus className="mr-2 h-4 w-4" />Save your first link</Button> : null}</div>;
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="fihrist-danger rounded-[1.5rem] border p-8 text-center" role="alert"><CircleAlert className="mx-auto mb-3 h-7 w-7" /><h2 className="fihrist-heading text-lg font-semibold">Could not load this view</h2><p className="mt-2 text-sm">Your saved data is still safe. Try loading it again.</p><Button type="button" variant="outline" onClick={onRetry} className="mt-5 rounded-xl">Try again</Button></div>;
}

function QueueStatusError({ onRetry }: { onRetry: () => void }) {
  return <div className="fihrist-danger mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm" role="alert"><span>Background job status is unavailable.</span><Button type="button" variant="outline" onClick={onRetry} className="h-8 rounded-lg text-xs">Retry status</Button></div>;
}

function QueueStatusBanner({ summary, retryPending, onRetry }: { summary: JobQueueSummary; retryPending: boolean; onRetry: () => void }) {
  if (!summary.pending && !summary.processing && !summary.failed) return null;
  const activeCount = summary.pending + summary.processing;
  return <section className={`fihrist-panel mx-auto mb-6 flex max-w-6xl flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${summary.failed ? "border-amber-500/30" : ""}`} aria-live="polite" aria-label="Background job status">
    <div className="flex min-w-0 items-start gap-3">
      {summary.failed ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
      <p className="text-sm leading-5">
        {activeCount ? `${activeCount} background job${activeCount === 1 ? " is" : "s are"} running or waiting.` : "Background jobs need attention."}
        {summary.failed ? ` ${summary.failed} failed job${summary.failed === 1 ? "" : "s"} can be retried.` : ""}
      </p>
    </div>
    {summary.failed ? <Button type="button" variant="outline" disabled={retryPending} onClick={onRetry} className="h-8 shrink-0 rounded-lg text-xs"><RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${retryPending ? "animate-spin" : ""}`} />{retryPending ? "Requeuing…" : "Retry up to 100"}</Button> : null}
  </section>;
}

function EmptyHealth({ onOpenBookmark }: { onOpenBookmark: () => void }) {
  return <div className="fihrist-empty rounded-[1.5rem] border border-dashed px-6 py-14 text-center"><HeartPulse className="mx-auto mb-4 h-7 w-7 text-primary" /><h2 className="fihrist-heading text-lg font-semibold tracking-[-0.025em]">Nothing to check yet</h2><p className="fihrist-muted mx-auto mt-2 max-w-sm text-sm leading-6">Save a link first, then return here whenever you want to review its status.</p><Button variant="outline" onClick={onOpenBookmark} className="fihrist-health-action mt-5 rounded-xl">View saved links</Button></div>;
}

function BookmarkSkeletons() {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading bookmarks">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[300px] animate-pulse rounded-[1.35rem] border border-border bg-muted" />)}</div>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pending, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; pending: boolean; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="fihrist-panel rounded-2xl sm:max-w-md"><DialogHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5" /></div><DialogTitle className="fihrist-heading text-xl tracking-[-0.03em]">{title}</DialogTitle><DialogDescription className="fihrist-muted leading-6">{description}</DialogDescription></DialogHeader><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={pending} onClick={onConfirm} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}{confirmLabel}</Button></div></DialogContent></Dialog>;
}

function bookmarkLabel(bookmark: BookmarkRecord | null) {
  return bookmark?.title?.trim() || bookmark?.host || "Untitled bookmark";
}

function formatRelative(value: Date | string) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}
