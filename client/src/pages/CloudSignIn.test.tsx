import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ social: vi.fn(), leaveGuest: vi.fn() }));
vi.mock("@/lib/neonAuth", () => ({ neonAuth: { signIn: { social: auth.social } } }));
vi.mock("@/lib/guestLibrary", () => ({ enterGuestMode: vi.fn(), leaveGuestMode: auth.leaveGuest }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

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
    expect(auth.social).toHaveBeenCalledWith({ provider: "google", callbackURL: window.location.origin + "/library" });
  });
});
