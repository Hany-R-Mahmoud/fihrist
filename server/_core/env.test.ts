import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("runtime configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HOST", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows production startup on loopback without hosted configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { assertRuntimeConfiguration } = await import("./env");
    expect(() => assertRuntimeConfiguration()).not.toThrow();
  });

  it("rejects non-loopback production binding", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOST", "0.0.0.0");
    const { assertRuntimeConfiguration } = await import("./env");
    expect(() => assertRuntimeConfiguration()).toThrow("must bind to 127.0.0.1");
  });
});
