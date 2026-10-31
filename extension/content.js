chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || request?.type !== "fihrist-call")
    return;
  const id = crypto.randomUUID();
  const finish = result => {
    clearTimeout(timer);
    window.removeEventListener("message", receive);
    sendResponse(result);
  };
  const receive = event => {
    if (
      event.source === window &&
      event.origin === location.origin &&
      event.data?.type === "fihrist-extension-response" &&
      event.data.id === id
    )
      finish(event.data);
  };
  const timer = setTimeout(
    () =>
      finish({
        ok: false,
        error: "Open Fihrist and sign in / افتح فهرست وسجّل دخول",
      }),
    15000
  );
  window.addEventListener("message", receive);
  window.postMessage(
    {
      type: "fihrist-extension-request",
      id,
      path: request.path,
      input: request.input,
    },
    location.origin
  );
  return true;
});
