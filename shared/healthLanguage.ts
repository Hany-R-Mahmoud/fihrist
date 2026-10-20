/**
 * The single source of truth for how a link's health is spoken about.
 *
 * Both the per-link timeline (client) and the narrative rot report (server)
 * render from here, so the two surfaces can never disagree about what a
 * recorded state means. Raw codes and error strings are never shown alone:
 * every state carries a plain-language sentence.
 */

export type HealthState = "healthy" | "redirected" | "broken" | "needs_review" | "unchecked";
export type CheckedHealthState = Exclude<HealthState, "unchecked">;
export type HealthLocale = "ar" | "en";

/** DESIGN.md health recipes: colour is supplementary, the label is the truth. */
export const healthStateClasses: Record<HealthState, string> = {
  healthy:
    "fihrist-health-healthy !bg-emerald-500/15 !text-emerald-800 dark:!text-emerald-300",
  redirected:
    "fihrist-health-redirected !bg-amber-500/15 !text-amber-800 dark:!text-amber-300",
  broken:
    "fihrist-health-broken !bg-red-500/15 !text-red-800 dark:!text-red-300",
  needs_review:
    "fihrist-health-needs-review !bg-amber-500/15 !text-amber-800 dark:!text-amber-300",
  unchecked: "fihrist-health-unchecked !bg-muted !text-muted-foreground",
};

export const healthStateLabels: Record<HealthState, Record<HealthLocale, string>> = {
  healthy: { ar: "سليم", en: "Healthy" },
  redirected: { ar: "اتنقل", en: "Redirected" },
  broken: { ar: "مكسور", en: "Broken" },
  needs_review: { ar: "محتاج مراجعة", en: "Needs review" },
  unchecked: { ar: "لسه ما اتفحصش", en: "Unchecked" },
};

export type PlainLanguageInput = {
  status: HealthState;
  httpStatus?: number | null;
  error?: string | null;
};

/**
 * Why a `needs_review` result is inconclusive. The recorded error text is the
 * whole truth — nothing here asserts a cause the checker did not report.
 */
type NeedsReviewKind = "blocked" | "empty_shell" | "inconclusive" | "malformed";

function needsReviewKind(error: string | null | undefined): NeedsReviewKind {
  const text = (error ?? "").toLocaleLowerCase();
  if (text.includes("malformed")) return "malformed";
  if (text.includes("empty app shell")) return "empty_shell";
  if (
    text.includes("bot challenge") ||
    text.includes("login wall") ||
    text.includes("blocks automated checks")
  ) {
    return "blocked";
  }
  return "inconclusive";
}

function isDnsOrRefusal(error: string | null | undefined) {
  const text = (error ?? "").toLocaleLowerCase();
  return text.includes("does not resolve") || text.includes("refused the connection");
}

/**
 * The plain-language sentence for a recorded check. Never returns a raw code
 * or an error string on its own — the code may be shown beside it, but the
 * sentence always carries the meaning.
 */
export function plainLanguageSentence(
  input: PlainLanguageInput,
  locale: HealthLocale = "ar"
): string {
  const { status, httpStatus, error } = input;

  if (status === "healthy") {
    return locale === "ar" ? "شغال" : "Working";
  }

  if (status === "redirected") {
    return locale === "ar"
      ? "الرابط اتنقل لعنوان جديد"
      : "The link moved to a new address";
  }

  if (status === "broken") {
    if (httpStatus === 404 || httpStatus === 410) {
      return locale === "ar"
        ? "الصفحة اتشالت من الموقع"
        : "The page was removed from the site";
    }
    if (isDnsOrRefusal(error)) {
      return locale === "ar"
        ? "الموقع نفسه مش بيرد — غالبًا قفل أو اتنقل"
        : "The site itself is not responding — it may be blocked or moved";
    }
    return locale === "ar"
      ? "الموقع رجّع خطأ في كل مرة"
      : "The site returned an error every time";
  }

  if (status === "needs_review") {
    const kind = needsReviewKind(error);
    if (kind === "blocked") {
      return locale === "ar"
        ? "الموقع منع الفحص الآلي — افتحه بنفسك واتأكد"
        : "The site blocked the automatic check — open it yourself and check";
    }
    if (kind === "empty_shell") {
      return locale === "ar"
        ? "الصفحة رجعت فاضية من غير جافاسكربت — افتحه بنفسك واتأكد"
        : "The page came back empty without JavaScript — open it yourself and check";
    }
    if (kind === "malformed") {
      return locale === "ar"
        ? "الرابط مكتوب بشكل غلط — صلّحه بنفسك"
        : "The link is malformed — fix it yourself";
    }
    return locale === "ar"
      ? "الفحص ما وصلش لنتيجة واضحة — افتحه بنفسك واتأكد"
      : "The check was not conclusive — open it yourself and check";
  }

  return locale === "ar" ? "لسه ما اتفحصش" : "Not checked yet";
}

/** Digest section headings, in the order the digest presents them. */
export const digestSectionLabels = {
  newlyBroken: { ar: "انكسر", en: "Broke" },
  recovered: { ar: "اتعافى", en: "Recovered" },
  newlySuspicious: { ar: "محتاج مراجعة", en: "Needs review" },
  stillBroken: { ar: "لسه مكسور", en: "Still broken" },
  redirected: { ar: "اتنقل لعنوان جديد", en: "Moved to a new address" },
} as const satisfies Record<string, Record<HealthLocale, string>>;

export type DigestSectionKey = keyof typeof digestSectionLabels;

/**
 * The numbers line. It always comes first, before any prose, and its shape is
 * fixed: checked • broken • recovered • needs review.
 */
export function digestNumbersLine(
  counts: { checked: number; newlyBroken: number; recovered: number; newlySuspicious: number },
  locale: HealthLocale = "ar"
): string {
  if (locale === "ar") {
    return `الفحص الأسبوعي: اتفحص ${counts.checked} • انكسر ${counts.newlyBroken} • رجع ${counts.recovered} • محتاج مراجعة ${counts.newlySuspicious}`;
  }
  return `Weekly check: ${counts.checked} checked • ${counts.newlyBroken} broke • ${counts.recovered} recovered • ${counts.newlySuspicious} need review`;
}

export const digestAllClear: Record<HealthLocale, string> = {
  ar: "كله سليم",
  en: "All clear",
};

/** Run separators in the timeline. */
export const runKindLabels = {
  weekly: { ar: "الفحص الأسبوعي", en: "Weekly check" },
  manual: { ar: "فحص يدوي", en: "Manual check" },
  single: { ar: "فحص واحد", en: "Single check" },
} as const satisfies Record<string, Record<HealthLocale, string>>;
