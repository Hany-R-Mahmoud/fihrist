import { createAuthClient } from "better-auth/react";
import { createInternalNeonAuth } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";
import { useEffect, useState } from "react";

export const cloudMode = import.meta.env.VITE_FIHRIST_MODE === "cloud";
const base = import.meta.env.VITE_NEON_AUTH_BASE_URL || "https://unconfigured.invalid/auth";
const internal = createInternalNeonAuth(base, { adapter: BetterAuthReactAdapter() });
const googleAuth = createAuthClient({ basePath: "/api/auth" });
const emailAuth = internal.adapter;

// Keep existing email accounts on their managed password and email-delivery flow.
export const neonAuth = {
  signIn: { social: googleAuth.signIn.social, email: emailAuth.signIn.email },
  signUp: emailAuth.signUp,
  async getSession() {
    const own = await googleAuth.getSession();
    if (own.data?.user) return own;
    const legacy = await emailAuth.getSession();
    return legacy.data?.user ? legacy : own.error ? own : legacy;
  },
  async signOut() {
    const own = await googleAuth.signOut();
    const legacy = await emailAuth.signOut();
    return own.error ? own : legacy;
  },
};
export async function getNeonJwt() {
  const own = await googleAuth.getSession();
  return own.data?.session ? `session:${own.data.session.token}` : internal.getJWTToken();
}

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
        // Recover app-hosted Google sessions or existing managed email sessions.
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
