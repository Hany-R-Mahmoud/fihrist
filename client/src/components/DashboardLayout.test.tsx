import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import DashboardLayout from "./DashboardLayout";

const mocks = vi.hoisted(() => ({
  startLogin: vi.fn(),
  isLocalAuthMode: vi.fn(),
  logout: vi.fn(),
  authState: {
    loading: false,
    user: null as null | { name: string; email: string },
    logout: vi.fn(),
  },
}));

vi.mock("@/const", () => ({ startLogin: mocks.startLogin, isLocalAuthMode: mocks.isLocalAuthMode }));
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
  mocks.startLogin.mockReset();
  mocks.isLocalAuthMode.mockReset();
  mocks.isLocalAuthMode.mockReturnValue(false);
  mocks.logout.mockReset();
  mocks.authState.loading = false;
  mocks.authState.user = null;
  mocks.authState.logout = mocks.logout;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("DashboardLayout accessibility", () => {
  it("does not offer Manus sign-in when local mode is active", () => {
    mocks.isLocalAuthMode.mockReturnValue(true);
    renderWithTheme(
      <DashboardLayout activeView="all" onViewChange={vi.fn()} onAddBookmark={vi.fn()} onImport={vi.fn()} onExport={vi.fn()} exportPending={false}>
        <p>Workspace content</p>
      </DashboardLayout>
    );

    expect(screen.queryByRole("button", { name: "Sign in with Manus" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Local mode could not start" })).toBeTruthy();
  });

  it("keeps the Manus sign-in control keyboard reachable and activates it with Enter", async () => {
    const user = userEvent.setup();
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

    const signInButton = screen.getByRole("button", { name: "Sign in with Manus" });
    signInButton.focus();
    expect(document.activeElement).toBe(signInButton);
    await user.keyboard("{Enter}");
    expect(mocks.startLogin).toHaveBeenCalledTimes(1);
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
