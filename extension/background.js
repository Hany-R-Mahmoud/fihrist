// Fihrist context-menu worker uses the same transport as the popup.
importScripts("api.js");
// TOKEN_POLICY_BATCHED_EXECUTION: preserve configured local servers on upgrade.
chrome.runtime.onInstalled.addListener(async details => {
  chrome.contextMenus.create({
    id: "save-fihrist",
    title: "Save to Fihrist / احفظ في فهرست",
    contexts: ["page", "link"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  const settings = await chrome.storage.sync.get("fihristServer");
  if (details.reason === "install" && !settings.fihristServer) {
    await chrome.storage.sync.set({
      fihristServer: "https://fihristy.vercel.app",
    });
    await chrome.tabs.create({ url: "https://fihristy.vercel.app/sign-in" });
  }
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-fihrist") return;
  try {
    const { fihristServer } = await chrome.storage.sync.get({
      fihristServer: "https://fihristy.vercel.app",
    });
    await fihristCall(
      String(fihristServer).replace(/\/+$/, ""),
      "bookmarks.add",
      { method: "POST", input: { url: info.linkUrl || tab?.url } }
    );
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.storage.session.set({ lastSaveError: null });
  } catch (error) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.storage.session.set({
      lastSaveError: error instanceof Error ? error.message : String(error),
    });
  }
});
