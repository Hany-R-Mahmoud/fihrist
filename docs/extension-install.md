# Fihrist Chrome extension — install guide
# إضافة Fihrist لكروم — دليل التثبيت

The extension is **unpacked** (no Chrome Web Store). One click saves the current
tab to your Fihrist library; the popup searches your library without leaving the tab.

الإضافة **غير منشورة على المتجر** — تتسطب يدويًا. ضغطة واحدة تحفظ التبويب الحالي
في مكتبتك، والـ popup يبحث في المكتبة من غير ما تسيب التبويب.

## 1. Allow the extension origin (server side) — السماح للإضافة (من ناحية السيرفر)

The Fihrist server blocks cross-origin POSTs. Allowlist your extension:

1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked** → select the `extension/` folder in this repo.
3. Copy the extension **ID** shown under its name (or open the extension's
   **Server settings** page — the ID is displayed there).
4. In your Fihrist `.env` (or environment), set:
   ```
   FIHRIST_EXTENSION_ORIGINS=chrome-extension://PASTE_ID_HERE
   ```
   (Comma-separated if you ever run more than one.)
5. Restart the Fihrist server (`pnpm run dev`).

## 2. Point the extension at your server — توجيه الإضافة للسيرفر

Open the extension's **Server settings** (link at the bottom of the popup) and
set the address (default `http://localhost:3000`).

## 3. Use it — الاستخدام

- Click the Fihrist toolbar button → **Save this tab**.
- Type in the search box (2+ letters) → results from your library; click to open.
- Saving runs the normal ingestion pipeline: metadata extraction, tag
  suggestions, health check — same as saving from the web UI.

## Permissions — الأذونات

- `activeTab` — read the current tab's URL only when you click Save.
- `storage` — remember your server address.
- Host access to `localhost` / `127.0.0.1` — talk to your Fihrist server.
  Nothing else. No data leaves your machine.

## V2: true two-way Chrome bookmark-tree sync — المزامنة الكاملة (مستقبلًا)

**Not built in V1, honestly documented.** A real bi-directional sync with
Chrome's native bookmark tree (`chrome.bookmarks` API) needs:

1. **Change detection** — the `chrome.bookmarks` API has no reliable
   change-stream; polling the whole tree is slow and racy.
2. **Conflict resolution** — same URL edited on both sides needs merge rules
   (last-write-wins? field-level merge? user prompts?). That is a design of its
   own, not a weekend flag.
3. **Identity mapping** — matching Chrome bookmark nodes to Fihrist rows across
   reinstalls needs a stable ID store on both sides.

V1 gives you the daily workflow (save + search). Full tree sync stays a
documented V2.
