/* Shared popup/context-menu path. Never stores an account token. */
async function fihristCall(base, path, { method = "GET", input } = {}) {
  const origin = new URL(base).origin;
  if (origin === "https://fihristy.vercel.app") {
    const tabs = await chrome.tabs.query({ url: origin + "/*" });
    if (!tabs.length)
      throw new Error("Open Fihrist and sign in / افتح فهرست وسجّل دخول");
    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      type: "fihrist-call",
      path,
      input,
    });
    if (!response?.ok)
      throw new Error(response?.error || "Sign in first / سجّل دخول الأول");
    return response.data;
  }
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error(
      "Choose Fihrist cloud or localhost / اختار فهرست السحابي أو المحلي"
    );
  const url = new URL(base + "/api/trpc/" + path);
  const init = { method, headers: { "content-type": "application/json" } };
  if (method === "GET")
    url.searchParams.set("input", JSON.stringify({ json: input ?? null }));
  else init.body = JSON.stringify({ json: input ?? null });
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok || payload.error)
    throw new Error(
      payload.error?.json?.message || "Could not connect / تعذّر الاتصال"
    );
  return payload.result?.data?.json ?? payload.result?.data;
}
