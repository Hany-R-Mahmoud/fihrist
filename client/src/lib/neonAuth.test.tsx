import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ getSession: vi.fn(), getJWTToken: vi.fn() }));
vi.mock("@neondatabase/auth", () => ({ createInternalNeonAuth: () => ({
  adapter: { getSession: sdk.getSession }, getJWTToken: sdk.getJWTToken,
}) }));
vi.mock("@neondatabase/auth/react/adapters", () => ({ BetterAuthReactAdapter: () => ({}) }));

beforeEach(() => { vi.stubEnv("VITE_FIHRIST_MODE", "cloud"); vi.resetModules(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("browser session recovery", () => {
  it("waits for redirect recovery and recovers again after a refresh", async () => {
    let resolve!: (value: unknown) => void;
    sdk.getSession.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { useCloudSession } = await import("./neonAuth");
    const first = renderHook(useCloudSession);
    expect(first.result.current.isPending).toBe(true);
    await act(async () => resolve({ data: { user: { id: "member" } }, error: null }));
    expect(first.result.current.data?.user.id).toBe("member");
    first.unmount();
    sdk.getSession.mockResolvedValue({ data: { user: { id: "member" } }, error: null });
    const refreshed = renderHook(useCloudSession);
    await waitFor(() => expect(refreshed.result.current.data?.user.id).toBe("member"));
    expect(sdk.getSession).toHaveBeenCalledTimes(2);
  });

  it("drops the recovered identity after sign-out and a page focus", async () => {
    sdk.getSession.mockResolvedValue({ data: { user: { id: "member" } }, error: null });
    const { useCloudSession } = await import("./neonAuth");
    const hook = renderHook(useCloudSession);
    await waitFor(() => expect(hook.result.current.data?.user.id).toBe("member"));
    sdk.getSession.mockResolvedValue({ data: null, error: null });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(hook.result.current.data).toBeNull());
    expect(hook.result.current.isPending).toBe(false);
    hook.unmount();
    const refreshed = renderHook(useCloudSession);
    await waitFor(() => expect(refreshed.result.current.isPending).toBe(false));
    expect(refreshed.result.current.data).toBeNull();
  });

  it("reports recovery errors without inventing an anonymous identity", async () => {
    sdk.getSession.mockResolvedValue({ data: null, error: { message: "Session unavailable" } });
    const { useCloudSession } = await import("./neonAuth");
    const hook = renderHook(useCloudSession);
    await waitFor(() => expect(hook.result.current.error?.message).toBe("Session unavailable"));
    expect(hook.result.current.data).toBeNull();
  });

  it("requests a current JWT for each tRPC batch and omits Authorization after sign-out", async () => {
    sdk.getJWTToken.mockResolvedValueOnce("test-jwt").mockResolvedValueOnce(null);
    const { cloudAuthorizationHeaders } = await import("./neonAuth");
    expect(await cloudAuthorizationHeaders()).toEqual({ Authorization: "Bearer test-jwt" });
    expect(await cloudAuthorizationHeaders()).toEqual({});
    expect(sdk.getJWTToken).toHaveBeenCalledTimes(2);
  });
});
