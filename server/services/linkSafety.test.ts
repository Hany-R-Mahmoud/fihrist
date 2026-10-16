import { describe, expect, it } from "vitest";
import {
  assertPublicUrlTarget,
  classifyHealthStatus,
  isBlockedIpAddress,
  looksBotBlocked,
  looksLikeJsShell,
  type HealthProbe,
} from "./linkSafety";

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

describe("tri-state health classification", () => {
  const probe = (partial: Partial<HealthProbe>): HealthProbe => ({
    status: null,
    ...partial,
  });

  it("marks a clean 200 as healthy", () => {
    const result = classifyHealthStatus(
      [probe({ status: 200, finalUrl: "https://example.com/" })],
      "https://example.com/"
    );
    expect(result.healthStatus).toBe("healthy");
    expect(result.healthError).toBeNull();
  });

  it("marks a 200 at a different URL as redirected", () => {
    const result = classifyHealthStatus(
      [probe({ status: 200, finalUrl: "https://example.com/new" })],
      "https://example.com/old"
    );
    expect(result.healthStatus).toBe("redirected");
  });

  it("never marks a Cloudflare-blocked (403) URL as dead", () => {
    const probes = [probe({ status: 403 }), probe({ status: 403 }), probe({ status: 403 })];
    const result = classifyHealthStatus(probes, "https://protected.example/");
    expect(result.healthStatus).toBe("needs_review");
    expect(result.healthError).toMatch(/blocks automated checks/);
  });

  it("never marks a rate-limited (429) URL as dead", () => {
    const result = classifyHealthStatus(
      [probe({ status: 429 }), probe({ status: 429 })],
      "https://example.com/"
    );
    expect(result.healthStatus).toBe("needs_review");
  });

  it("detects bot-challenge pages served with HTTP 200", () => {
    expect(
      looksBotBlocked(200, "<html><title>just a moment...</title>checking your browser</html>")
    ).toBe(true);
    const result = classifyHealthStatus(
      [probe({ status: 200, bodySample: "attention required! cloudflare challenge-platform" })],
      "https://example.com/"
    );
    expect(result.healthStatus).toBe("needs_review");
  });

  it("marks empty JS app shells as needs_review, not healthy", () => {
    expect(looksLikeJsShell(200, '<html><body><div id="root"></div></body></html>')).toBe(true);
    expect(looksLikeJsShell(200, "<html><body><p>Real article text ".repeat(50))).toBe(false);
    const result = classifyHealthStatus(
      [probe({ status: 200, bodySample: '<html><body><div id="root"></div></body></html>' })],
      "https://example.com/"
    );
    expect(result.healthStatus).toBe("needs_review");
  });

  it("treats temporary DNS resolution failures as needs_review", () => {
    const probes = [
      probe({ networkCode: "EAI_AGAIN" }),
      probe({ networkCode: "EAI_AGAIN" }),
      probe({ networkCode: "EAI_AGAIN" }),
    ];
    expect(classifyHealthStatus(probes, "https://temporarily-unreachable.example/").healthStatus)
      .toBe("needs_review");
  });

  it("marks persistent DNS failure as broken", () => {
    const probes = [
      probe({ networkCode: "ENOTFOUND" }),
      probe({ networkCode: "ENOTFOUND" }),
      probe({ networkCode: "ENOTFOUND" }),
    ];
    const result = classifyHealthStatus(probes, "https://dead-domain-xyz.example/");
    expect(result.healthStatus).toBe("broken");
    expect(result.healthError).toMatch(/does not resolve/);
  });

  it("marks consistent 404s as broken", () => {
    const probes = [probe({ status: 404 }), probe({ status: 404 }), probe({ status: 404 })];
    const result = classifyHealthStatus(probes, "https://example.com/gone");
    expect(result.healthStatus).toBe("broken");
  });

  it("never marks an intermittent 404 as broken", () => {
    const probes = [probe({ status: 500 }), probe({ status: 404 }), probe({ status: 404 })];
    expect(classifyHealthStatus(probes, "https://example.com/unstable").healthStatus)
      .toBe("needs_review");
  });

  it("never marks mixed 4xx or 5xx responses as permanently broken", () => {
    const mixed4xx = [probe({ status: 400 }), probe({ status: 404 }), probe({ status: 400 })];
    const mixed5xx = [probe({ status: 500 }), probe({ status: 503 }), probe({ status: 500 })];
    expect(classifyHealthStatus(mixed4xx, "https://example.com/").healthStatus)
      .toBe("needs_review");
    expect(classifyHealthStatus(mixed5xx, "https://example.com/").healthStatus)
      .toBe("needs_review");
  });

  it("never marks a timeout followed by 404s as broken", () => {
    const probes = [probe({ networkCode: "ETIMEDOUT" }), probe({ status: 404 }), probe({ status: 404 })];
    expect(classifyHealthStatus(probes, "https://example.com/").healthStatus)
      .toBe("needs_review");
  });

  it("marks repeated timeouts as needs_review, never dead", () => {
    const probes = [
      probe({ networkCode: "ETIMEDOUT" }),
      probe({ networkCode: "ECONNABORTED" }),
      probe({ networkCode: "ETIMEDOUT" }),
    ];
    const result = classifyHealthStatus(probes, "https://slow.example/");
    expect(result.healthStatus).toBe("needs_review");
  });

  it("marks consistent 500s as broken only after all retries agree", () => {
    const probes = [probe({ status: 500 }), probe({ status: 500 }), probe({ status: 500 })];
    expect(classifyHealthStatus(probes, "https://example.com/").healthStatus).toBe("broken");
  });
});
