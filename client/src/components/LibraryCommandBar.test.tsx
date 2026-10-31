import React from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { LibraryCommandBar } from "./LibraryCommandBar";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), authenticated: true }));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: mocks.authenticated }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      bookmarks: {
        list: { invalidate: vi.fn() },
        search: { invalidate: vi.fn() },
      },
    }),
    bookmarks: {
      search: {
        useQuery: () => ({
          data: { items: [] },
          isFetching: false,
          isError: false,
        }),
      },
      add: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
    },
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.authenticated = true;
});

describe("library command bar", () => {
  it("opens with the shortcut but leaves typing fields alone", () => {
    renderWithProviders(
      <>
        <input aria-label="Notes" />
        <LibraryCommandBar />
      </>
    );
    fireEvent.keyDown(screen.getByLabelText("Notes"), {
      key: "k",
      ctrlKey: true,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("saves a pasted URL with the existing add procedure", () => {
    renderWithProviders(<LibraryCommandBar />);
    fireEvent.click(screen.getByRole("button", { name: /Search or save/ }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "https://example.com/article" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Save this link" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      url: "https://example.com/article",
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("shows a sign-in explanation without offering an unauthenticated save", () => {
    mocks.authenticated = false;
    renderWithProviders(<LibraryCommandBar />);
    fireEvent.click(screen.getByRole("button", { name: /Search or save/ }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "https://example.com" },
    });
    expect(screen.getByText("Open your library or sign in first")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Save this link" })).toBeNull();
  });
});
