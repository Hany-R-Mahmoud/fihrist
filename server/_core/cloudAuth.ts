import { createRemoteJWKSet, jwtVerify } from "jose";
import { neon } from "@neondatabase/serverless";
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
  if (token.startsWith("session:")) {
    const sessionToken = token.slice(8);
    if (!process.env.DATABASE_URL || !/^[A-Za-z0-9_-]{32,512}$/.test(sessionToken)) {
      throw new Error("Invalid app session");
    }
    const sql = neon(process.env.DATABASE_URL);
    const users = await sql`SELECT u.id,u.name,u.email FROM neon_auth.session s
      JOIN neon_auth."user" u ON u.id=s."userId"
      WHERE s.token=${sessionToken} AND s."expiresAt">now()
      AND (u.banned IS NOT TRUE OR u."banExpires"<=now())`;
    if (users.length !== 1 || !uuid.test(users[0].id)) throw new Error("Invalid app session");
    const user = users[0];
    const now = new Date();
    return {
      id: user.id, openId: user.id, name: user.name, email: user.email,
      loginMethod: "google", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now,
    } as unknown as User;
  }
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
