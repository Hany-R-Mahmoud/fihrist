import { cleanup, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { messages } from "@/i18n/dictionary";
import { bookmarkUrlProblem } from "@/lib/urlInput";
import { HealthView } from "./Home";

afterEach(cleanup);

const view = (guest: boolean) => (
  <HealthView
    guest={guest}
    data={{
      bookmarks: [],
      counts: {
        healthy: 0,
        redirected: 0,
        broken: 0,
        unchecked: 1,
        needs_review: 0,
      },
      settings: { enabled: false, lastRunAt: null },
    }}
    loading={false}
    onQueue={vi.fn()}
    queuePending={false}
    onEnable={vi.fn()}
    enablePending={false}
    onPause={vi.fn()}
    pausePending={false}
    onOpenBookmark={vi.fn()}
    onRequestDelete={vi.fn()}
    onOpenTimeline={vi.fn()}
    deletePending={false}
  />
);

describe("guest link health", () => {
  it("explains that checks need an account instead of offering a check that cannot run", () => {
    renderWithProviders(view(true), { locale: "ar" });
    expect(
      screen.queryByRole("button", { name: messages["health.checkNow"].ar })
    ).toBeNull();
    expect(
      screen.getByText(messages["health.guestUnavailable"].ar)
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: messages["health.guestSignIn"].ar })
        .getAttribute("href")
    ).toBe("/sign-in");
  });

  it("keeps the check action for account users", () => {
    renderWithProviders(view(false));
    expect(
      screen.getByRole("button", { name: "Check links now" })
    ).toBeTruthy();
    expect(
      screen.queryByText(messages["health.guestUnavailable"].en)
    ).toBeNull();
  });
});

describe("bookmarkUrlProblem", () => {
  it("returns a localizable message key for bad links and null for good ones", () => {
    expect(bookmarkUrlProblem("   ")).toBeNull();
    expect(bookmarkUrlProblem("example.com")).toBe("dialog.urlInvalid");
    expect(bookmarkUrlProblem("ftp://example.com")).toBe(
      "dialog.urlUnsupported"
    );
    expect(bookmarkUrlProblem("https://user:pw@example.com")).toBe(
      "dialog.urlUnsupported"
    );
    expect(bookmarkUrlProblem(`https://example.com/${"a".repeat(2048)}`)).toBe(
      "dialog.urlTooLong"
    );
    expect(bookmarkUrlProblem("https://example.com/a")).toBeNull();
  });
});

describe("language switch labels", () => {
  it("names the target language in both interface languages", () => {
    expect(messages["app.switchToEnglish"].ar).toContain("للإنجليزية");
    expect(messages["app.switchToEnglish"].en).toContain("English");
    expect(messages["app.switchToArabic"].ar).toContain("للعربية");
    expect(messages["app.switchToArabic"].en).toContain("Arabic");
  });
});
