import { useEffect } from "react";
import { cloudAuthorizationHeaders } from "@/lib/neonAuth";
import { isGuestMode } from "@/lib/guestLibrary";

/** Fixed operations only; credentials remain inside the app origin. */
export function ExtensionBridge() {
  useEffect(() => {
    const handle = async (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.type !== "fihrist-extension-request"
      )
        return;
      const { id, path, input } = event.data;
      if (
        typeof id !== "string" ||
        !["auth.me", "bookmarks.add", "bookmarks.search"].includes(path)
      )
        return;
      let result;
      try {
        if (isGuestMode())
          throw new Error(
            "Sign in to your account first / سجّل دخول لحسابك الأول"
          );
        const headers = {
          "content-type": "application/json",
          ...(await cloudAuthorizationHeaders()),
        };
        const identity = await fetch(
          "/api/trpc/auth.me?input=" +
            encodeURIComponent(JSON.stringify({ json: null })),
          { credentials: "include", headers }
        );
        const user = await identity.json();
        if (!identity.ok || !user?.result?.data?.json)
          throw new Error(
            "Sign in to your account first / سجّل دخول لحسابك الأول"
          );
        const method = path === "bookmarks.add" ? "POST" : "GET";
        const safeInput =
          path === "bookmarks.add"
            ? {
                url:
                  typeof input?.url === "string"
                    ? input.url.slice(0, 2048)
                    : "",
              }
            : path === "bookmarks.search"
              ? {
                  query:
                    typeof input?.query === "string"
                      ? input.query.slice(0, 300)
                      : "",
                  limit: 10,
                }
              : null;
        const url = new URL("/api/trpc/" + path, window.location.origin);
        if (method === "GET")
          url.searchParams.set("input", JSON.stringify({ json: safeInput }));
        const response = await fetch(url, {
          method,
          credentials: "include",
          headers,
          ...(method === "POST"
            ? { body: JSON.stringify({ json: safeInput }) }
            : {}),
        });
        const payload = await response.json();
        if (!response.ok || payload.error)
          throw new Error(
            payload.error?.json?.message || "Request failed / الطلب ماكملش"
          );
        result = {
          ok: true,
          data: payload.result.data?.json ?? payload.result.data,
        };
      } catch (error) {
        result = {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Request failed / الطلب ماكملش",
        };
      }
      window.postMessage(
        { type: "fihrist-extension-response", id, ...result },
        window.location.origin
      );
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);
  return null;
}
