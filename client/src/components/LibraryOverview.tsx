import React from "react";
import { BookmarkCard } from "@/pages/Home";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/i18n/LocaleContext";
import { shelfReason } from "@shared/topicLanguage";
import { Button } from "./ui/button";
import { LibraryLife, HabitsCard } from "./LibraryLife";

type CardProps = React.ComponentProps<typeof BookmarkCard>;
export function LibraryOverview({
  collections,
  actions,
  onRead,
  onAttention,
  onShelves,
  onRecent,
  onAdd,
}: {
  collections: CardProps["collections"];
  actions: Omit<CardProps, "bookmark" | "collections">;
  onRead: () => void;
  onAttention: () => void;
  onShelves: () => void;
  onRecent: () => void;
  onAdd: () => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const reading = trpc.bookmarks.list.useQuery({
    readingStatus: "reading",
    limit: 6,
  });
  const recent = trpc.bookmarks.list.useQuery({ limit: 6 });
  const broken = trpc.bookmarks.list.useQuery({
    healthStatus: "broken",
    limit: 3,
  });
  const review = trpc.bookmarks.list.useQuery({
    healthStatus: "needs_review",
    limit: 3,
  });
  const shelves = trpc.topics.shelves.useQuery();
  const utils = trpc.useUtils();
  const dismiss = trpc.topics.dismiss.useMutation({
    onSuccess: () => utils.topics.shelves.invalidate(),
  });
  const section = (
    title: string,
    count: number,
    items: CardProps["bookmark"][],
    onView: () => void,
    empty: string,
    onEmpty: () => void,
    label: string,
    loading: boolean,
    error: boolean
  ) => (
    <section
      id={
        title === (ar ? "أكمل القراءة" : "Continue reading")
          ? "continue-reading"
          : title === (ar ? "يحتاج انتباهًا" : "Needs attention")
            ? "needs-attention"
            : "recently-added"
      }
      className="mb-10 scroll-mt-4"
      aria-label={title}
      aria-busy={loading}
    >
      <header className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
        <h2 className="fihrist-display text-2xl">
          {title} <span className="text-sm">({count})</span>
        </h2>
        <Button variant="ghost" onClick={onView}>
          {ar ? "عرض الكل" : "View all"}
        </Button>
      </header>
      {loading ? (
        <p role="status">{ar ? "بنفتح الروابط…" : "Loading links…"}</p>
      ) : error ? (
        <p role="alert">
          {ar
            ? "تعذّر فتح القسم. جرّب تحديث الصفحة."
            : "Could not load this section. Try refreshing the page."}
        </p>
      ) : items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...items]
            .sort(
              (a, b) =>
                Number(b.pinned) - Number(a.pinned) ||
                new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
            )
            .map(bookmark => (
              <BookmarkCard
                key={bookmark.id}
                {...actions}
                bookmark={bookmark}
                collections={collections}
              />
            ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-5">
          <p>{empty}</p>
          <Button className="mt-3" onClick={onEmpty}>
            {label}
          </Button>
        </div>
      )}
    </section>
  );
  // TOKEN_POLICY_BATCHED_EXECUTION: preserve pin ordering across combined health groups.
  const continueItems = reading.data?.items.length
    ? reading.data.items
    : (recent.data?.items ?? []);
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="fihrist-display mb-2 text-3xl">
        {ar ? "مكتبة روابطك" : "Your bookmark library"}
      </h1>
      <p className="mb-4 text-muted-foreground">
        {ar
          ? "اختار حاجة تقرأها، أو راجع رابط محتاج انتباهك."
          : "Pick something to read, or review a link that needs attention."}
      </p>
      <nav
        className="mb-6 flex flex-wrap gap-3 text-sm"
        aria-label={ar ? "أقسام المكتبة" : "Library sections"}
      >
        <a
          className="rounded underline focus-visible:ring-2"
          href="#continue-reading"
        >
          {ar ? "أكمل القراءة" : "Continue reading"} (
          {reading.data?.totalCount || recent.data?.totalCount || 0})
        </a>
        <a
          className="rounded underline focus-visible:ring-2"
          href="#needs-attention"
        >
          {ar ? "يحتاج انتباهًا" : "Needs attention"} (
          {(broken.data?.totalCount ?? 0) + (review.data?.totalCount ?? 0)})
        </a>
        <a
          className="rounded underline focus-visible:ring-2"
          href="#topic-shelves"
        >
          {ar ? "الأرفف" : "Topic shelves"} ({shelves.data?.length ?? 0})
        </a>
        <a
          className="rounded underline focus-visible:ring-2"
          href="#recently-added"
        >
          {ar ? "أُضيف مؤخرًا" : "Recently added"} (
          {recent.data?.totalCount ?? 0})
        </a>
      </nav>
      {section(
        ar ? "أكمل القراءة" : "Continue reading",
        reading.data?.totalCount || recent.data?.totalCount || 0,
        continueItems,
        reading.data?.items.length ? onRead : onRecent,
        ar
          ? "لسه مفيش حاجة تقرأها. احفظ أول رابط."
          : "Nothing to read yet. Save your first link.",
        onAdd,
        ar ? "أضف رابط" : "Add a link",
        reading.isLoading || recent.isLoading,
        reading.isError || recent.isError
      )}
      {section(
        ar ? "يحتاج انتباهًا" : "Needs attention",
        (broken.data?.totalCount ?? 0) + (review.data?.totalCount ?? 0),
        [...(broken.data?.items ?? []), ...(review.data?.items ?? [])],
        onAttention,
        ar
          ? "مفيش روابط مسجلة محتاجة مراجعة. افتح الفحص عشان تتأكد."
          : "No links are recorded as needing attention. Open checks to review your library.",
        onAttention,
        ar ? "افحص الروابط" : "Check links",
        broken.isLoading || review.isLoading,
        broken.isError || review.isError
      )}
      <section
        id="topic-shelves"
        className="mb-10 scroll-mt-4"
        aria-label={ar ? "الأرفف" : "Topic shelves"}
      >
        <header className="mb-4 flex items-center justify-between border-b pb-3">
          <h2 className="fihrist-display text-2xl">
            {ar ? "الأرفف" : "Topic shelves"} ({shelves.data?.length ?? 0})
          </h2>
          <Button variant="ghost" onClick={onShelves}>
            {ar ? "عرض الكل" : "View all"}
          </Button>
        </header>
        {shelves.isLoading ? (
          <p role="status">{ar ? "بنفتح الأرفف…" : "Loading shelves…"}</p>
        ) : shelves.isError ? (
          <p role="alert">
            {ar ? "تعذّر فتح الأرفف" : "Could not load shelves"}
          </p>
        ) : shelves.data?.length ? (
          shelves.data.slice(0, 3).map(shelf => (
            <div key={shelf.id} className="mb-5">
              <h3 className="fihrist-display text-xl">
                {shelf.name} ({shelf.bookmarks.length})
              </h3>
              <Button
                variant="ghost"
                disabled={dismiss.isPending}
                onClick={() =>
                  dismiss.mutate({
                    normalizedName: shelf.normalizedName,
                    bookmarkId: 0,
                  })
                }
              >
                {ar ? "اخفِ الرف" : "Hide shelf"}
              </Button>
              <p className="mb-3 text-sm text-muted-foreground">
                {shelfReason(shelf.normalizedName, locale)}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shelf.bookmarks.slice(0, 3).map(bookmark => (
                  <div key={bookmark.id}>
                    <BookmarkCard
                      {...actions}
                      bookmark={bookmark}
                      collections={collections}
                    />
                    <Button
                      variant="ghost"
                      disabled={dismiss.isPending}
                      onClick={() =>
                        dismiss.mutate({
                          normalizedName: shelf.normalizedName,
                          bookmarkId: bookmark.id,
                        })
                      }
                    >
                      {ar ? "شيل الرابط من الرف" : "Remove link from shelf"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed p-5">
            <p>
              {ar
                ? "لسه مفيش روابط كفاية تجمع رف. أضف روابط لمواضيعك."
                : "There are not enough related links for a shelf yet. Add links about your interests."}
            </p>
            <Button className="mt-3" onClick={onAdd}>
              {ar ? "أضف رابط" : "Add a link"}
            </Button>
          </div>
        )}
      </section>
      {section(
        ar ? "أُضيف مؤخرًا" : "Recently added",
        recent.data?.totalCount ?? 0,
        recent.data?.items ?? [],
        onRecent,
        ar
          ? "مكتبتك لسه فاضية. احفظ أول رابط."
          : "Your library is empty. Save your first link.",
        onAdd,
        ar ? "أضف رابط" : "Add a link",
        recent.isLoading,
        recent.isError
      )}
      <HabitsCard />
      <LibraryLife
        renderCard={bookmark => (
          <BookmarkCard
            {...actions}
            bookmark={bookmark}
            collections={collections}
          />
        )}
      />
    </div>
  );
}
