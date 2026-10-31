// TOKEN_POLICY_BATCHED_EXECUTION: exercise the shared transport without installing an extension.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { it, expect, vi } from "vitest";
const source = readFileSync("extension/api.js", "utf8");
function transport(tabs: unknown[], response: unknown) {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ result: { data: { json: { items: [{ id: 1 }] } } } }),
  }));
  const chrome = {
    tabs: {
      query: vi.fn(async () => tabs),
      sendMessage: vi.fn(async () => response),
    },
  };
  const call = runInNewContext(source + ";fihristCall", { URL, fetch, chrome });
  return { call, fetch, chrome };
}
it("uses only the app session for cloud save/search and fails clearly when signed out", async () => {
  const t = transport([{ id: 42 }], { ok: true, data: { id: 7 } });
  expect(
    await t.call("https://fihristy.vercel.app", "bookmarks.add", {
      method: "POST",
      input: { url: "https://example.org" },
    })
  ).toEqual({ id: 7 });
  expect(t.chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
    type: "fihrist-call",
    path: "bookmarks.add",
    input: { url: "https://example.org" },
  });
  expect(t.fetch).not.toHaveBeenCalled();
  await t.call("https://fihristy.vercel.app", "bookmarks.search", {
    input: { query: "reading" },
  });
  expect(t.chrome.tabs.sendMessage).toHaveBeenLastCalledWith(42, {
    type: "fihrist-call",
    path: "bookmarks.search",
    input: { query: "reading" },
  });
  await expect(
    transport([], { ok: true }).call("https://fihristy.vercel.app", "auth.me")
  ).rejects.toThrow("sign in");
  await expect(
    transport([{ id: 42 }], { ok: false, error: "Sign in first" }).call(
      "https://fihristy.vercel.app",
      "bookmarks.add"
    )
  ).rejects.toThrow("Sign in first");
});
it("keeps local HTTP transport and refuses an unexpected host", async () => {
  const t = transport([], null);
  expect(
    await t.call("http://localhost:3000", "bookmarks.search", {
      input: { query: "read" },
    })
  ).toMatchObject({ items: [{ id: 1 }] });
  expect(t.fetch).toHaveBeenCalledTimes(1);
  expect(t.chrome.tabs.query).not.toHaveBeenCalled();
  await expect(t.call("https://unexpected.example", "auth.me")).rejects.toThrow(
    "Choose Fihrist"
  );
});
