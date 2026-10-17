import { useEffect } from "react";

type FihristEvent = {
  type: "bookmark.updated" | "health.updated" | "aiTags.updated";
  bookmarkId: number;
  at: string;
};

export function useFihristEvents(onEvent: (event: FihristEvent) => void) {
  useEffect(() => {
    // Native EventSource cannot send a Neon Bearer token; no unauthenticated SSE.
    if (import.meta.env.VITE_FIHRIST_MODE === "cloud") return;
    const source = new EventSource("/api/events/fihrist", { withCredentials: true });
    const forwardEvent = (event: Event) => {
      try {
        onEvent(JSON.parse((event as MessageEvent<string>).data) as FihristEvent);
      } catch {
        // Malformed event payloads must not interrupt the live connection.
      }
    };
    source.addEventListener("bookmark.updated", forwardEvent);
    source.addEventListener("health.updated", forwardEvent);
    source.addEventListener("aiTags.updated", forwardEvent);
    return () => {
      source.removeEventListener("bookmark.updated", forwardEvent);
      source.removeEventListener("health.updated", forwardEvent);
      source.removeEventListener("aiTags.updated", forwardEvent);
      source.close();
    };
  }, [onEvent]);
}
