import { createRemoteJWKSet, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema.js";

// The JWKS belongs to one *specific* Neon Auth branch. Cross-branch tokens
// cannot be accepted merely because both databases belong to the same project.
let jwksUrl: string | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBearer(headers: unknown): string | null {
  if (!headers || typeof headers !== "object") return null;
  const source = headers as { get?: (name: string) => string | null; authorization?: string | string[] };
  const value = typeof source.get === "function" ? source.get("authorization") : source.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

export async function authenticateCloudUser(headers: unknown): Promise<User> {
  const token = getBearer(headers);
  if (!token || token.length > 8192) throw new Error("Cloud authentication required");
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl || !/^https:\/\/[^/]+\.neonauth\./.test(baseUrl)) {
    throw new Error("Neon Auth URL is missing or unexpected");
  }
  const url = `${baseUrl}/.well-known/jwks.json`;
  if (url !== jwksUrl) {
    jwksUrl = url;
    jwks = createRemoteJWKSet(new URL(url));
  }
  const { payload } = await jwtVerify(token, jwks!, {
    algorithms: ["EdDSA", "RS256", "ES256"],
    clockTolerance: 5,
  });
  // Neon Auth signs the token. Require an expiry, a UUID identity and an issuer
  // rooted at this exact branch, not a self-reported email or browser-supplied ID.
  if (!payload.exp || typeof payload.sub !== "string" || !uuid.test(payload.sub) ||
      typeof payload.iss !== "string" || (payload.iss !== baseUrl && payload.iss !== new URL(baseUrl).origin)) {
    throw new Error("Invalid Neon Auth claims");
  }
  const now = new Date();
  return {
    id: payload.sub, openId: payload.sub,
    name: typeof payload.name === "string" ? payload.name : "Fihrist member",
    email: typeof payload.email === "string" ? payload.email : null,
    loginMethod: "neon-google",
    role: "user", createdAt: now, updatedAt: now, lastSignedIn: now,
  } as unknown as User;
}
