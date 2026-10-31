export function duplicateUrl(raw: string) {
  const url = new URL(raw);
  for (const key of Array.from(url.searchParams.keys()))
    if (
      /^utm_/i.test(key) ||
      ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
    )
      url.searchParams.delete(key);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.searchParams.sort();
  return url.toString();
}
function similarity(a: string | null, b: string | null, min = 1) {
  const words = (text: string | null) =>
    new Set((text ?? "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const x = words(a),
    y = words(b);
  if (x.size < min || y.size < min) return 0;
  const common = Array.from(x).filter(w => y.has(w)).length;
  return common / (x.size + y.size - common);
}

export function candidateGroups<
  T extends {
    id: number;
    url: string;
    host: string;
    title: string | null;
    contentText: string | null;
    createdAt: Date;
  },
>(rows: T[]) {
  const parent = rows.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  const evidence = new Map<number, string>();
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j];
      if (a.host !== b.host) continue;
      const exact = duplicateUrl(a.url) === duplicateUrl(b.url);
      const title = similarity(a.title, b.title) >= 0.8;
      const content =
        similarity(
          a.contentText?.slice(0, 4000) ?? null,
          b.contentText?.slice(0, 4000) ?? null,
          10
        ) >= 0.9;
      if (exact || title || content) {
        const x = root(i),
          y = root(j);
        parent[y] = x;
        evidence.set(
          i,
          exact ? "same-url" : title ? "similar-title" : "similar-content"
        );
        evidence.set(j, evidence.get(i)!);
      }
    }
  const groups = new Map<number, typeof rows>();
  rows.forEach((row, i) => {
    const key = root(i);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  return Array.from(groups.values())
    .filter(g => g.length > 1)
    .map(items => ({
      items: items.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id
      ),
      evidence: Array.from(
        new Set(
          items.map(item => evidence.get(rows.indexOf(item))).filter(Boolean)
        )
      ),
    }));
}
