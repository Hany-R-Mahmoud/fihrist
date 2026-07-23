import type { User } from "../../drizzle/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

const localUser: User = {
  id: 1,
  openId: "local-user",
  name: "Local User",
  email: "local@localhost",
  loginMethod: "local",
  role: "admin",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  lastSignedIn: new Date("2026-01-01T00:00:00Z"),
};

describe("local authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("NODE_ENV", "development");
    vi.clearAllMocks();
    dbMocks.getUserByOpenId.mockResolvedValue(localUser);
    dbMocks.upsertUser.mockResolvedValue(undefined);
  });

  it("returns the persisted local administrator when local mode is enabled", async () => {
    // Given: a migrated database that can persist the fixed local identity.
    const { sdk } = await import("./sdk");

    // When: local authentication runs without a Manus session.
    const user = await sdk.authenticateRequest({ headers: {} });

    // Then: the identity is persisted and returned for protected procedures.
    expect(dbMocks.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "local-user",
        loginMethod: "local",
        role: "admin",
      })
    );
    expect(dbMocks.getUserByOpenId).toHaveBeenCalledWith("local-user");
    expect(user).toBe(localUser);
  });

  it("defaults to local authentication in development without auth configuration", async () => {
    vi.stubEnv("AUTH_MODE", "");
    const { sdk } = await import("./sdk");

    const user = await sdk.authenticateRequest({ headers: {} });

    expect(user).toBe(localUser);
    expect(dbMocks.upsertUser).toHaveBeenCalled();
  });

  it("keeps local authentication available in production because the server is loopback-only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { sdk } = await import("./sdk");

    const user = await sdk.authenticateRequest({ headers: {} });

    expect(user).toBe(localUser);
    expect(dbMocks.upsertUser).toHaveBeenCalled();
  });
});
