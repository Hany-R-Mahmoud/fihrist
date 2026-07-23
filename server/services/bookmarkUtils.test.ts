import { describe, expect, it } from "vitest";
import {
  detectContentDirection,
  normalizeBookmarkUrl,
  parseNetscapeBookmarks,
  suggestAutomaticTags,
} from "./bookmarkUtils";
import { exportNetscapeBookmarks } from "./bookmarkExport";

describe("bookmarkUtils", () => {
  it("normalizes supported bookmark URLs and drops fragments", () => {
    expect(normalizeBookmarkUrl(" HTTPS://Example.COM:443/Guide#section ")).toEqual({
      url: "HTTPS://Example.COM:443/Guide#section",
      normalizedUrl: "https://example.com/Guide",
      normalizedUrlHash: "585542f11c127b7f378ac14f77484d7f350e4634cf90080a229e2c4cc1329ae8",
      host: "example.com",
    });
    expect(() => normalizeBookmarkUrl("ftp://example.com/file")).toThrow("Only HTTP and HTTPS");
    expect(() => normalizeBookmarkUrl("https://user:password@example.com/file")).toThrow(
      "embedded credentials"
    );
  });

  it("detects Arabic and Hebrew content direction without changing Latin content", () => {
    expect(detectContentDirection("مرحبا بكم في فهرست")).toBe("rtl");
    expect(detectContentDirection("ברוכים הבאים לפהריסט")).toBe("rtl");
    expect(detectContentDirection("A library of useful links")).toBe("ltr");
  });

  it("suggests domain and topic tags from retrieved page information", () => {
    expect(
      suggestAutomaticTags({
        url: "https://github.com/example/project",
        title: "TypeScript API security guide",
        description: "A practical developer reference for secure software APIs.",
      })
    ).toEqual(expect.arrayContaining(["github", "development", "security"]));
  });

  it("imports nested Netscape bookmark folders as collection paths", () => {
    const imported = parseNetscapeBookmarks(`
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>Research</H3>
        <DL><p>
          <DT><H3>Papers</H3>
          <DL><p>
            <DT><A HREF="https://arxiv.org/abs/1234">A research paper</A>
          </DL><p>
        </DL><p>
        <DT><A HREF="https://developer.mozilla.org/en-US/">MDN</A>
      </DL><p>
    `);

    expect(imported).toEqual(
      expect.arrayContaining([
        {
          url: "https://arxiv.org/abs/1234",
          title: "A research paper",
          collectionPath: ["Research", "Papers"],
        },
        {
          url: "https://developer.mozilla.org/en-US/",
          title: "MDN",
          collectionPath: [],
        },
      ])
    );
    expect(imported).toHaveLength(2);
  });

  it("caps bookmark imports before creating an unbounded result set", () => {
    const html = Array.from(
      { length: 1_001 },
      (_, index) => `<DT><A HREF="https://example.com/${index}">Link ${index}</A>`
    ).join("");
    expect(parseNetscapeBookmarks(`<DL>${html}</DL>`)).toHaveLength(1_000);
  });

  it("exports collections and uncategorized links as browser-compatible HTML", () => {
    const exported = exportNetscapeBookmarks([
      {
        url: "https://example.com/read?one=1&two=2",
        title: "A <Guide>",
        collectionName: "Research",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        url: "https://example.org/loose",
        title: null,
        collectionName: null,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    ]);

    expect(exported).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(exported).toContain("<H3>Research</H3>");
    expect(exported).toContain("<H3>Uncategorized</H3>");
    expect(exported).toContain('HREF="https://example.com/read?one=1&amp;two=2"');
    expect(exported).toContain("A &lt;Guide&gt;");
    expect(exported).toContain(">example.org<");
  });
});
