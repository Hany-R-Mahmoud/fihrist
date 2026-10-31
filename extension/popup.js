/* Fihrist Chrome extension — popup logic.
 * Talks to the Fihrist server's tRPC HTTP API directly (no new auth: the local
 * server trusts local requests; the extension origin must be allowlisted via
 * FIHRIST_EXTENSION_ORIGINS — see docs/extension-install.md).
 */

const DEFAULT_SERVER = "https://fihristy.vercel.app";

async function serverBase() {
  const { fihristServer } = await chrome.storage.sync.get({
    fihristServer: DEFAULT_SERVER,
  });
  return String(fihristServer).replace(/\/+$/, "");
}

/** Unwrap a tRPC+superjson HTTP response. Throws with a readable message. */
async function trpcCall(base, path, { method = "GET", input } = {}) {
  return fihristCall(base, path, { method, input });
}

function setMsg(text, kind) {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.className = `msg ${kind ?? ""}`;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function saveCurrentTab() {
  const btn = document.getElementById("saveBtn");
  btn.disabled = true;
  setMsg("Saving… / بنحفظ…", "");
  try {
    const tab = await currentTab();
    if (!tab?.url || !/^https?:/.test(tab.url)) {
      throw new Error(
        "This tab has no savable web address / الصفحة دي ملهاش رابط قابل للحفظ"
      );
    }
    const base = await serverBase();
    await trpcCall(base, "bookmarks.add", {
      method: "POST",
      input: { url: tab.url },
    });
    setMsg("Saved to Fihrist ✓ / اتحفظ في فهرست", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMsg(
      message.includes("already saved") || message.includes("CONFLICT")
        ? "Already in your library / موجود في مكتبتك"
        : message,
      "err"
    );
  } finally {
    btn.disabled = false;
  }
}

let searchTimer = null;
async function runSearch() {
  const q = document.getElementById("q").value.trim();
  const list = document.getElementById("results");
  list.innerHTML = "";
  if (q.length < 2) return;
  try {
    const base = await serverBase();
    const page = await trpcCall(base, "bookmarks.search", {
      input: { query: q, limit: 10 },
    });
    const items = page?.items ?? [];
    if (!items.length) {
      list.innerHTML =
        "<li><span class='u'>No matches / مفيش نتائج</span></li>";
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = item.title || item.url;
      if (item.contentDirection === "rtl") t.dir = "rtl";
      const u = document.createElement("div");
      u.className = "u";
      u.textContent = item.url;
      a.append(t, u);
      li.append(a);
      list.append(li);
    }
  } catch (error) {
    setMsg(error instanceof Error ? error.message : String(error), "err");
  }
}

document.getElementById("saveBtn").addEventListener("click", saveCurrentTab);
document.getElementById("signInBtn").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    fihristServer: "https://fihristy.vercel.app",
  });
  await chrome.tabs.create({ url: "https://fihristy.vercel.app/sign-in" });
});
document.getElementById("q").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

// TOKEN_POLICY_BATCHED_EXECUTION: make account state and context-menu failures visible.
(async () => {
  const state = await chrome.storage.session.get("lastSaveError");
  if (state.lastSaveError) setMsg(state.lastSaveError, "err");
  try {
    const user = await trpcCall(await serverBase(), "auth.me");
    if (!user)
      setMsg("Sign in to save and search / سجّل دخول للحفظ والبحث", "err");
    else if (!state.lastSaveError)
      setMsg("Connected to your library / متصل بمكتبتك", "ok");
  } catch (error) {
    setMsg(
      error instanceof Error
        ? error.message
        : "Sign in first / سجّل دخول الأول",
      "err"
    );
  }
})();
