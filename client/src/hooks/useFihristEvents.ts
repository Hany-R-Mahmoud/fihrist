import { useEffect } from "react";

type FihristEvent = {
  type: "bookmark.updated" | "health.updated" | "aiTags.updated" | "digest.updated";
  /** Absent for events that are not about one bookmark (a new link report). */
  bookmarkId?: number;
  at: string;
};

const EVENT_TYPES: FihristEvent["type"][] = [
  "bookmark.updated",
  "health.updated",
  "aiTags.updated",
  "digest.updated",
];

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
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, forwardEvent);
    }
    return () => {
      for (const type of EVENT_TYPES) {
        source.removeEventListener(type, forwardEvent);
      }
      source.close();
    };
  }, [onEvent]);
}
