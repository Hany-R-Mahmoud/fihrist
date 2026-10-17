import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const remote = vi.hoisted(() => ({ resolver: vi.fn() }));
vi.mock("jose", async importOriginal => ({
  ...await importOriginal<typeof import("jose")>(),
  createRemoteJWKSet: remote.resolver,
}));

const base = "https://ep-fihrist.neonauth.example/fihrist/auth";
const subject = "adbe9f18-a999-4a34-b369-372025ec92c2";
let keys: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
  keys = await generateKeyPair("ES256");
  const jwk = await exportJWK(keys.publicKey);
  remote.resolver.mockReturnValue(createLocalJWKSet({ keys: [{ ...jwk, kid: "fixture" }] }));
});
afterEach(() => vi.unstubAllEnvs());

async function authenticate(claims: Record<string, unknown> = {}, wrongKey = false) {
  vi.stubEnv("NEON_AUTH_BASE_URL", base);
  const key = wrongKey ? (await generateKeyPair("ES256")).privateKey : keys.privateKey;
  const token = await new SignJWT({ sub: subject, iss: base, exp: Math.floor(Date.now() / 1000) + 60, ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "fixture" }).sign(key);
  const { authenticateCloudUser } = await import("./cloudAuth");
  return authenticateCloudUser(new Headers({ authorization: `Bearer ${token}` }));
}

describe("cloud JWT authentication", () => {
  it("accepts a signed branch identity and never grants admin", async () => {
    expect(await authenticate({ role: "admin" })).toMatchObject({ id: subject, role: "user" });
    expect(remote.resolver).toHaveBeenCalledWith(new URL(`${base}/.well-known/jwks.json`));
  });
  it("rejects a forged signature", async () => {
    await expect(authenticate({}, true)).rejects.toThrow();
  });
  it.each([
    { iss: "https://another.neonauth.example/auth" },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { exp: undefined },
    { sub: "local-user" },
  ])("rejects invalid claims %j", async claims => {
    await expect(authenticate(claims)).rejects.toThrow();
  });
  it("rejects requests without credentials", async () => {
    const { authenticateCloudUser } = await import("./cloudAuth");
    await expect(authenticateCloudUser(new Headers())).rejects.toThrow("Cloud authentication required");
  });
});
