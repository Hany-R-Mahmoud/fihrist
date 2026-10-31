import React, { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocale } from "@/i18n/LocaleContext";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Command, CommandInput, CommandList, CommandItem } from "./ui/command";

export function LibraryCommandBar() {
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      event.preventDefault();
      setOpen(value => !value);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
  const results = trpc.bookmarks.search.useQuery(
    { query: term, limit: 10 },
    {
      enabled: open && isAuthenticated && Boolean(term),
      retry: false,
    }
  );
  const save = trpc.bookmarks.add.useMutation({
    onSuccess: async () => {
      setMessage(ar ? "اتحفظ في مكتبتك" : "Saved to your library");
      await Promise.all([
        utils.bookmarks.list.invalidate(),
        utils.bookmarks.search.invalidate(),
        utils.topics.shelves.invalidate(),
        utils.life.overview.invalidate(),
        utils.life.habits.invalidate(),
        utils.duplicates.list.invalidate(),
      ]);
    },
    onError: error =>
      setMessage(
        error.data?.code === "CONFLICT"
          ? ar
            ? "الرابط ده موجود في مكتبتك"
            : "This link is already in your library"
          : ar
            ? "تعذّر الحفظ. جرّب تاني أو راجع مكتبتك."
            : "Could not save. Try again or check your library."
      ),
  });
  let url: string | null = null;
  try {
    const parsed = new URL(query.trim());
    if (["http:", "https:"].includes(parsed.protocol)) url = parsed.href;
  } catch {
    /* Search text is not a URL. */
  }
  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 end-4 z-40 rounded-md border bg-background px-3 py-2 text-sm shadow focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
      >
        {ar ? "ابحث أو احفظ رابط" : "Search or save a link"} · Ctrl/⌘ K
      </button>
      <Dialog
        open={open}
        onOpenChange={value => {
          setOpen(value);
          setMessage("");
        }}
      >
        <DialogContent>
          <DialogTitle>
            {ar ? "ابحث أو احفظ رابط" : "Search or save a link"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "ابحث في مكتبتك أو الصق رابط لحفظه"
              : "Search your library or paste a link to save it"}
          </DialogDescription>
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={value => {
                setQuery(value);
                setMessage("");
              }}
              placeholder={ar ? "عنوان، كلمة، أو رابط" : "Title, word, or URL"}
            />
            <CommandList>
              {!isAuthenticated && (
                <p className="p-3">
                  {ar
                    ? "افتح مكتبتك أو سجّل دخول الأول"
                    : "Open your library or sign in first"}
                </p>
              )}
              {isAuthenticated && url && (
                <CommandItem
                  disabled={save.isPending}
                  onSelect={() => {
                    if (url) save.mutate({ url });
                  }}
                >
                  {ar ? "احفظ الرابط ده" : "Save this link"}
                </CommandItem>
              )}
              {results.isFetching && (
                <p role="status" className="p-3">
                  {ar ? "بندور…" : "Searching…"}
                </p>
              )}
              {results.isError && (
                <p role="alert" className="p-3">
                  {ar ? "تعذّر البحث. جرّب تاني." : "Search failed. Try again."}
                </p>
              )}
              {term &&
                !results.isFetching &&
                results.data?.items.length === 0 && (
                  <p className="p-3">{ar ? "مفيش نتائج" : "No results"}</p>
                )}
              {term === query.trim() &&
                results.data?.items.map(item => (
                  <CommandItem
                    key={item.id}
                    value={String(item.id)}
                    onSelect={() => {
                      window.open(item.url, "_blank", "noopener,noreferrer");
                      setOpen(false);
                    }}
                  >
                    {item.title || item.url}
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
          <p role="status" aria-live="polite">
            {message}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
