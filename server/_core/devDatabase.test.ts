import { describe, expect, it } from "vitest";
import { resolveDevDatabase } from "../../scripts/dev";

describe("local development database", () => {
  it("bootstraps the bundled database when local mode has no DATABASE_URL", () => {
    expect(resolveDevDatabase({ NODE_ENV: "development" })).toEqual({
      bootstrap: true,
      url: "mysql://fihrist:fihrist@127.0.0.1:3306/fihrist",
    });
  });

  it("preserves explicit and OAuth database configuration", () => {
    expect(
      resolveDevDatabase({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://custom/db",
      })
    ).toEqual({ bootstrap: false, url: "mysql://custom/db" });
    expect(
      resolveDevDatabase({ NODE_ENV: "development", AUTH_MODE: "oauth" })
    ).toEqual({ bootstrap: false, url: "" });
  });
});
