import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthReasonIcon } from "@/components/HealthReasonIcon";
import { useLocale } from "@/i18n/LocaleContext";
import { formatDate, formatDateTime } from "@/i18n/format";
import { HeartPulse, Loader2, RotateCcw } from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  healthStateClasses,
  healthStateLabels,
  plainLanguageSentence,
  type CheckedHealthState,
} from "@shared/healthLanguage";

/** A bookmark with more checks than this defaults to "changes only". */
export const TIMELINE_CHANGE_THRESHOLD = 26;
/** The timeline never renders more than this many entries at once. */
export const TIMELINE_PAGE_SIZE = 50;

export type TimelineTransitionKind =
  | "newly_broken"
  | "recovered"
  | "newly_suspicious"
  | "still_broken";

export type TimelineEntry = {
  id: number;
  bookmarkId: number;
  runId: number | null;
  jobId: number | null;
  checkedAt: Date;
  status: CheckedHealthState;
  httpStatus: number | null;
  finalUrl: string | null;
  durationMs: number | null;
  error: string | null;
  failureClass?:string|null;networkCode?:string|null;moveClass?:string|null;
  titleSnapshot?:string|null;redirectChain?:string|null;bodyHash?:string|null;
  finalHost?:string|null;contentLength?:number|null;
  runStartedAt: Date | null;
  runCompletedAt: Date | null;
  runTrigger: "weekly" | "manual" | "single" | null;
  transition: TimelineTransitionKind | null;
};

export type TimelineSummary = {
  totalChecks: number;
  firstCheckedAt: Date | null;
  firstBrokenAt: Date | null;
  currentStatus: CheckedHealthState | null;
  currentStatusSince: Date | null;
  brokenStreak: number;
  brokenSince: Date | null;
};

export type TimelineMode = "all" | "changes";

function safeHops(chain:string|null|undefined):Array<{u:string;s:number}> {
  try {
    const json=JSON.parse(chain??"[]") as unknown;
    if(!Array.isArray(json))return [];
    return json.filter((x):x is {u:string;s:number}=>x && typeof x.u==="string" &&
      typeof x.s==="number").slice(0,8);
  } catch { return []; }
}

function runLabel(
  trigger: TimelineEntry["runTrigger"],
  t: (key: "timeline.runWeekly" | "timeline.runManual" | "timeline.runSingle" | "timeline.runNone") => string
) {
  if (trigger === "weekly") return t("timeline.runWeekly");
  if (trigger === "manual") return t("timeline.runManual");
  if (trigger === "single") return t("timeline.runSingle");
  return t("timeline.runNone");
}

function groupByRun(entries: TimelineEntry[]) {
  const groups: Array<{ runId: number | null; trigger: TimelineEntry["runTrigger"]; entries: TimelineEntry[] }> = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.runId === entry.runId) {
      last.entries.push(entry);
      continue;
    }
    groups.push({ runId: entry.runId, trigger: entry.runTrigger, entries: [entry] });
  }
  return groups;
}

/**
 * The per-link timeline: every recorded check, grouped under the run that
 * produced it, with a summary of the link's health history.
 */
export function HealthTimeline({
  entries,
  summary,
  loading = false,
  checking = false,
  onCheckNow,
}: {
  entries: TimelineEntry[];
  summary: TimelineSummary | null;
  loading?: boolean;
  checking?: boolean;
  onCheckNow?: () => void;
}) {
  const { t, locale } = useLocale();
  const totalChecks = summary?.totalChecks ?? entries.length;
  // The default follows the data: the history arrives after this component
  // mounts, so the mode must be derived rather than captured on first render.
  const defaultMode: TimelineMode = totalChecks <= TIMELINE_CHANGE_THRESHOLD ? "all" : "changes";
  const [modeOverride, setModeOverride] = useState<TimelineMode | null>(null);
  const mode = modeOverride ?? defaultMode;
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE_SIZE);

  const filtered = useMemo(
    () => (mode === "changes" ? entries.filter(entry => entry.transition !== null) : entries),
    [entries, mode]
  );
  const visible = filtered.slice(0, visibleCount);
  const groups = groupByRun(visible);

  if (loading) {
    return (
      <div className="fihrist-muted flex items-center gap-2 text-sm" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </div>
    );
  }

  if (!totalChecks) {
    return (
      <div className="fihrist-empty rounded-[1.35rem] border border-dashed p-8 text-center">
        <HeartPulse className="mx-auto mb-3 h-6 w-6 text-primary" />
        <p className="fihrist-heading font-medium">{t("timeline.emptyTitle")}</p>
        <p className="fihrist-muted mx-auto mt-1 max-w-sm text-sm leading-6">{t("timeline.emptyBody")}</p>
        {onCheckNow ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCheckNow}
            disabled={checking}
            className="fihrist-health-action mt-4 rounded-xl"
          >
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            {t("timeline.checkNow")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {summary ? (
        <section className="fihrist-card rounded-[1.35rem] border p-4" aria-label={t("timeline.summaryTitle")}>
          <p className="fihrist-muted mb-3 text-xs font-semibold uppercase tracking-[0.14em]">
            {t("timeline.summaryTitle")}
          </p>
          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="fihrist-muted text-xs">{t("timeline.firstCheckedLabel")}</dt>
              <dd className="text-xs">
                {summary.firstCheckedAt ? formatDate(summary.firstCheckedAt, locale) : "—"}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="fihrist-muted text-xs">{t("timeline.firstBrokenLabel")}</dt>
              <dd className="text-xs">
                {summary.firstBrokenAt ? formatDate(summary.firstBrokenAt, locale) : t("timeline.neverBroken")}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="fihrist-muted text-xs">{t("timeline.currentStatusLabel")}</dt>
              <dd className="flex flex-wrap items-center gap-2 text-xs">
                {summary.currentStatus ? (
                  <Badge
                    variant="outline"
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${healthStateClasses[summary.currentStatus]}`}
                  >
                    {healthStateLabels[summary.currentStatus][locale]}
                  </Badge>
                ) : null}
                {summary.currentStatusSince
                  ? t("timeline.sinceLabel", { date: formatDate(summary.currentStatusSince, locale) })
                  : null}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="fihrist-muted text-xs">{t("timeline.totalChecksLabel")}</dt>
              <dd className="text-xs">{summary.totalChecks}</dd>
            </div>
            {summary.currentStatus === "broken" ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="fihrist-muted text-xs">
                  {t("timeline.brokenStreakLabel", { count: summary.brokenStreak })}
                </dt>
                <dd className="text-xs">
                  {summary.brokenSince
                    ? t("timeline.sinceLabel", { date: formatDate(summary.brokenSince, locale) })
                    : "—"}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="fihrist-muted text-xs">
          {t("timeline.modeNote", {
            mode: mode === "changes" ? t("timeline.modeChanges") : t("timeline.modeAll"),
            total: totalChecks,
          })}
        </span>
        <div className="ms-auto flex items-center gap-2">
          {mode === "changes" ? (
            <Button type="button" variant="outline" onClick={() => setModeOverride("all")} className="h-8 rounded-lg text-xs">
              {t("timeline.showAll")}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setModeOverride("changes")} className="h-8 rounded-lg text-xs">
              {t("timeline.showChanges")}
            </Button>
          )}
          {onCheckNow ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCheckNow}
              disabled={checking}
              className="fihrist-health-action h-8 rounded-lg text-xs"
            >
              {checking ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
              {t("timeline.checkNow")}
            </Button>
          ) : null}
        </div>
      </div>

      {groups.length ? (
        <div className="fihrist-card overflow-hidden rounded-[1.35rem] border">
          {groups.map(group => (
            <section key={group.runId ?? `single-${group.entries[0]?.id}`}>
              <header className="fihrist-muted flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/50 px-5 py-2 text-xs">
                <span className="font-semibold">{runLabel(group.trigger, t)}</span>
                <span>
                  {group.entries[0]?.runStartedAt
                    ? formatDate(group.entries[0].runStartedAt, locale)
                    : null}
                </span>
              </header>
              {group.entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`flex flex-col gap-2 px-5 py-3.5 ${index ? "border-t border-border" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${healthStateClasses[entry.status]}`}
                    >
                      {healthStateLabels[entry.status][locale]}
                    </Badge>
                    <span className="fihrist-muted text-xs">{formatDateTime(entry.checkedAt, locale)}</span>
                    {entry.durationMs !== null ? (
                      <span className="fihrist-muted text-xs">{t("timeline.duration", { ms: entry.durationMs })}</span>
                    ) : null}
                  </div>
                  <p className="flex items-center gap-2 text-sm leading-6">
                    <HealthReasonIcon failureClass={entry.failureClass} moveClass={entry.moveClass}/>
                    {plainLanguageSentence(
                      { status: entry.status, httpStatus: entry.httpStatus, error: entry.error,
                        failureClass:entry.failureClass,moveClass:entry.moveClass },
                      locale
                    )}
                  </p>
                  <details className="fihrist-panel mt-1 rounded-lg border p-3 text-xs">
                    <summary className="cursor-pointer font-medium text-foreground">{t("health.detailEvidence")}</summary>
                    <dl className="fihrist-muted mt-2 grid gap-2">
                      {entry.failureClass ? <div><dt className="font-semibold">{t("health.detailFailure")}</dt>
                        <dd>{plainLanguageSentence({status:entry.status,httpStatus:entry.httpStatus,
                          error:entry.error,failureClass:entry.failureClass,moveClass:entry.moveClass},locale)}</dd></div>:null}
                      {entry.httpStatus!==null ? <div><dt>HTTP</dt><dd dir="ltr">{t("common.httpCode",{code:entry.httpStatus})}</dd></div>:null}
                      {entry.durationMs!==null ? <div><dt>{t("timeline.duration",{ms:entry.durationMs})}</dt></div>:null}
                      {entry.networkCode ? <div><dt>{t("health.detailNetwork")}</dt>
                        <dd dir="ltr" className="break-all font-mono">{entry.networkCode}</dd></div>:null}
                      {entry.titleSnapshot ? <div><dt>{t("health.detailTitle")}</dt>
                        <dd>{entry.titleSnapshot}</dd></div>:null}
                      {entry.finalUrl ? <div><dt>URL</dt><dd dir="ltr" className="break-all font-mono">{entry.finalUrl}</dd></div>:null}
                      {safeHops(entry.redirectChain).length>0 ?
                        <div><dt className="font-semibold">{t("health.detailChain")}</dt>
                          <dd><ol className="mt-2 list-inside list-decimal space-y-1" dir="ltr">
                            {safeHops(entry.redirectChain).map((hop,i)=>
                              <li key={i} className="break-all"><span className="font-mono">{hop.s}</span>{" "}{hop.u}</li>)}
                          </ol></dd></div>:null}
                    </dl>
                  </details>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="fihrist-empty rounded-[1.35rem] border border-dashed p-6 text-center">
          <p className="fihrist-muted text-sm">{t("timeline.noChanges")}</p>
        </div>
      )}

      {filtered.length > visible.length ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleCount(count => count + TIMELINE_PAGE_SIZE)}
            className="rounded-xl"
          >
            {t("timeline.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
