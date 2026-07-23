export type NetscapeExportBookmark = {
  readonly url: string;
  readonly title: string | null;
  readonly collectionName: string | null;
  readonly createdAt: Date;
};

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => HTML_ENTITIES[character] ?? character);
}

export function exportNetscapeBookmarks(bookmarks: readonly NetscapeExportBookmark[]) {
  const groups = new Map<string, NetscapeExportBookmark[]>();
  for (const bookmark of bookmarks) {
    const collectionName = bookmark.collectionName?.trim() || "Uncategorized";
    const group = groups.get(collectionName) ?? [];
    group.push(bookmark);
    groups.set(collectionName, group);
  }

  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Fihrist Bookmarks</TITLE>",
    "<H1>Fihrist Bookmarks</H1>",
    "<DL><p>",
  ];
  for (const [collectionName, collectionBookmarks] of Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`    <DT><H3>${escapeHtml(collectionName)}</H3>`, "    <DL><p>");
    for (const bookmark of collectionBookmarks) {
      const title = bookmark.title?.trim() || new URL(bookmark.url).hostname;
      const addedAt = Math.floor(bookmark.createdAt.getTime() / 1000);
      lines.push(`        <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${addedAt}">${escapeHtml(title)}</A>`);
    }
    lines.push("    </DL><p>");
  }
  lines.push("</DL><p>");
  return `${lines.join("\n")}\n`;
}
