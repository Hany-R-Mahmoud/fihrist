import { cleanup, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import Landing from "./Landing";
const session = vi.hoisted(() => ({
  data: null as null | { user: { id: string } },
  isPending: false,
}));
vi.mock("@/lib/neonAuth", () => ({ useCloudSession: () => session }));

afterEach(() => {
  cleanup();
  session.data = null;
});

describe("Landing", () => {
  it("offers Open Library for a recovered session", () => {
    session.data = { user: { id: "member" } };
    renderWithProviders(<Landing />);
    for (const link of screen.getAllByRole("link", { name: /Open Library/ })) {
      expect(link.getAttribute("href")).toBe("/library");
    }
    expect(
      screen.queryByRole("link", { name: /Sign in with Google/ })
    ).toBeNull();
  });
  it("starts at the public landing with clear sign-in and guest choices", () => {
    renderWithProviders(<Landing />);

    expect(
      screen.getByRole("heading", { name: /Keep the web.*return to/ })
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /sign in/i })
        .some(link => link.getAttribute("href") === "/sign-in")
    ).toBe(true);
    expect(screen.getAllByRole("button", { name: /guest/i })).toHaveLength(2);
  });

  it("exposes the collection and link-health chapters", () => {
    renderWithProviders(<Landing />);

    expect(
      screen.getByRole("heading", {
        name: "Give every good link a place to land.",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "The web changes. Your memory does not have to.",
      })
    ).toBeTruthy();
    expect(
      screen.getByText(/Explore as a guest with browser-only bookmarks/)
    ).toBeTruthy();
  });

  it("serves the Arabic-first surface with the same structure", () => {
    renderWithProviders(<Landing />, { locale: "ar" });

    expect(screen.getByRole("heading", { name: /احتفظ بالويب/ })).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /تسجيل الدخول/ })
        .every(link => link.getAttribute("href") === "/sign-in")
    ).toBe(true);
    expect(document.documentElement.dir).toBe("rtl");
  });
});
