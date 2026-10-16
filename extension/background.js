// Fihrist extension service worker. Currently a no-op placeholder: all work
// happens in the popup. Kept so future background features (e.g. context-menu
// "Save to Fihrist", periodic sync) have a home without re-permissioning.
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Fihrist] extension installed");
});
