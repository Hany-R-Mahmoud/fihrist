import { db } from "../data.js";
import { deriveTopicShelves } from "../../shared/topicGrouping.js";
export { deriveTopicShelves } from "../../shared/topicGrouping.js";
export type { TopicCandidate, ShelfInput } from "../../shared/topicGrouping.js";

export function shelfReason(normalizedName: string, locale: "ar" | "en") {
  if (normalizedName.startsWith("topic:host:"))
    return locale === "ar"
      ? "اتجمعت لأنها من نفس الموقع"
      : "Grouped because they're from the same site";
  if (normalizedName.startsWith("topic:keyword:"))
    return locale === "ar"
      ? "اتجمعت لأن مواضيعها عن " + normalizedName.slice(14)
      : "Grouped by topic: " + normalizedName.slice(14);
  const terms = normalizedName.slice("topic:shared:".length).replace(":", ", ");
  return locale === "ar"
    ? "اتجمعت لأنها بتشارك وسوم " + terms
    : "Grouped by shared tags: " + terms;
}

export async function refreshTopicShelves(userId: number) {
  // Reads only fields already stored; no AI/network calls or collection updates.
  const items = await db.listBookmarks(userId, {}, 10000);
  const shelves = deriveTopicShelves(
    items.map(b => ({
      id: b.id,
      host: b.host,
      title: b.title,
      description: b.description,
      contentText: b.contentText,
      collectionId: b.collectionId,
      tags: b.tags,
    }))
  );
  await db.replaceTopicLinks(userId, shelves);
  return shelves.length;
}

export async function listTopicShelves(userId: number) {
  const [links, bookmarks] = await Promise.all([
    db.listTopicLinks(userId),
    db.listBookmarks(userId, {}, 10000),
  ]);
  const byId = new Map(bookmarks.map(b => [b.id, b]));
  const shelves = new Map<
    number,
    {
      id: number;
      name: string;
      normalizedName: string;
      bookmarks: typeof bookmarks;
    }
  >();
  for (const link of links) {
    const bookmark = byId.get(link.bookmarkId);
    if (!bookmark) continue;
    let shelf = shelves.get(link.id);
    if (!shelf) {
      shelf = {
        id: link.id,
        name: link.name,
        normalizedName: link.normalizedName,
        bookmarks: [],
      };
      shelves.set(link.id, shelf);
    }
    shelf.bookmarks.push(bookmark);
  }
  for (const shelf of shelves.values())
    shelf.bookmarks.sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id - a.id
    );
  return [...shelves.values()]
    .filter(s => s.bookmarks.length >= 1)
    .sort(
      (a, b) =>
        b.bookmarks.length - a.bookmarks.length || a.name.localeCompare(b.name)
    );
}
