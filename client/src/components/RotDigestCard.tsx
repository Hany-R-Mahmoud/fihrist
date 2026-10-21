import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthStamp } from "@/components/HealthStamp";
import { useLocale } from "@/i18n/LocaleContext";
import { formatDate } from "@/i18n/format";
import {
  ArrowUpRight,
  CalendarClock,
  History,
  Link2,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import React from "react";
import {
  digestNumbersLine,
  healthStateClasses,
  healthStateLabels,
  type CheckedHealthState,
  type HealthLocale,
} from "@shared/healthLanguage";

/** Each section of the digest shows at most this many items. */
export const DIGEST_SECTION_CAP = 6;

export type DigestItem = {
  bookmarkId: number;
  title: string;
  host: string;
  url: string;
  status: CheckedHealthState;
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  sentence: { ar: string; en: string };
  since: string;
  streak: number;
};

export type DigestItems = {
  newlyBroken: DigestItem[];
  recovered: DigestItem[];
  newlySuspicious: DigestItem[];
  stillBroken: DigestItem[];
  redirected: DigestItem[];
};

export type DigestFacts = {
  runId: number;
  trigger: "weekly" | "manual" | "single";
  runStartedAt: string | null;
  runCompletedAt: string | null;
  checked: number;
  skipped: number;
  counts: {
    newlyBroken: number;
    recovered: number;
    newlySuspicious: number;
    stillBroken: number;
    redirected: number;
    dismissed: number;
  };
  items: DigestItems;
  generatedAt: string;
};

export type DigestRecord = {
  id: number;
  runId: number;
  facts: DigestFacts | null;
  narrative: string | null;
  narrativeStatus: "none" | "ok" | "failed";
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedPromptTokens: number | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

/** What the owner has already done with an item in this report. */
export type ResolvedDigestItem = {
  state: "dismissed" | "updated";
  /** The address the link now points at, after an address update. */
  url?: string;
};

type SectionKey = keyof DigestItems;

type DigestSection = {
  key: SectionKey;
  label:
    | "digest.section.newlyBroken"
    | "digest.section.recovered"
    | "digest.section.newlySuspicious"
    | "digest.section.stillBroken"
    | "digest.section.redirected";
  filter: "broken" | "needs_review" | null;
  overflow: "digest.overflow" | "digest.overflowBroken";
};

const SECTION_ORDER: DigestSection[] = [
  { key: "newlyBroken", label: "digest.section.newlyBroken", filter: "broken", overflow: "digest.overflowBroken" },
  { key: "recovered", label: "digest.section.recovered", filter: null, overflow: "digest.overflow" },
  { key: "newlySuspicious", label: "digest.section.newlySuspicious", filter: "needs_review", overflow: "digest.overflow" },
  { key: "stillBroken", label: "digest.section.stillBroken", filter: "broken", overflow: "digest.overflowBroken" },
  { key: "redirected", label: "digest.section.redirected", filter: null, overflow: "digest.overflow" },
];

/**
 * The change list — what the last run actually changed — sets in two columns,
 * the way a gazette sets its changes side by side. The standing states (still
 * broken, moved) follow underneath, full width.
 */
const CHANGE_KEYS = new Set<SectionKey>([
  "newlyBroken",
  "recovered",
  "newlySuspicious",
]);
const CHANGE_SECTIONS = SECTION_ORDER.filter(section => CHANGE_KEYS.has(section.key));
const STATE_SECTIONS = SECTION_ORDER.filter(section => !CHANGE_KEYS.has(section.key));

/**
 * The narrative rot report.
 *
 * The numbers line comes first, before any prose. Everything after it is
 * either the facts block or the narrative written over it — never both mixed
 * into a wall of text.
 */
export function RotDigestCard({
  digest,
  unread = false,
  pastDigests = [],
  updatingBookmarkId = null,
  dismissingBookmarkId = null,
  onOpenTimeline,
  onDelete,
  onDismiss,
  onUpdateUrl,
  onOpenFilter,
  onSelectDigest,
  resolvedItems = {},
}: {
  digest: DigestRecord | null;
  unread?: boolean;
  pastDigests?: DigestRecord[];
  updatingBookmarkId?: number | null;
  dismissingBookmarkId?: number | null;
  onOpenTimeline: (bookmarkId: number) => void;
  onDelete: (bookmarkId: number) => void;
  onDismiss: (bookmarkId: number) => void;
  onUpdateUrl: (bookmarkId: number) => void;
  onOpenFilter: (filter: "broken" | "needs_review") => void;
  onSelectDigest?: (digestId: number) => void;
  /** Items the owner has already dismissed or updated in this report. */
  resolvedItems?: Record<number, ResolvedDigestItem>;
}) {
  const { t, locale } = useLocale();
  if (!digest) return null;

  const facts = digest.facts;
  if (!facts) {
    return (
      <section className="fihrist-card mb-6 rounded-[1.35rem] border p-5" aria-label={t("digest.cardTitle")}>
        <h2 className="fihrist-heading mb-2 text-xl font-semibold tracking-[-0.03em]">
          {t("digest.cardTitle")}
        </h2>
        <p className="fihrist-danger rounded-xl border px-3 py-2 text-sm" role="alert">
          {t("digest.unreadable")}
        </p>
      </section>
    );
  }
  const numbersLine = digestNumbersLine(
    {
      checked: facts.checked,
      newlyBroken: facts.counts.newlyBroken,
      recovered: facts.counts.recovered,
      newlySuspicious: facts.counts.newlySuspicious,
    },
    locale
  );
  const allClear =
    facts.counts.newlyBroken === 0 &&
    facts.counts.recovered === 0 &&
    facts.counts.newlySuspicious === 0 &&
    facts.counts.stillBroken === 0 &&
    facts.counts.redirected === 0;

  const renderSection = (section: DigestSection) => {
    const items = facts.items[section.key] ?? [];
    if (!items.length) return null;
    const shown = items.slice(0, DIGEST_SECTION_CAP);
    const overflow = items.length - shown.length;
    return (
      <section key={section.key} className="mb-4 last:mb-0">
        <h3 className="fihrist-muted mb-2 text-xs font-semibold uppercase tracking-[0.14em]">
          {t(section.label)}
        </h3>
        <ul className="flex flex-col gap-2">
          {shown.map(item => {
            const resolved = resolvedItems[item.bookmarkId];
            // After an address update the link points somewhere new; the
            // report is a snapshot, so show where it points now.
            const itemUrl = resolved?.url ?? item.url;
            return (
            <li
              key={item.bookmarkId}
              className="fihrist-panel rounded-xl border px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${healthStateClasses[item.status]}`}
                >
                  {healthStateLabels[item.status][locale]}
                </Badge>
                <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
                {section.key === "stillBroken" && item.streak > 1 ? (
                  <span className="fihrist-muted text-[11px]">
                    {t("digest.streakSuffix", { count: item.streak })}
                  </span>
                ) : null}
              </div>
              <p className="fihrist-muted mt-1 text-xs leading-5">{item.sentence[locale as HealthLocale]}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <a
                  href={itemUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center rounded-lg px-2 text-xs text-primary hover:bg-accent"
                >
                  <Link2 className="me-1.5 h-3.5 w-3.5" />
                  {t("digest.openLink")}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenTimeline(item.bookmarkId)}
                  className="h-7 rounded-lg px-2 text-xs text-primary hover:bg-accent"
                >
                  <History className="me-1.5 h-3.5 w-3.5" />
                  {t("digest.openTimeline")}
                </Button>
                {section.key === "redirected" &&
                item.finalUrl &&
                resolved?.state !== "updated" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={updatingBookmarkId === item.bookmarkId}
                    onClick={() => onUpdateUrl(item.bookmarkId)}
                    className="h-7 rounded-lg px-2 text-xs text-primary hover:bg-accent disabled:opacity-50"
                  >
                    {updatingBookmarkId === item.bookmarkId ? (
                      <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowUpRight className="me-1.5 h-3.5 w-3.5" />
                    )}
                    {t("digest.updateUrl")}
                  </Button>
                ) : null}
                {resolved?.state === "updated" ? (
                  <span className="fihrist-muted inline-flex h-7 items-center px-2 text-xs">
                    {t("digest.updated")}
                  </span>
                ) : resolved?.state === "dismissed" ? (
                  <span className="fihrist-muted inline-flex h-7 items-center px-2 text-xs">
                    {t("digest.dismissed")}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={dismissingBookmarkId === item.bookmarkId}
                    onClick={() => onDismiss(item.bookmarkId)}
                    className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <X className="me-1.5 h-3.5 w-3.5" />
                    {t("digest.dismiss")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onDelete(item.bookmarkId)}
                  className="ms-auto h-7 rounded-lg px-2 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="me-1.5 h-3.5 w-3.5" />
                  {t("digest.delete")}
                </Button>
              </div>
            </li>
            );
          })}
        </ul>
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => section.filter && onOpenFilter(section.filter)}
            className="mt-2 text-xs font-medium text-primary hover:text-primary/80"
          >
            {t(section.overflow, { count: overflow })}
          </button>
        ) : null}
      </section>
    );
  };

  return (
    <section className="fihrist-card fihrist-gazette mb-6 rounded-[1.35rem] border p-5" aria-label={t("digest.cardTitle")}>
      <header className="fihrist-gazette-masthead mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="fihrist-heading fihrist-display text-2xl font-semibold tracking-[-0.03em]">
            {t("landing.gazetteTitle")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {unread ? (
              <span className="fihrist-health-redirected rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                {t("digest.newBadge")}
              </span>
            ) : null}
            {digest.narrativeStatus === "none" ? (
              <span className="fihrist-muted text-[10px]">{t("digest.factsOnlyBadge")}</span>
            ) : null}
            <span className="fihrist-muted text-[10px]">
              <CalendarClock className="me-1 inline h-3 w-3" />
              {formatDate(facts.runCompletedAt ?? facts.generatedAt, locale)}
            </span>
            <HealthStamp
              variant={
                facts.counts.newlyBroken > 0 || facts.counts.newlySuspicious > 0
                  ? "review"
                  : "checked"
              }
            />
          </div>
        </div>
      </header>

      {/* The numbers line always comes first, before any prose. */}
      <p className="fihrist-heading mb-3 text-sm font-semibold leading-6">{numbersLine}</p>

      {digest.narrativeStatus === "failed" ? (
        <p className="fihrist-muted mb-3 text-xs leading-5">{t("digest.narrativeUnavailable")}</p>
      ) : null}

      {allClear ? (
        <p className="fihrist-muted text-sm leading-6">
          {t("digest.allClear")} — {t("digest.allClearBody")}
        </p>
      ) : null}

      {digest.narrative ? (
        <div className="mb-4 max-w-[60ch]">
          <p className="fihrist-muted mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {t("digest.narrativeLabel")}
          </p>
          {/* Plain prose — never raw markdown. */}
          <p className="text-sm leading-7">{digest.narrative}</p>
        </div>
      ) : null}

      <div className="fihrist-gazette-columns mb-4">
        {CHANGE_SECTIONS.map(renderSection)}
      </div>
      {STATE_SECTIONS.map(renderSection)}

      <footer className="fihrist-muted mt-4 border-t border-border pt-3 text-[10px]">
        {digest.model ? (
          t("digest.footerTokens", {
            model: digest.model,
            prompt: digest.promptTokens ?? digest.estimatedPromptTokens ?? 0,
            completion: digest.completionTokens ?? 0,
          })
        ) : digest.estimatedPromptTokens ? (
          t("digest.footerEstimateOnly", { prompt: digest.estimatedPromptTokens })
        ) : null}
      </footer>

      {pastDigests.length ? (
        <details className="mt-3 border-t border-border pt-3">
          <summary className="fihrist-muted cursor-pointer text-xs font-medium">
            {t("digest.pastReports")}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {pastDigests.map(past => (
              <li key={past.id}>
                <button
                  type="button"
                  onClick={() => onSelectDigest?.(past.id)}
                  className="fihrist-muted w-full rounded-lg px-2 py-1.5 text-start text-xs hover:bg-accent"
                >
                  {formatDate(past.createdAt, locale)} · {t("landing.gazetteTitle")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
