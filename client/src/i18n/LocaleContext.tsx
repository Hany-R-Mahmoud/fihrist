import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  resolveMessage,
  type Locale,
  type MessageKey,
} from "./dictionary";

export type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
  isRtl: boolean;
};

const STORAGE_KEY = "locale";

/**
 * The default context is usable on its own, so a component can be rendered in
 * isolation (in a test, or a story) without a provider around it.
 */
const defaultContext: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  toggleLocale: () => undefined,
  t: (key, values) => resolveMessage(key, DEFAULT_LOCALE, values),
  dir: DEFAULT_LOCALE === "ar" ? "rtl" : "ltr",
  isRtl: DEFAULT_LOCALE === "ar",
};

const LocaleContext = createContext<LocaleContextValue>(defaultContext);

interface LocaleProviderProps {
  children: React.ReactNode;
  defaultLocale?: Locale;
  switchable?: boolean;
}

/**
 * Arabic is the primary language; English is one toggle away. The provider
 * mirrors the theme provider: a persisted preference, applied to the
 * document so the whole page (including the direction) follows.
 */
export function LocaleProvider({
  children,
  defaultLocale = DEFAULT_LOCALE,
  switchable = true,
}: LocaleProviderProps) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (switchable && typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "ar" || stored === "en") return stored;
    }
    return defaultLocale;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
    if (switchable) localStorage.setItem(STORAGE_KEY, locale);
  }, [locale, switchable]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale: () => setLocale(current => (current === "ar" ? "en" : "ar")),
      t: (key, values) => resolveMessage(key, locale, values),
      dir: locale === "ar" ? "rtl" : "ltr",
      isRtl: locale === "ar",
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
