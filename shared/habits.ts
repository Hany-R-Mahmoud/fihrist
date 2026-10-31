export function habitsFacts<
  T extends {
    id: number;
    createdAt: Date;
    readingStatus?: string;
    tags: { name: string }[];
  },
>(bookmarks: T[], now = new Date()) {
  const week = new Date(now);
  week.setUTCHours(0, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const counts = { unread: 0, reading: 0, read: 0, archived: 0 };
  const tags = new Map<string, number>();
  for (const b of bookmarks) {
    counts[(b.readingStatus ?? "unread") as keyof typeof counts]++;
    for (const t of b.tags) tags.set(t.name, (tags.get(t.name) ?? 0) + 1);
  }
  return {
    week: week.toISOString(),
    added: bookmarks.filter(b => b.createdAt >= week && b.createdAt <= now)
      .length,
    counts,
    tags: Array.from(tags, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5),
    unread: bookmarks
      .filter(b => (b.readingStatus ?? "unread") === "unread")
      .sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id
      )
      .slice(0, 5),
  };
}
