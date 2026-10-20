import { createInternalNeonAuth } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { useEffect, useState } from "react";

export const cloudMode = import.meta.env.VITE_FIHRIST_MODE === "cloud";
const base = import.meta.env.VITE_NEON_AUTH_BASE_URL || "https://unconfigured.invalid/auth";
const internal = createInternalNeonAuth(base, { adapter: BetterAuthReactAdapter() });
export const neonAuth = internal.adapter;
export const getNeonJwt = internal.getJWTToken;

type BrowserSession = Awaited<ReturnType<typeof neonAuth.getSession>>["data"];

export function useCloudSession() {
  const [state, setState] = useState<{ data: BrowserSession; isPending: boolean; error: Error | null }>({
    data: null, isPending: cloudMode, error: null,
  });
  useEffect(() => {
    if (!cloudMode) return;
    let active = true;
    let revision = 0;
    async function recover() {
      const current = ++revision;
      try {
        // Let the pinned SDK exchange redirect verifiers and recover its cookie session.
        const result = await neonAuth.getSession();
        if (result.error) throw new Error(result.error.message || "Could not recover your session");
        if (active && current === revision) setState({ data: result.data, isPending: false, error: null });
      } catch (error) {
        if (active && current === revision) setState({ data: null, isPending: false, error: error instanceof Error ? error : new Error("Could not recover your session") });
      }
    }
    void recover();
    window.addEventListener("focus", recover);
    window.addEventListener("pageshow", recover);
    return () => {
      active = false;
      window.removeEventListener("focus", recover);
      window.removeEventListener("pageshow", recover);
    };
  }, []);
  return state;
}

export async function cloudAuthorizationHeaders(): Promise<Record<string, string>> {
  if (!cloudMode) return {};
  const token = await getNeonJwt();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
