import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ social: vi.fn(), leaveGuest: vi.fn() }));
vi.mock("@/lib/neonAuth", () => ({ neonAuth: { signIn: { social: auth.social } }, useCloudSession: () => ({ data: null, isPending: false }) }));
vi.mock("@/lib/guestLibrary", () => ({ enterGuestMode: vi.fn(), leaveGuestMode: auth.leaveGuest }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Google sign-in readiness", () => {
  it("keeps Google disabled until configuration is explicitly ready", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_READY", "false");
    vi.resetModules();
    const { default: CloudSignIn } = await import("./CloudSignIn");
    render(<CloudSignIn />);
    expect((screen.getByRole("button", { name: "Continue with Google" }) as HTMLButtonElement).disabled).toBe(true);
    expect(auth.social).not.toHaveBeenCalled();
  });

  it("preserves Guest Mode when the OAuth request fails", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_READY", "true");
    vi.resetModules();
    auth.social.mockResolvedValue({ error: { message: "Provider unavailable" } });
    const { default: CloudSignIn } = await import("./CloudSignIn");
    render(<CloudSignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Provider unavailable"));
    expect(auth.leaveGuest).not.toHaveBeenCalled();
    expect(auth.social).toHaveBeenCalledWith({ provider: "google", callbackURL: window.location.origin + "/library", disableRedirect: true });
  });

  it("clears Guest Mode before navigating to Google and returns to /library", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_READY", "true");
    vi.resetModules();
    const assign = vi.fn(() => expect(auth.leaveGuest).toHaveBeenCalledTimes(1));
    vi.stubGlobal("window", { document, location: { origin: "https://fihrist.test", assign } });
    auth.social.mockResolvedValue({ data: { url: "https://accounts.google.com/test-oauth" }, error: null });
    const { default: CloudSignIn } = await import("./CloudSignIn");
    render(<CloudSignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.com/test-oauth"));
    expect(auth.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "https://fihrist.test/library", disableRedirect: true });
  });
});
