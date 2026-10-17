import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";

const state = vi.hoisted(() => ({
  session: { data: null as null | { user: { id: string } }, isPending: true, error: null },
  guest: false,
  query: vi.fn(() => ({ data: { id: "cached-member" }, isLoading: false, error: null, refetch: vi.fn() })),
}));
vi.mock("@/lib/neonAuth", () => ({ cloudMode: true, useCloudSession: () => state.session }));
vi.mock("@/lib/guestLibrary", () => ({ isGuestMode: () => state.guest }));
vi.mock("@/lib/trpc", () => ({ trpc: { auth: { me: { useQuery: state.query } } } }));
afterEach(() => { cleanup(); state.session = { data: null, isPending: true, error: null }; state.guest = false; vi.clearAllMocks(); });

describe("cloud library gate", () => {
  it("waits for the redirect session before querying auth.me", () => {
    const hook = renderHook(useAuth);
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.user).toBeNull();
    expect(state.query.mock.calls.at(-1)).toEqual([undefined, expect.objectContaining({ enabled: false })]);
    state.session = { data: { user: { id: "member" } }, isPending: false, error: null };
    hook.rerender();
    expect(state.query.mock.calls.at(-1)).toEqual([undefined, expect.objectContaining({ enabled: true })]);
    expect(hook.result.current.isAuthenticated).toBe(true);
    state.session = { data: null, isPending: false, error: null };
    hook.rerender();
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(false);
  });

  it("lets Guest Mode open without waiting for cloud authentication", () => {
    state.guest = true;
    const hook = renderHook(useAuth);
    expect(hook.result.current.loading).toBe(false);
    expect(state.query.mock.calls.at(-1)).toEqual([undefined, expect.objectContaining({ enabled: true })]);
  });
});
