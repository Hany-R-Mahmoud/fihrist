import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const cloudMode = import.meta.env.VITE_FIHRIST_MODE === "cloud";
const base = import.meta.env.VITE_NEON_AUTH_BASE_URL || "https://unconfigured.invalid/auth";
export const neonAuth = createAuthClient(base, { adapter: BetterAuthReactAdapter() });
