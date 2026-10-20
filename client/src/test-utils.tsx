import { render } from "@testing-library/react";
import React from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/i18n/LocaleContext";

/**
 * Render a component with the providers the product shell supplies.
 *
 * Tests default to English so their assertions stay readable; pass
 * `locale: "ar"` to exercise the Arabic-first surface. The returned `rerender`
 * keeps the same providers, so a component can be re-rendered with new data
 * the way the app does when a query resolves.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: { locale?: "ar" | "en"; theme?: "light" | "dark" } = {}
) {
  const { locale = "en", theme = "light" } = options;
  const wrap = (node: React.ReactElement) => (
    <LocaleProvider defaultLocale={locale} switchable={false}>
      <ThemeProvider defaultTheme={theme} switchable>
        {node}
      </ThemeProvider>
    </LocaleProvider>
  );
  const result = render(wrap(ui));
  return {
    ...result,
    rerender: (next: React.ReactElement) => result.rerender(wrap(next)),
  };
}
