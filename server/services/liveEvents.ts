export type FihristEvent = {
  type: "bookmark.updated" | "health.updated";
  userId: number;
  bookmarkId: number;
  at: string;
};

type Listener = (event: FihristEvent) => void;

const listenersByUser = new Map<number, Set<Listener>>();

export function publishFihristEvent(event: Omit<FihristEvent, "at">) {
  const enrichedEvent: FihristEvent = { ...event, at: new Date().toISOString() };
  const listeners = listenersByUser.get(enrichedEvent.userId);
  if (!listeners) return;
  for (const listener of Array.from(listeners)) listener(enrichedEvent);
}

export function subscribeToFihristEvents(userId: number, listener: Listener) {
  const listeners = listenersByUser.get(userId) ?? new Set<Listener>();
  listeners.add(listener);
  listenersByUser.set(userId, listeners);
  return () => {
    const current = listenersByUser.get(userId);
    if (!current) return;
    current.delete(listener);
    if (!current.size) listenersByUser.delete(userId);
  };
}
