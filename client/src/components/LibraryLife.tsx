import { askText, confirmAction } from "@/components/LibraryDialogs";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/i18n/LocaleContext";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { healthStateLabels } from "@shared/healthLanguage";
import type { BookmarkRecord } from "../../../server/db";

export function HabitsCard() {
  const ar = useLocale().locale === "ar";
  const query = trpc.life.habits.useQuery();
  const facts = query.data;
  return (
    <section
      className="my-5 rounded-xl border p-4"
      aria-label={ar ? "عاداتك" : "Habits"}
    >
      <h2 className="fihrist-display text-xl">{ar ? "عاداتك" : "Habits"}</h2>
      {query.isError ? (
        <Button variant="outline" onClick={() => query.refetch()}>
          {ar ? "تعذّر فتح التقرير، جرّب تاني" : "Could not load report. Retry"}
        </Button>
      ) : !facts ? (
        <p role="status">{ar ? "بنجهز التقرير…" : "Preparing report…"}</p>
      ) : (
        <>
          <p>
            {ar ? "أُضيف هذا الأسبوع" : "Added this week"}: {facts.added}
          </p>
          <p>
            {ar
              ? "غير المقروء / بقرأه / مقروء / مؤرشف"
              : "Unread / Reading / Read / Archived"}
            : {Object.values(facts.counts).join(" / ")}
          </p>
          <p>
            {ar ? "أكتر الوسوم استخدامًا" : "Most used tags"}:{" "}
            {facts.tags.map(t => `${t.name} (${t.count})`).join(" · ") || "—"}
          </p>
          <h3>{ar ? "أقدم روابط لسه مقريتهاش" : "Oldest unread links"}</h3>
          <ol>
            {facts.unread.map(b => (
              <li key={b.id}>
                <a
                  className="rounded underline focus-visible:ring-2"
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {b.title || b.url}
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
export function LibraryLife({
  renderCard,
}: {
  renderCard: (bookmark: BookmarkRecord) => React.ReactNode;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const utils = trpc.useUtils();
  const [view, setView] = useState<"timeline" | "clusters" | null>(null);
  const query = trpc.life.overview.useQuery(undefined, {
    enabled: view === "timeline",
  });
  const shelves = trpc.topics.shelves.useQuery(undefined, {
    enabled: view === "clusters",
  });
  const create = trpc.collections.createNested.useMutation();
  const move = trpc.bookmarks.move.useMutation();
  const [pending, setPending] = useState(false);
  const promote = async (shelf: NonNullable<typeof shelves.data>[number]) => {
    if (
      !(await confirmAction(
        ar
          ? `النموذج الحالي يسمح بمجموعة واحدة للرابط. انقل ${shelf.bookmarks.length} رابط؟ هتراجع كل رابط قبل نقله.`
          : `Each link can belong to one collection. Move ${shelf.bookmarks.length} links? Review each link before moving.`
      ))
    )
      return;
    const approved: typeof shelf.bookmarks = [];
    for (const b of shelf.bookmarks)
      if (
        await confirmAction(
          `${ar ? "انقل رابط واحد من مجموعته الحالية؟" : "Move 1 link from its current collection?"}\n${b.title || b.url}`
        )
      )
        approved.push(b);
    if (!approved.length) return;
    // TOKEN_POLICY_BATCHED_EXECUTION: invalidate search and shelf cards after promotion.
    setPending(true);
    try {
      const collection = await create.mutateAsync({
        name: shelf.name,
        parentId: null,
      });
      if (!collection) throw new Error();
      for (const b of approved)
        await move.mutateAsync({ id: b.id, collectionId: collection.id });
      await Promise.all([
        utils.collections.list.invalidate(),
        utils.bookmarks.list.invalidate(),
        utils.bookmarks.search.invalidate(),
        utils.topics.shelves.invalidate(),
        utils.life.overview.invalidate(),
      ]);
      toast.success(
        ar ? `اتنقل ${approved.length} رابط` : `Moved ${approved.length} links`
      );
    } catch {
      toast.error(
        ar
          ? "تعذّر إكمال النقل. راجع المجموعات قبل المحاولة تاني."
          : "Could not finish moving. Review collections before retrying."
      );
    } finally {
      setPending(false);
    }
  };
  const days = new Map<string, BookmarkRecord[]>();
  for (const b of query.data?.bookmarks ?? []) {
    const day = new Date(b.createdAt).toLocaleDateString(locale);
    days.set(day, [...(days.get(day) ?? []), b]);
  }
  return (
    <section className="my-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          aria-pressed={view === "timeline"}
          onClick={() => setView(view === "timeline" ? null : "timeline")}
        >
          {ar ? "الخط الزمني" : "Timeline"}
        </Button>
        <Button
          variant="outline"
          aria-pressed={view === "clusters"}
          onClick={() => setView(view === "clusters" ? null : "clusters")}
        >
          {ar ? "عناقيد الوسوم" : "Tag clusters"}
        </Button>
      </div>
      {view === "timeline" && (
        <div>
          <h2 className="fihrist-display my-4 text-2xl">
            {ar ? "الخط الزمني" : "Timeline"}
          </h2>
          {query.isError ? (
            <Button onClick={() => query.refetch()}>
              {ar ? "جرّب تاني" : "Retry"}
            </Button>
          ) : query.isLoading ? (
            <p role="status">{ar ? "بنفتح الروابط…" : "Loading links…"}</p>
          ) : !days.size ? (
            <p>
              {ar
                ? "احفظ أول رابط عشان يظهر هنا"
                : "Save your first link to see it here"}
            </p>
          ) : (
            Array.from(days, ([day, items]) => (
              <section key={day}>
                <h3>
                  {day} ({items.length})
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map(b => (
                    <div key={b.id}>
                      {renderCard(b)}
                      <ul className="text-sm">
                        {query.data?.transitions[b.id]?.map((t, i) => (
                          <li key={i}>
                            {new Date(t.checked).toLocaleDateString(locale)} ·{" "}
                            {healthStateLabels[
                              t.status as keyof typeof healthStateLabels
                            ]?.[locale] ?? t.status}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
      {view === "clusters" && (
        <div>
          <h2 className="fihrist-display my-4 text-2xl">
            {ar ? "عناقيد الوسوم" : "Tag clusters"}
          </h2>
          {shelves.isError ? (
            <Button onClick={() => shelves.refetch()}>
              {ar ? "جرّب تاني" : "Retry"}
            </Button>
          ) : shelves.isLoading ? (
            <p role="status">{ar ? "بنفتح الأرفف…" : "Loading shelves…"}</p>
          ) : !shelves.data?.length ? (
            <p>
              {ar
                ? "أضف روابط مرتبطة عشان يظهر تجمع هنا"
                : "Add related links to see a cluster here"}
            </p>
          ) : (
            shelves.data.map(shelf => (
              <section key={shelf.id}>
                <h3>
                  {shelf.name} ({shelf.bookmarks.length})
                </h3>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => promote(shelf)}
                >
                  {ar
                    ? "اعمل مجموعة من الرف ده — انقل الأعضاء"
                    : "Make this shelf a collection — move members"}
                </Button>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shelf.bookmarks.map(b => (
                    <React.Fragment key={b.id}>{renderCard(b)}</React.Fragment>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </section>
  );
}
