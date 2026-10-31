import { askText, confirmAction } from "@/components/LibraryDialogs";
import React, { createContext, useContext } from "react";
import { useLocale } from "@/i18n/LocaleContext";
import type { BookmarkRecord } from "../../../server/db";

export const RecoveryContext = createContext<{
  lookup: (id: number) => void;
  replace: (id: number) => void;
  pending: boolean;
} | null>(null);
export function CardRecovery({ bookmark }: { bookmark: BookmarkRecord }) {
  const actions = useContext(RecoveryContext);
  const ar = useLocale().locale === "ar";
  if (bookmark.healthStatus !== "broken" || !actions) return null;
  return (
    <details className="my-2 text-sm">
      <summary className="cursor-pointer rounded p-1 focus-visible:ring-2">
        {ar ? "استرجاع الرابط" : "Recover link"}
      </summary>
      {bookmark.archiveUrl ? (
        <>
          <a
            className="block rounded p-2 underline focus-visible:ring-2"
            href={bookmark.archiveUrl}
            target="_blank"
            rel="noreferrer"
          >
            {ar ? "افتح النسخة المحفوظة" : "Open archived copy"}
          </a>
          <button
            className="rounded p-2 underline focus-visible:ring-2"
            disabled={actions.pending}
            onClick={async () => {
              if (
                await confirmAction(
                  ar
                    ? "استبدال رابط واحد بالنسخة المحفوظة؟"
                    : "Replace 1 link with its archived copy?"
                )
              )
                actions.replace(bookmark.id);
            }}
          >
            {ar ? "استخدم النسخة المحفوظة" : "Replace with archived copy"}
          </button>
        </>
      ) : (
        <button
          className="rounded p-2 underline focus-visible:ring-2"
          disabled={actions.pending}
          onClick={async () => actions.lookup(bookmark.id)}
        >
          {ar ? "دور على نسخة محفوظة" : "Find an archived copy"}
        </button>
      )}
    </details>
  );
}
