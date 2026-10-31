import React, { createContext, useContext } from "react";
import { useLocale } from "@/i18n/LocaleContext";
import { Button } from "./ui/button";
import { Star, Pin } from "lucide-react";
type ReadingUpdate = {
  id: number;
  readingStatus?: "unread" | "reading" | "read" | "archived";
  starred?: boolean;
  pinned?: boolean;
};
export const ReadingContext = createContext<{
  mutate: (input: ReadingUpdate) => void;
  isPending: boolean;
}>({ mutate: () => undefined, isPending: true });

export function ReadingControls({
  bookmark,
}: {
  bookmark: {
    id: number;
    readingStatus?: "unread" | "reading" | "read" | "archived";
    starred?: boolean;
    pinned?: boolean;
  };
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const update = useContext(ReadingContext);
  return (
    <div className="my-2 flex items-center gap-2">
      <select
        aria-label={ar ? "حالة القراءة" : "Reading status"}
        className="min-w-0 rounded border bg-background p-1 text-sm focus-visible:ring-2 focus-visible:ring-ring"
        value={bookmark.readingStatus ?? "unread"}
        disabled={update.isPending}
        onChange={event =>
          update.mutate({
            id: bookmark.id,
            readingStatus: event.target.value as
              | "unread"
              | "reading"
              | "read"
              | "archived",
          })
        }
      >
        <option value="unread">{ar ? "غير المقروء" : "Unread"}</option>
        <option value="reading">{ar ? "بقرأه" : "Reading"}</option>
        <option value="read">{ar ? "مقروء" : "Read"}</option>
        <option value="archived">{ar ? "مؤرشف" : "Archived"}</option>
      </select>
      <Button
        variant="ghost"
        size="icon"
        aria-label={ar ? "مفضّل" : "Starred"}
        aria-pressed={Boolean(bookmark.starred)}
        disabled={update.isPending}
        onClick={() =>
          update.mutate({ id: bookmark.id, starred: !bookmark.starred })
        }
      >
        <Star className={bookmark.starred ? "fill-current" : ""} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={ar ? "مثبّت" : "Pinned"}
        aria-pressed={Boolean(bookmark.pinned)}
        disabled={update.isPending}
        onClick={() =>
          update.mutate({ id: bookmark.id, pinned: !bookmark.pinned })
        }
      >
        <Pin className={bookmark.pinned ? "fill-current" : ""} />
      </Button>
    </div>
  );
}
