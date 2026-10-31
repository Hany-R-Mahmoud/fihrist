import { askText, confirmAction } from "@/components/LibraryDialogs";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/i18n/LocaleContext";
import { Button } from "./ui/button";
import { toast } from "sonner";

export function CollectionTree({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const utils = trpc.useUtils();
  const collections = trpc.collections.list.useQuery();
  const receipts = trpc.bookmarks.importReceipts.useQuery();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // TOKEN_POLICY_BATCHED_EXECUTION: refresh every affected library view.
  const refresh = async () => {
    await Promise.all([
      utils.collections.list.invalidate(),
      utils.bookmarks.list.invalidate(),
      utils.bookmarks.search.invalidate(),
      utils.bookmarks.importReceipts.invalidate(),
      utils.life.overview.invalidate(),
      utils.life.habits.invalidate(),
      utils.topics.shelves.invalidate(),
      utils.tags.list.invalidate(),
      utils.duplicates.list.invalidate(),
    ]);
  };
  const error = () =>
    toast.error(
      ar
        ? "تعذّر النقل. المجموعة مينفعش تبقى جوه نفسها أو أحد فروعها."
        : "Could not move. A collection cannot contain itself or one of its parents."
    );
  const move = trpc.collections.reparent.useMutation({
    onSuccess: refresh,
    onError: error,
  });
  const moveBookmark = trpc.bookmarks.move.useMutation({
    onSuccess: refresh,
    onError: error,
  });
  const create = trpc.collections.createNested.useMutation({
    onSuccess: refresh,
    onError: error,
  });
  const undo = trpc.bookmarks.undoImport.useMutation({
    onSuccess: refresh,
    onError: () =>
      toast.error(ar ? "تعذّر التراجع عن الاستيراد" : "Could not undo import"),
  });
  const rows = collections.data ?? [];
  const render = (
    parent: number | null,
    ancestors: number[] = []
  ): React.ReactNode =>
    rows
      .filter(c => (c.parentId ?? null) === parent && !ancestors.includes(c.id))
      .map(c => (
        <li key={c.id} className="ms-2 border-s ps-2">
          <div
            draggable
            onDragStart={e => {
              e.dataTransfer.setData(
                "application/x-fihrist-collection",
                String(c.id)
              );
              e.stopPropagation();
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              const id = Number(
                e.dataTransfer.getData("application/x-fihrist-collection")
              );
              const bookmark = Number(
                e.dataTransfer.getData("application/x-fihrist-bookmark")
              );
              if (id) move.mutate({ id, parentId: c.id });
              else if (bookmark)
                moveBookmark.mutate({ id: bookmark, collectionId: c.id });
            }}
            className="flex flex-wrap items-center gap-1"
          >
            <button
              className="rounded p-1 focus-visible:ring-2"
              aria-expanded={!collapsed.has(c.id)}
              aria-label={
                (ar ? "افتح أو اقفل " : "Expand or collapse ") + c.name
              }
              onClick={() =>
                setCollapsed(old => {
                  const next = new Set(old);
                  next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                  return next;
                })
              }
            >
              {collapsed.has(c.id) ? "+" : "−"}
            </button>
            <button
              className="rounded p-1 focus-visible:ring-2"
              onClick={() => onSelect(c.id)}
            >
              {c.name}
            </button>
            <button
              className="rounded p-1"
              aria-label={ar ? "أضف مجموعة فرعية" : "Add child collection"}
              onClick={async () => {
                const name = await askText(
                  ar ? "اسم المجموعة الفرعية" : "Child collection name"
                );
                if (name?.trim())
                  create.mutate({ name: name.trim(), parentId: c.id });
              }}
            >
              +
            </button>
            <select
              className="max-w-24 rounded border bg-background text-foreground"
              aria-label={(ar ? "انقل مجموعة " : "Move collection ") + c.name}
              value={c.parentId ?? ""}
              onChange={e =>
                move.mutate({
                  id: c.id,
                  parentId: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">{ar ? "الرئيسية" : "Root"}</option>
              {rows
                .filter(p => p.id !== c.id)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          {!collapsed.has(c.id) && (
            <ul>{render(c.id, [...ancestors, c.id])}</ul>
          )}
        </li>
      ));
  return (
    <section className="my-4 space-y-2 px-2">
      <h2>{ar ? "المجموعات" : "Collections"}</h2>
      <ul>{render(null)}</ul>
      <Button
        variant="outline"
        onClick={async () => {
          const name = await askText(ar ? "اسم المجموعة" : "Collection name");
          if (name?.trim())
            create.mutate({ name: name.trim(), parentId: null });
        }}
      >
        {ar ? "مجموعة جديدة" : "New collection"}
      </Button>
      <h3>{ar ? "عمليات الاستيراد" : "Imports"}</h3>
      {receipts.data?.map(receipt => (
        <div key={receipt.id} className="text-sm">
          <span>
            {receipt.name} · {Number(receipt.payload.importedCount)}
          </span>
          <Button
            variant="ghost"
            disabled={undo.isPending}
            onClick={async () => {
              const count = Array.isArray(receipt.payload.bookmarkIds)
                ? receipt.payload.bookmarkIds.length
                : 0;
              if (
                await confirmAction(
                  `${ar ? "تراجع عن الاستيراد ده؟ هيتحذف عدد روابط" : "Undo this import? Links to remove"}: ${count}`
                )
              )
                undo.mutate({ id: receipt.id });
            }}
          >
            {ar ? "تراجع عن الاستيراد ده" : "Undo this import"}
          </Button>
        </div>
      ))}
    </section>
  );
}
