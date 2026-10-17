import { createInternalNeonAuth } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const cloudMode = import.meta.env.VITE_FIHRIST_MODE === "cloud";
const base = import.meta.env.VITE_NEON_AUTH_BASE_URL || "https://unconfigured.invalid/auth";
const internal = createInternalNeonAuth(base, { adapter: BetterAuthReactAdapter() });
export const neonAuth = internal.adapter;
export const getNeonJwt = internal.getJWTToken;
