import { useLocale } from "@/i18n/LocaleContext";
import React from "react";

export type HealthStampVariant = "checked" | "review";

/**
 * The editorial stamp: a health verdict, never decoration.
 *
 * It appears in exactly three places — the landing's link-health section, the
 * in-app health summary, and the link gazette — and nowhere else.
 */
export function HealthStamp({
  variant,
  className = "",
}: {
  variant: HealthStampVariant;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <span
      className={`fihrist-stamp fihrist-stamp--${variant} ${className}`.trim()}
    >
      {variant === "checked"
        ? t("landing.stampChecked")
        : t("landing.stampReview")}
    </span>
  );
}
