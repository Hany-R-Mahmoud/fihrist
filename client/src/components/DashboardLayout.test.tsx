import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import DashboardLayout from "./DashboardLayout";

const mocks = vi.hoisted(() => ({
  authState: {
    loading: false,
    user: null as null | { name: string; email: string },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.authState,
}));

afterEach(() => cleanup());

function renderWithTheme(children: React.ReactNode) {
  return render(
    <ThemeProvider defaultTheme="light" switchable>
      {children}
    </ThemeProvider>
  );
}

beforeEach(() => {
  mocks.authState.loading = false;
  mocks.authState.user = null;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("DashboardLayout accessibility", () => {
  it("does not offer Manus sign-in when local mode is active", () => {
    renderWithTheme(
      <DashboardLayout activeView="all" onViewChange={vi.fn()} onAddBookmark={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} exportPending={false}>
        <p>Workspace content</p>
      </DashboardLayout>
    );

    expect(screen.queryByRole("button", { name: "Sign in with Manus" })).toBeNull();
    expect(screen.getByText(/Local mode could not open the library/)).toBeTruthy();
  });

  it("keeps the local failure state free of hosted authentication controls", () => {
    renderWithTheme(
      <DashboardLayout
        activeView="all"
        onViewChange={vi.fn()}
        onAddBookmark={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        exportPending={false}
      >
        <p>Workspace content</p>
      </DashboardLayout>
    );

    expect(screen.queryByRole("button", { name: "Sign in with Manus" })).toBeNull();
    expect(screen.queryByText("Sign in with Manus")).toBeNull();
  });

  it("exposes landmark navigation and keyboard-operable workspace actions for an authenticated user", async () => {
    mocks.authState.user = { name: "Audio Books", email: "audio@example.com" };
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    const onAddBookmark = vi.fn();
    const onImport = vi.fn();
    const onExport = vi.fn();
    renderWithTheme(
      <DashboardLayout
        activeView="all"
        onViewChange={onViewChange}
        onAddBookmark={onAddBookmark}
        onImport={onImport}
        onExport={onExport}
        exportPending={false}
      >
        <h1>All links</h1>
      </DashboardLayout>
    );

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    const collectionsButton = screen.getByRole("button", { name: "Collections" });
    collectionsButton.focus();
    expect(document.activeElement).toBe(collectionsButton);
    await user.keyboard("{Enter}");
    expect(onViewChange).toHaveBeenCalledWith("collections");

    const addButton = screen.getAllByRole("button", { name: "Add bookmark" })[0];
    addButton.focus();
    await user.keyboard("{Enter}");
    expect(onAddBookmark).toHaveBeenCalledTimes(1);

    const importButton = screen.getAllByRole("button", { name: "Import browser file" })[0];
    importButton.focus();
    await user.keyboard("{Enter}");
    expect(onImport).toHaveBeenCalledTimes(1);

    const exportButton = screen.getAllByRole("button", { name: "Export browser file" })[0];
    exportButton.focus();
    await user.keyboard("{Enter}");
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("switches between light and dark mode with a keyboard-accessible toggle", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <DashboardLayout activeView="all" onViewChange={vi.fn()} onAddBookmark={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} exportPending={false}>
        <p>Workspace content</p>
      </DashboardLayout>
    );

    const themeToggle = screen.getByRole("button", { name: "Switch to dark mode" });
    themeToggle.focus();
    await user.keyboard("{Enter}");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });
});
