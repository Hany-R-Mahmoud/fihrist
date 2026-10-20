import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink } from "@trpc/client";
import { guestLink, isGuestMode } from "./lib/guestLibrary";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { cloudMode, cloudAuthorizationHeaders } from "./lib/neonAuth";
import "./index.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: () => cloudMode && isGuestMode(),
      true: guestLink,
      false: httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers: cloudAuthorizationHeaders,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
      }),
    }),
  ],
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Fihrist root element is missing");

createRoot(rootElement).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Register only on secure production contexts. Static shell only, no API caching.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(error => {
      console.warn("[Fihrist] Offline shell unavailable", error);
    });
  });
}
