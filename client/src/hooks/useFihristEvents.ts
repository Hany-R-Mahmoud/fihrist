import { useEffect } from "react";

type FihristEvent = {
  type: "bookmark.updated" | "health.updated";
  bookmarkId: number;
  at: string;
};

export function useFihristEvents(onEvent: (event: FihristEvent) => void) {
  useEffect(() => {
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
    return () => {
      source.removeEventListener("bookmark.updated", forwardEvent);
      source.removeEventListener("health.updated", forwardEvent);
      source.close();
    };
  }, [onEvent]);
}
