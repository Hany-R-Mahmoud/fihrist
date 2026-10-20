import { formatDistanceToNowStrict } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { Locale } from "./dictionary";

/** Relative time, in the active language. */
export function formatRelativeTime(value: Date | string, locale: Locale) {
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    locale: locale === "ar" ? ar : enUS,
  });
}

function dateTimeFormat(locale: Locale, withTime: boolean) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** An absolute date and time, in the active language's conventions. */
export function formatDateTime(value: Date | string, locale: Locale) {
  return dateTimeFormat(locale, true).format(new Date(value));
}

/** An absolute date, in the active language's conventions. */
export function formatDate(value: Date | string, locale: Locale) {
  return dateTimeFormat(locale, false).format(new Date(value));
}
