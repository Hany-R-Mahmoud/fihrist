import { describe, expect, it } from "vitest";
import { assertPublicUrlTarget, isBlockedIpAddress } from "./linkSafety";

describe("linkSafety", () => {
  it("blocks loopback, private, link-local, multicast, and IPv6 internal targets", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.20")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("224.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fd00::1")).toBe(true);
    expect(isBlockedIpAddress("2001:db8::1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
  });

  it("rejects loopback URL ingestion before any outbound request", async () => {
    await expect(assertPublicUrlTarget("http://127.0.0.1:3000/private")).rejects.toThrow(
      "Private or internal network addresses are not allowed"
    );
    await expect(assertPublicUrlTarget("http://localhost/private")).rejects.toThrow(
      "Private or internal network addresses are not allowed"
    );
  });
});
