import { askText, confirmAction } from "@/components/LibraryDialogs";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/i18n/LocaleContext";
import { Button } from "./ui/button";
import { toast } from "sonner";

export function LibraryCleanup() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const tags = trpc.tags.list.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const duplicates = trpc.duplicates.list.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      utils.tags.list.invalidate(),
      utils.duplicates.list.invalidate(),
      utils.bookmarks.list.invalidate(),
      utils.bookmarks.search.invalidate(),
      utils.topics.shelves.invalidate(),
      utils.life.overview.invalidate(),
      utils.life.habits.invalidate(),
    ]);
  };
  const govern = trpc.tags.govern.useMutation({
    onSuccess: refresh,
    onError: () =>
      toast.error(ar ? "تعذّر تعديل الوسم" : "Could not update tag"),
  });
  const merge = trpc.duplicates.merge.useMutation({
    onSuccess: refresh,
    onError: () =>
      toast.error(
        ar
          ? "تعذّر الدمج. راجع المجموعة تاني."
          : "Could not merge. Review the group again."
      ),
  });
  return (
    <section className="my-5 rounded-lg border p-4">
      <Button
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {ar ? "راجع التكرارات والوسوم" : "Review duplicates and tags"}
      </Button>
      {open && (
        <div className="mt-4 space-y-6">
          <section>
            <h2 className="fihrist-display text-2xl">
              {ar ? "راجع التكرارات" : "Review duplicates"}
            </h2>
            {duplicates.isLoading ? (
              <p role="status">
                {ar ? "بنراجع المكتبة…" : "Reviewing library…"}
              </p>
            ) : duplicates.isError ? (
              <div role="alert">
                <p>
                  {ar ? "تعذّر تحميل التكرارات" : "Could not load duplicates"}
                </p>
                <Button onClick={async () => duplicates.refetch()}>
                  {ar ? "جرّب تاني" : "Try again"}
                </Button>
              </div>
            ) : duplicates.data?.length ? (
              duplicates.data.map(group => (
                <article
                  key={group.items[0].id}
                  className="my-3 rounded border p-3"
                >
                  <p>
                    {group.evidence
                      .map(e =>
                        e === "same-url"
                          ? ar
                            ? "نفس الرابط"
                            : "Same URL"
                          : e === "similar-title"
                            ? ar
                              ? "عنوان متشابه"
                              : "Similar title"
                            : ar
                              ? "محتوى متشابه"
                              : "Similar content"
                      )
                      .join(" · ")}
                  </p>
                  <ul>
                    {group.items.map(item => (
                      <li key={item.id}>{item.title || item.url}</li>
                    ))}
                  </ul>
                  <Button
                    disabled={merge.isPending}
                    onClick={async () => {
                      if (
                        await confirmAction(
                          (ar
                            ? "ادمج الروابط دي واحتفظ بالأقدم؟"
                            : "Merge these links and keep the oldest?") +
                            `\n${ar ? "العدد" : "Count"}: ${group.items.length}\n` +
                            group.items.map(b => b.title || b.url).join("\n")
                        )
                      )
                        merge.mutate({ ids: group.items.map(b => b.id) });
                    }}
                  >
                    {ar ? "ادمج" : "Merge"}
                  </Button>
                </article>
              ))
            ) : (
              <p>{ar ? "مفيش تكرارات مسجلة" : "No duplicate candidates"}</p>
            )}
          </section>
          <section>
            <h2 className="fihrist-display text-2xl">
              {ar ? "إدارة الوسوم" : "Manage tags"}
            </h2>
            {tags.isError ? (
              <div role="alert">
                <p>{ar ? "تعذّر تحميل الوسوم" : "Could not load tags"}</p>
                <Button onClick={() => tags.refetch()}>
                  {ar ? "جرّب تاني" : "Try again"}
                </Button>
              </div>
            ) : (
              tags.data?.map(tag => (
                <div
                  key={String(tag.id)}
                  className="my-2 flex flex-wrap items-center gap-2"
                >
                  <span>
                    {String(tag.name)} ({Number(tag.count)})
                  </span>
                  <Button
                    variant="ghost"
                    disabled={govern.isPending}
                    onClick={async () => {
                      const name = await askText(
                        `${ar ? "الاسم الجديد — عدد الروابط المتأثرة" : "New name — links affected"}: ${Number(tag.count)}`,
                        String(tag.name)
                      );
                      if (name?.trim())
                        govern.mutate({
                          id: Number(tag.id),
                          action: "rename",
                          name: name.trim(),
                        });
                    }}
                  >
                    {ar ? "غيّر الاسم" : "Rename"}
                  </Button>
                  <select
                    className="rounded border bg-background p-2"
                    aria-label={ar ? "ادمج الوسم في" : "Merge tag into"}
                    value=""
                    disabled={govern.isPending}
                    onChange={async event => {
                      const target = tags.data?.find(
                        t => Number(t.id) === Number(event.target.value)
                      );
                      if (
                        target &&
                        (await confirmAction(
                          `${ar ? "ادمج الوسم؟ عدد الروابط المتأثرة" : "Merge tag? Links affected"}: ${Number(tag.count)}\n${String(tag.name)} → ${String(target.name)}`
                        ))
                      )
                        govern.mutate({
                          id: Number(tag.id),
                          action: "merge",
                          targetId: Number(target.id),
                        });
                    }}
                  >
                    <option value="">{ar ? "ادمج في…" : "Merge into…"}</option>
                    {tags.data
                      ?.filter(t => t.id !== tag.id)
                      .map(t => (
                        <option key={String(t.id)} value={Number(t.id)}>
                          {String(t.name)}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="ghost"
                    disabled={govern.isPending}
                    onClick={async () => {
                      if (
                        await confirmAction(
                          `${ar ? "احذف الوسم من كل الروابط؟ العدد" : "Remove tag from all links? Count"}: ${Number(tag.count)}`
                        )
                      )
                        govern.mutate({ id: Number(tag.id), action: "delete" });
                    }}
                  >
                    {ar ? "احذف الوسم" : "Delete tag"}
                  </Button>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </section>
  );
}
