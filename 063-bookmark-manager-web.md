id: "063"
source_collection: "100-ai-prompts"
source_id: "none"
title: "Bookmark Manager"
brand: "Fihrist"
category: "Productivity"
platform: "web"
difficulty: "builder"
capabilities: "auth, scraping, full-text-search, rtl, background-jobs"
regulated_domain: "none"

Build `Fihrist` — Smart Bookmark Manager with Auto-Tagging & Dead Link Detection

You are the product manager, UX designer, software architect, full-stack or native engineer, database engineer, QA engineer, security reviewer, accessibility reviewer, and technical writer for this project.
Build the product end to end. Produce a real, locally runnable implementation. Read the complete specification, choose sensible reversible defaults, and ask at most one question only when a missing decision genuinely blocks the core build.

### 1. Product overview
Product name: `Fihrist` (Arabic for "Index" or "Directory")
Product type: Web app
Difficulty: builder
Category: Productivity
Concept: Developers, researchers, and content curators hoard hundreds of links, but standard browser bookmarks lack searchability, tagging, and metadata extraction. Furthermore, over time, these collections become graveyards of 404 dead links. `Fihrist` is a self-hosted or local-first web bookmark manager that automatically fetches OpenGraph metadata, generates favicons, caches a text snapshot for full-text search, and runs a background cron job to flag dead links. It fully supports RTL rendering for Arabic articles and tags.
Problem being solved: Knowledge workers lose track of valuable resources because browser bookmarks are unsearchable, lack visual context, and degrade over time as URLs break or change ownership.
Proposed solution: A web dashboard where users paste URLs. A background worker scrapes the title, description, and image, caches a plain-text version of the page for deep searching, and periodically pings the URL to verify it's still alive.
Primary users: Developers, researchers, and digital marketers.
Primary success outcome: A user pastes a link to an Arabic tech blog, and the app instantly extracts the RTL title, tags it automatically based on the content, and makes it searchable by the article's body text months later.

### 3. Scope and product-specific contract
Builder tier. Multi-screen app with real persistence, background scraping jobs, and full-text search. Standard test coverage.

**Functional contract**
The user logs in and pastes a URL (or bulk-imports via a Netscape HTML bookmark export). The app creates a "Pending" record and queues a background job. The worker fetches the URL, extracts OpenGraph/Twitter card metadata, downloads the favicon, and parses the main article text. The UI updates in real-time via WebSockets/SSE. The user can organize bookmarks into collections and tags. A "Health" dashboard shows links that have returned 404/500 errors during the weekly background health check.

**Required capabilities**
- URL Ingestion & Parsing — Accepts single URLs or Netscape bookmark HTML exports.
- Metadata Scraper — Extracts Title, Description, OG Image, and Favicon.
- Text Caching & FTS — Strips HTML to plain text and indexes it for Full-Text Search (FTS).
- Dead Link Checker — A scheduled background job that pings saved URLs and flags broken ones.
- RTL Metadata Support — Correctly parses and displays Arabic titles and descriptions without mangling encoding (UTF-8).

**Business rules and invariants**
- Scraping must respect `robots.txt` where applicable, and must timeout after 10 seconds to prevent worker thread blocking.
- If a site blocks the scraper (403 Forbidden), the app must fallback to using the raw URL as the title and mark the metadata as "Incomplete".
- Dead link checks must use a `HEAD` request first to save bandwidth, falling back to `GET` only if `HEAD` is blocked by the server.

**Explicit non-goals**
- Browser extension (strictly a web dashboard for this MVP).
- AI-based auto-summarization (rely on the site's native meta description).

### 4. Recommended technology and portability
Next.js 14 (App Router), TypeScript 5, Tailwind CSS 3, shadcn/ui, Prisma 5, PostgreSQL (using `tsvector` for Full-Text Search), `bullmq` (Redis-backed queue for scraping), `cheerio` (for HTML parsing), `socket.io` or native SSE.

### 9. Data model
- User (id, email)
- Bookmark (id UUID, userId FK, url TEXT UNIQUE, title TEXT, description TEXT, faviconUrl STRING, ogImage STRING, contentText TEXT, statusCode INT, lastCheckedAt TIMESTAMP, isDead BOOLEAN)
- Tag (id, userId FK, name TEXT)
- BookmarkTag (bookmarkId FK, tagId FK)
- Collection (id, userId FK, name TEXT)

### 10. Backend, APIs, authentication, jobs, and files
- Background Jobs: The scraping and health-check jobs must be isolated in workers. Scraping external URLs is a prime vector for SSRF (Server-Side Request Forgery). 
- **Security Boundary:** The scraper must validate that the target URL resolves to a public IP address, strictly blocking requests to `127.0.0.1`, `localhost`, `169.254.169.254` (AWS metadata), and private LAN subnets.

### 14. Accessibility and localization
Full RTL support required. When a bookmark's title or description is detected as Arabic, the UI card must automatically apply `dir="rtl"` and `text-align: right` to that specific card, while the rest of the dashboard remains LTR.

### 16. Testing and verification
- Security test: The SSRF protection correctly rejects an attempt to scrape `http://169.254.169.254/latest/meta-data/`.
- Integration test: Importing a Netscape HTML file correctly parses the nested folders and creates corresponding Collections and Bookmarks.
- Logic test: The FTS engine successfully finds a bookmark when searching for a word that only appears deep in the cached `contentText`.

### 19. Definition of done
All standard builder checkboxes apply. The background scraper must process a queue of 50 URLs without timing out, and the SSRF protections must be mathematically verified.

Start now.

## Current Project Review — 2026-07-23

### Executive summary

- **Overall state:** Strong local-first MVP foundation; not production-ready at current scale.
- **Review verdict:** **FAIL release gate**. Typecheck/tests/build pass, but core background processing, search scalability, failure recovery, security hardening, and accessibility gaps remain.
- **Best current fit:** Single-user/local development, small libraries, trusted machine, one app process.
- **Main risk:** The product looks complete on the happy path while important work is request-coupled, unbounded, or silently stuck.
- **Current local evidence:** `/library` loaded **654 bookmarks**, with **652 scrape jobs pending** and a rendered document around **125k px desktop / 248k px mobile**.
- **Design quality:** Distinctive forest/paper identity, clear landing hierarchy, useful health states; authenticated workspace needs accessibility and scale hardening.

### Project structure

- **Client shell:** `client/src/App.tsx`
  - `/` → public landing page.
  - `/library` → authenticated bookmark workspace.
  - `/404` and fallback → not-found screen.
  - Global error boundary, theme provider, Radix/shadcn-style primitives, tRPC/React Query.
- **Public experience:** `client/src/pages/Landing.tsx`, `client/src/pages/landing.css`
  - Marketing narrative, library preview, collections section, link-health section, repeated library CTA.
- **Workspace:** `client/src/pages/Home.tsx`
  - All links, search, collections, health, add/import/export, notes, tags, bulk actions, AI insight, destructive confirmations.
- **Responsive/auth shell:** `client/src/components/DashboardLayout.tsx`
  - Local/OAuth auth gate, desktop sidebar, mobile drawer, theme toggle, import/export, logout.
- **Client updates:** `client/src/hooks/useFihristEvents.ts`
  - SSE subscription; invalidates workspace queries after bookmark/health events.
- **API:** `server/routers.ts`
  - Protected tRPC procedures for auth, bookmarks, collections, tags, search, analysis, health, import/export.
- **Persistence:** `server/db.ts`, `drizzle/schema.ts`
  - MySQL/Drizzle user, bookmark, tag, collection, job, and health-settings tables.
- **External URL handling:** `server/services/linkSafety.ts`
  - URL normalization, DNS/IP checks, robots check, metadata extraction, redirect handling, health checks.
- **Job execution:** `server/services/jobProcessor.ts`
  - Scrape and health job claim/process/update flow; runs inside request handlers.
- **Live events:** `server/services/liveEvents.ts`
  - In-memory per-user listener map; single-process only.
- **Local runtime:** `scripts/dev.ts`, `server/_core/localAuth.ts`
  - Starts Docker MySQL, applies migrations, uses fixed local admin identity when not production/OAuth.
- **Unused/template residue:** `ComponentShowcase.tsx`, `AIChatBox.tsx`, `Map.tsx`, `ManusDialog.tsx`, `server/_core/map.ts`, `voiceTranscription.ts`, `imageGeneration.ts`, `dataApi.ts`.

### Current features

- **Implemented:**
  - Local authentication and Manus OAuth boundary.
  - Single HTTP(S) bookmark ingestion.
  - Netscape HTML import/export with nested folder → collection mapping.
  - Title, description, favicon URL, OG image URL, language, RTL direction, and cached text extraction.
  - Automatic topic/domain tags plus manual tags.
  - Collections, bookmark movement, notes, delete, bulk move/tag/delete.
  - Search across title, description, notes, cached text, host, and tags.
  - HEAD-first link health with GET fallback, redirects, weekly scheduling integration.
  - Authenticated SSE refresh events.
  - Light/dark theme, responsive shell, empty states, loading states, confirmation dialogs.
  - AI bookmark summary/saved-reason/benefit enhancement with structured output validation.
- **Explicit non-goal drift:** AI analysis is now shipped even though original spec marks AI summarization as a non-goal. Decide whether this is intentional product scope.
- **Not implemented as specified:** Durable isolated worker, Redis/BullMQ queue, database-native FTS, downloaded favicon asset, historical health timeline, distributed event broker, multi-device/Supabase presence.
- **Intentionally absent:** Browser extension; no need to add unless MVP scope changes.

### Main user flows

- **Add bookmark:** UI submits URL → public-target validation/DNS lookup → bookmark row → scrape job → client manually processes a small batch → metadata/tags/AI/health updates → SSE invalidation.
- **Import:** FileReader reads local HTML → server parses/caps entries → creates collections/bookmarks/jobs → UI shows success and processes only a small batch.
- **Search:** Query enabled → server loads all user bookmarks and hydrated tags/content → JavaScript lower-case substring matching → all terms must match.
- **Collections:** List/create/rename/delete; selecting a collection filters bookmarks; bookmark moves validate collection ownership.
- **Health:** Dashboard loads all bookmarks/counts/settings → queue action creates jobs → request processes up to 100 → weekly heartbeat calls scheduled endpoint.
- **Analysis:** User or scrape flow sends title, description, collection, tags, notes, and cached page text to configured LLM → validated structured output saved to bookmark.
- **Live refresh:** Authenticated SSE receives per-user update event → React Query invalidates bookmark/collection/health queries.

### Confirmed issues and risks

#### P0/P1 — fix before production

- **Jobs are not truly background.** New scrape work is only processed by UI-triggered `limit: 2` calls; closing the browser leaves pending jobs. Importing 50 URLs does not drain 50 jobs. Evidence: `client/src/pages/Home.tsx:116-140`, `server/services/jobProcessor.ts:123-145`.
- **Current local backlog is visibly stuck.** DB inspection showed `652 pending scrape` jobs, `2 failed`, `654 bookmarks`; cards remained “Retrieving page details…” after runtime load.
- **Health backlog does not reliably drain.** Scheduled and manual health paths process max 100 jobs and do not schedule continuation. UI says remainder “will continue automatically,” which is false without another callback/request. Evidence: `server/_core/index.ts:77-88`, `client/src/pages/Home.tsx:229-235`.
- **No retry/reaper for job failures or process death.** `attemptCount` increments, but failed jobs are not retried and `processing` jobs can remain stuck forever. Evidence: `server/db.ts:636-663`.
- **Search is not FTS.** It hydrates the entire user library and performs in-memory substring scanning; no full-text index exists. This is acceptable only for small libraries. Evidence: `server/db.ts:274-307`, `drizzle/schema.ts:43-108`.
- **Query failures become false empty states.** `data ?? []` is used without `isError`/retry branches; network/database failures can display “Your library is ready,” “No matching links,” or “Nothing to check.” Evidence: `client/src/pages/Home.tsx:84-93`, `client/src/pages/Home.tsx:695-696`, `client/src/pages/Home.tsx:1130-1155`.
- **Required 403 fallback is missing.** A 403 scraper response fails the job instead of preserving raw URL as title and marking metadata incomplete. Evidence: `server/services/linkSafety.ts:226-232`, `server/services/jobProcessor.ts:101-108`.
- **Scraper timeout violates contract.** Code uses 12 seconds; original contract requires 10 seconds. Robots, metadata, and health calls each have separate request deadlines. Evidence: `server/services/linkSafety.ts:9`.
- **SSRF policy is blacklist-based, not global-public allowlist.** Several special/non-global ranges are not rejected; DNS lookup also lacks an explicit deadline. Recheck-at-connect is good but not enough for the stated mathematical guarantee. Evidence: `server/services/linkSafety.ts:34-119`.
- **Local mode is unauthenticated and server binding is not explicitly loopback-only.** Any reachable local-mode server gets the fixed local admin identity. Safe only on a trusted machine; bind explicitly to `127.0.0.1` or require opt-in for LAN exposure. Evidence: `server/_core/env.ts:2-3`, `server/_core/localAuth.ts:5-19`, `server/_core/index.ts:113-122`.
- **Cookie-authenticated mutations have no visible CSRF defense.** Cookie policy is `SameSite=None`; no strict Origin/Referer check or CSRF token is evident. Reassess for OAuth/hosted deployments. Evidence: `server/_core/cookies.ts:42-47`, `server/_core/index.ts:39-40`.
- **Tag removal misses bookmark ownership predicate.** User-owned tag is checked, but deletion filters only bookmark ID + tag ID; a guessed cross-user bookmark ID could remove a join row on another user’s bookmark. Evidence: `server/db.ts:528-543`.
- **Bookmark + job creation is non-atomic.** A DB failure between bookmark insert and job insert leaves an orphan bookmark or unqueued work; imports can partially commit. Evidence: `server/routers.ts:122-129`, `server/routers.ts:183-195`, `server/db.ts:546-561`.
- **Storage proxy is unauthenticated and accepts arbitrary keys.** `GET /manus-storage/*` uses the server credential to mint signed URLs. Confirm whether Forge authorization makes this safe before production. Evidence: `server/_core/storageProxy.ts:4-46`.
- **URL userinfo is accepted and persisted.** `https://user:password@host` can be stored and sent upstream during scraping. Reject credentials in URL normalization. Evidence: `server/services/bookmarkUtils.ts:24-57`, `server/services/linkSafety.ts:129-148`.

#### P2 — important quality and scale gaps

- **No pagination/virtualization.** All bookmarks render at once. The current 654-bookmark runtime produced a huge document and poor scanability; larger libraries will increase DOM, memory, hydration, and interaction cost. Evidence: `server/db.ts:251-272`, `client/src/pages/Home.tsx:93`, bookmark mapping around `Home.tsx:759-900`.
- **Large-library operations are unbounded.** List, search, health dashboard, export, cached page text hydration, and import parsing can consume large memory/CPU budgets. Evidence: `server/db.ts:251-307`, `server/routers.ts:91-97`, `server/routers.ts:359-370`.
- **Metadata extraction is partial.** Favicon/OG image URLs are stored, not downloaded/cached; body text is broad `body` text rather than main-article extraction. Evidence: `server/services/linkSafety.ts:206-215`.
- **SSE is single-process and lacks operational controls.** No broker, heartbeat, connection cap, timeout, or backpressure strategy. Multiple instances will miss events. Evidence: `server/services/liveEvents.ts:10-27`, `server/_core/index.ts:43-62`.
- **Background AI failures can persist provider details.** Direct route sanitizes errors, but background job path stores `errorMessage(analysisError)`. Persist fixed safe error messages only. Evidence: `server/services/jobProcessor.ts:75-79`, `server/_core/llm.ts:404-420`.
- **AI calls have no clear timeout/cooldown/concurrency guard.** Repeated analysis can consume provider quota and block request-coupled processing; private notes/page text leave the app boundary. Evidence: `server/services/bookmarkAnalysis.ts:41-85`, `server/routers.ts:310-349`.
- **Import abuse remains expensive.** A 10 MB input is parsed before the 1,000-entry cap; deep trees, repeated DNS calls, collection inserts, and job inserts can exhaust request/DB capacity. Evidence: `server/routers.ts:131-195`, `server/services/bookmarkUtils.ts:208-216`.
- **No duplicate URL uniqueness invariant.** `normalizedUrl` has no unique index; repeated saves/imports can create duplicates and duplicate work. Evidence: `drizzle/schema.ts:53-55`, `server/db.ts:546-561`.
- **RTL contract is only partial.** `dir` covers selected title/description/insight content, not full card, tags, notes, collection control, health rows, or related language metadata. Evidence: `client/src/pages/Home.tsx:759-783`.
- **Production error surface leaks implementation detail.** ErrorBoundary renders `error.stack`; QA also observed development API errors exposing filesystem paths. Evidence: `client/src/components/ErrorBoundary.tsx:34-40`.
- **Build ships broken analytics placeholders when env is absent.** Browser console showed 400 request and MIME-type execution failure for `/%VITE_ANALYTICS_ENDPOINT%/umami`; build also warns about missing analytics variables. Evidence: `client/index.html:14`, `pnpm run build` output.
- **Bundle is large.** Production build reports a ~594 kB JS chunk and recommends code splitting. Not urgent for local MVP, but relevant to first-load performance. Evidence: `pnpm run build` output.
- **Production auth config is not fail-fast.** Missing OAuth/JWT/Forge configuration can produce runtime failures instead of a startup refusal with actionable diagnostics. Evidence: `server/_core/env.ts:1-11`, `server/_core/sdk.ts:209-276`.
- **Session binding/revocation needs review.** Review found app/session identity checks and one-year token lifetime deserve hardening; logout clears browser cookie but does not revoke token server-side. Evidence: `server/_core/sdk.ts:113-147`, `server/_core/sdk.ts:160-178`.

### UI/UX and accessibility review

#### Strengths

- Landing page has clear hierarchy, strong product identity, semantic headings, repeated primary CTA, focus rings, and reduced-motion CSS.
- Health status is text plus color; destructive bulk operations show exact counts and use confirmation dialogs.
- Empty states are actionable: save first link, browse saved links, or show all health results.
- Desktop navigation is easy to understand: All links, Collections, Link health.
- Dark theme, RTL-aware metadata, keyboard selection, and bulk toolbar have targeted tests.
- Landing mobile layout stacks correctly and runtime check found no primary horizontal overflow at 375px.

#### Confirmed UX/accessibility gaps

- **Zoom is disabled.** `maximum-scale=1` blocks pinch/text zoom; remove it and verify 200%/400% text zoom. Evidence: `client/index.html:5`.
- **Mobile drawer is not a complete modal.** Custom `role="dialog"` lacks focus move, focus trap, focus restoration, and Escape handling; background can remain keyboard-reachable. Evidence: `client/src/components/DashboardLayout.tsx:191-249`.
- **Search, notes, bulk tag, card tag, collection rename, and per-card collection controls lack durable/contextual labels.** Placeholder text is not sufficient; repeated comboboxes need bookmark-specific names. Evidence: `client/src/pages/Home.tsx:482-488`, `626-631`, `673-679`, `808-833`, `979-985`.
- **Tag entry has no visible submit affordance.** Users must discover Enter-key behavior. Evidence: `client/src/pages/Home.tsx:827-829`.
- **Collections has no explicit loading/error state.** `[]` can look like “No collections yet” while query is pending or failed. Evidence: `client/src/pages/Home.tsx:89`, `313-336`, `960-990`.
- **Loading states are weak for assistive tech and reduced motion.** Skeletons/spinners lack `role=status`/`aria-busy`; reduced-motion CSS shortens transitions but does not remove `animate-pulse`/`animate-spin`. Evidence: `client/src/index.css:228-230`, `client/src/pages/Home.tsx:872`, `1163-1164`.
- **Delete labels are ambiguous.** Repeated “Remove bookmark” labels and generic confirmation titles do not identify the target bookmark/collection. Evidence: `client/src/pages/Home.tsx:508-520`, `823`.
- **Selection can survive filtering.** Hidden IDs remain selected when search/collection filters change; bulk actions can affect hidden items. Clear or explicitly disclose hidden selection. Evidence: `client/src/pages/Home.tsx:295-307`.
- **Active navigation state is visual only.** Add `aria-current`/equivalent state. Evidence: `client/src/components/DashboardLayout.tsx:325-341`.
- **Dark theme tokens are fragmented.** Raw hex values in layout are compensated by a large selector override map; this is fragile and complicates future refinement. Evidence: `client/src/components/DashboardLayout.tsx:64-70`, `client/src/index.css:172-208`.
- **Landing mobile navigation hides discovery links below 640px.** Secondary CTA partly compensates, but section discoverability drops. Evidence: `client/src/pages/landing.css:109-115`.

### Test and verification state

- **Passed:** `pnpm run check`.
- **Passed:** `pnpm test` → **14 files / 36 tests**.
- **Passed with warnings:** `pnpm run build`.
- **Browser runtime:** Landing rendered at `/`; library rendered in local mode with real DB data; narrow viewport rendered but produced a very large document.
- **Runtime console defect:** Analytics placeholder request returns 400 and script MIME error when analytics env is absent.
- **Manual QA limitation:** Full browser DOM/action coverage was incomplete due snapshot/timeouts; do not treat existing `todo.md` claims as independently proven.
- **Missing high-value tests:** 403 fallback, job drain/retry/recovery, scheduled continuation, import-to-DB integration, duplicate import behavior, real FTS behavior, authenticated SSE, query error/retry UI, mobile drawer focus/Escape, 200% zoom, full RTL controls, and 50-URL processing benchmark.
- **Existing `todo.md` drift:** It marks background drain, accessibility, security, browser/mobile verification, and checkpoint work complete, but current code/runtime evidence contradicts several of those claims.

### Recommended next actions

- **1. Make jobs real and durable:** Move scrape/health execution out of request/UI paths; add worker lease, stale-processing recovery, bounded retries, backoff, continuation, and observable queue status.
- **2. Close security boundaries:** Loopback-bind local mode, add CSRF/origin protection, enforce global-public SSRF allowlist with DNS timeout, reject URL userinfo, fix tag-removal ownership, secure storage proxy, sanitize all persisted provider errors.
- **3. Fix failure UX:** Add explicit loading/error/retry branches for every query; never convert API failure into empty-state copy; add actionable local-DB retry/reload.
- **4. Choose scale target:** If >~500 bookmarks matters, add server pagination, DB-side FTS, result limits, export streaming, and list virtualization/windowing.
- **5. Match scraper contract:** 10-second deadline, 403 → raw URL/incomplete metadata, favicon caching/download, and main-content extraction.
- **6. Finish accessibility pass:** Remove `maximum-scale=1`; use Radix Dialog/Sheet for mobile nav; add labels, contextual names, `aria-current`, status announcements, target-specific destructive copy, RTL card-level direction/language, and reduced-motion loader handling.
- **7. Decide AI scope/privacy:** Keep AI only with explicit opt-in, provider/retention disclosure, note exclusion option, cost/rate limits, safe failure persistence, and a clear product decision overriding the original non-goal.
- **8. Clean product surface:** Remove/quarantine unused template modules and fix analytics env handling; split large client bundle after product correctness is stable.
- **9. Add acceptance evidence:** 50-URL queue benchmark, restart/crash recovery test, multi-user ownership test, authenticated SSE test, scheduled health drain test, SSRF property/boundary suite, browser regression suite, accessibility automation, and mobile zoom/focus verification.

### Stakeholder decisions for discussion

- Is Fihrist local-first single-user only, or must it support hosted multi-user and multiple server instances?
- What library size must feel fast: 500, 5,000, or 50,000 bookmarks?
- Is AI analysis part of the product, or should it be removed to honor the original MVP non-goal?
- Should link health mean current status only, or historical checks, trends, and recovery notifications?
- Is current-body-text scraping sufficient, or is article-quality extraction required?
- Which production auth/storage/SSE provider is intended, and what privacy/retention guarantees apply to page text and private notes?

### Review conclusion

- **Ship locally for discussion:** Yes, with trusted-machine scope and small-library expectations.
- **Ship as production product:** No, until job durability, security boundaries, search/scale, failure UX, and accessibility gaps above are closed.
- **Highest-leverage first slice:** durable queue + retry/recovery + query error states + SSRF/auth hardening; this fixes the biggest correctness and trust failures without broad UI redesign.

## Execution Update — 2026-07-23

### Implemented in this pass

- **Durable job execution:** Added a database-backed worker entrypoint, polling loop, bounded concurrency, 60-second leases, stale-processing reclamation, three-attempt retry policy, exponential backoff, and lease-token guarded completion/failure updates.
- **Queue correctness:** Removed the browser-only scrape drain; new bookmark and health jobs are owned by the worker. Manual health queueing now scans bookmark IDs in bounded database pages instead of hydrating the full library.
- **Data integrity:** Bookmark creation and its initial job are transactional. Normalized URL SHA-256 hashes now enforce a per-user uniqueness invariant, with a migration that merged pre-existing duplicate rows before adding the constraint.
- **Scale boundaries:** Bookmark/search/health APIs now use cursor pagination with a 50-item cap, SQL-side filtering, bounded term count, and database health-status counts. The client supports load-more behavior instead of rendering the full library at once.
- **Security boundaries:** Rejected URL userinfo, tightened public-target and DNS checks including special-use IPv4/IPv6 ranges, added DNS/request deadlines, revalidated redirect targets, constrained persisted asset URLs to the scraped origin, added mutation origin checks, loopback-safe local defaults, protected arbitrary storage-key redirects, and changed session cookies to `SameSite=Lax`.
- **Scraper behavior:** Enforced the 10-second request contract, added a 403 metadata fallback, and prefer main/article content when available. A live `https://example.com` scrape succeeded after correcting the custom DNS agent callback for Node’s `options.all` contract.
- **AI/privacy:** Removed private notes, collections, and tags from the automatic analysis prompt. Automatic background AI execution is no longer part of scrape processing; manual analysis remains an explicit user action.
- **Failure UX/accessibility:** Added query error/retry states, safe error-boundary copy, Radix mobile navigation with focus/Escape behavior, contextual control labels, active navigation semantics, busy/status affordances, reduced-motion loader handling, selection pruning, and zoom-friendly viewport metadata. Removed the broken analytics placeholder script.

### Verification evidence

- `pnpm run check` passed.
- `pnpm test` passed: **14 files / 37 tests**.
- `pnpm run build` passed and emits both web and worker bundles. Vite still reports a non-blocking client chunk-size warning at approximately 599 kB minified.
- `pnpm exec drizzle-kit check` passed.
- `git diff --check` passed.
- Database invariant check confirmed **651 bookmarks**, no duplicate `(userId, normalizedUrlHash)` groups, and the unique hash index is present.
- Browser QA confirmed the library loads with **651 saved links**, load-more changes 50 rendered cards to 100, search returns one result for a matching term, the mobile navigation opens/closes as a dialog, health load-more changes 50 rows to 100, and browser error logs were empty.

### Known state and residual follow-up

- The live worker was first exercised before the DNS callback fix and left the existing local scrape backlog in terminal failed state (**651 jobs, attempt count 3 for most rows**). Those external URLs were not bulk-requeued after the fix to avoid issuing hundreds of new outbound requests without an explicit recovery policy. A production UI still needs an authenticated retry/requeue action and observable queue status.
- Search is database-bounded but still uses `LIKE`; database-native full-text indexing remains the next scale step for libraries beyond the current target.
- Export still materializes the full Netscape document; streaming/chunked export and an import parser that rejects oversized/deep input before expensive parsing remain follow-up work.
- Favicon/OG image assets are constrained to same-origin URLs but are not downloaded/cached; historical health timelines, distributed SSE delivery, SSE backpressure/heartbeats, and multi-instance coordination remain out of scope for this pass.
- Production deployment still needs explicit fail-fast auth/configuration checks, a deliberate AI scope/privacy decision, and a 50-URL queue benchmark plus crash/restart recovery test.

### Current implementation posture

- **Local/trusted-machine use:** materially hardened and ready for further product discussion.
- **Hosted production use:** still not release-ready until the residual queue recovery, full-text/export scale, deployment configuration, and operational observability work is completed.

## Execution Update 2 — 2026-07-23

### Plan tranche implemented

- **Authenticated queue recovery:** Added `bookmarks.queueStatus` and `bookmarks.retryFailed` procedures. The library now exposes pending, processing, and failed counts, a retry action capped at 100 jobs per request, safe retry feedback, and a queue-status retry state. Request-coupled pending-job processing routes were removed so the worker is the only execution path.
- **Bounded import/export:** Import input is capped at 2 MB, parsing stops at 1,000 bookmarks and 20 nested collection levels, and browser file selection uses the same 2 MB limit. Export refuses libraries over 10,000 items with an actionable payload-size error instead of silently allocating an unbounded document.
- **Database-native search scale step:** Added migration `drizzle/0005_focused_fulltext.sql` for a MySQL FULLTEXT index over title, description, notes, cached text, and host. Search uses boolean prefix matching for eligible terms while retaining `LIKE` and tag matching as fallbacks.
- **AI request safety:** Added a 15-second LLM request timeout, avoids retrying timed-out requests, prevents duplicate in-flight analysis per bookmark, and applies a short cooldown after an analysis attempt. Manual analysis remains explicit and private notes/collections/tags remain excluded from the prompt.
- **Production configuration:** Server and worker startup now fail fast when required production settings are missing. The startup command exits with status 1 and reports missing `JWT_SECRET`, `VITE_APP_ID`, and `OAUTH_SERVER_URL` in the current local verification.
- **Operational hardening:** Persisted job errors are reduced to safe user-facing categories, SSE connections receive keep-alive comments and clean up idempotently, and storage proxy paths are restricted to generated keys without traversal segments.

### Verification evidence for this tranche

- `pnpm run check` passed.
- `pnpm test` passed: **15 files / 40 tests**.
- `pnpm run build` passed and emits web, server, and worker bundles. Vite still reports a non-blocking client chunk-size warning around 601 kB minified.
- `pnpm exec drizzle-kit check` passed; migration `0005_focused_fulltext` is recorded and the live database reports the expected five-column FULLTEXT index.
- The TypeScript no-excuse audit passed with **no violations** across changed TypeScript/TSX files.
- The deterministic security scan completed with only expected changed trust-boundary path notices for cookie/auth files; no concrete secret, injection, or unsafe-shell finding was reported.
- Live browser QA on `http://127.0.0.1:3001/library` showed the authenticated queue banner (`651 failed jobs`), `651 saved links`, and a search for `BOOMPAY` returning exactly one result. The retry action was intentionally not activated because it would enqueue 100 real external URL requests.
- Database inspection confirms the existing local backlog remains terminally failed: **0 pending, 0 processing, 651 failed**. It was not bulk-requeued during verification.

### Updated residual issues

- The retry control is available, but a full retry/drain benchmark has not been run against the existing external backlog. Validate this deliberately with a small controlled set before reopening all 651 jobs.
- Search now has a FULLTEXT path, but retains `LIKE` fallback behavior and still needs production benchmarking for multilingual terms, tags, and large libraries.
- Export is bounded by a 10,000-item refusal threshold rather than true streaming. A future large-library export should use a streamed response or server-side file generation.
- Queue status and retry are single-instance API features; distributed worker coordination, broker-backed SSE, and multi-instance operational metrics remain open.
- Production deployment still requires real secrets/provider configuration, an explicit AI retention/cost decision, 50-URL queue acceptance, and crash/restart recovery evidence.

### Current assessment after execution

- **Local/trusted-machine use:** the planned correctness, queue visibility, input bounds, search indexing, AI timeout, and configuration-hardening tranche is implemented and verified.
- **Hosted production use:** improved but still not release-ready until controlled queue recovery, distributed operations, large-library export/benchmarking, and deployment/privacy decisions are completed.

## Execution Update 3 — 2026-07-23 — Local-only SQLite delivery

### Product direction locked

- **Deployment model:** Single-user, local-only web app on a trusted machine; no hosted multi-user or distributed-runtime target.
- **Storage:** Embedded SQLite using `better-sqlite3` and Drizzle, with WAL, foreign keys, busy timeout, and FTS5.
- **Data policy:** Fresh SQLite library by choice. The prior MySQL database/volume and its 651-bookmark dataset were not migrated, modified, or deleted; they remain a temporary backup until the new local library is accepted.
- **Target size:** Up to 10,000 bookmarks. The existing pagination, input caps, export refusal threshold, and bounded queue settings remain appropriate for this target.
- **AI:** Manual and explicitly configured only; no automatic background AI. If no local provider variables are present, AI is unavailable without blocking bookmark capture. Notes, collections, and tags remain outside the AI prompt.

### Implemented

- Removed Docker/MySQL startup, MySQL migrations, OAuth/hosted-auth modules, storage proxy, heartbeat scheduling, and the separate worker process.
- Added OS-appropriate local data directory resolution with `FIHRIST_DATA_DIR` override and a fresh `fihrist.sqlite` database.
- Added idempotent SQLite schema migration and FTS5 triggers for title, description, notes, cached text, and host search.
- Added one-process local job runner with concurrency 2, polling, stale-processing recovery, retry/backoff behavior already present in the job processor, and weekly health catch-up.
- Fixed SQLite transaction semantics for bookmark-plus-job creation; the `better-sqlite3` transaction callback is synchronous and now commits both records atomically.
- Added daily local SQLite backup on startup with retention of the newest seven dated backups.
- Kept bookmark CRUD, collections, tags, notes, import/export, scraping, automatic tags, health checks, queue status/retry, SSE, RTL, and manual AI features.
- Changed the local UI to remove hosted sign-in/logout controls and present a clear local-library failure state when the SQLite database cannot open.
- `pnpm dev` now starts the single local server; production server configuration requires loopback binding rather than remote hosting configuration.

### Verification evidence

- `pnpm run check` passed.
- `pnpm test` passed: **15 files / 40 tests**.
- `pnpm run build` passed: web and single server bundles; Vite reports only the existing non-blocking client chunk-size warning.
- `pnpm exec drizzle-kit check` passed.
- `git diff --check` passed.
- Fresh-database smoke test passed: migrations, FTS5 table/triggers, foreign keys, and local user/bookmark insertion worked in an isolated temporary data directory.
- Live production smoke test passed: built server responded `200` on `http://127.0.0.1:4177/` using a fresh temporary SQLite directory.
- Controlled crash-recovery check passed: one processing job was reclaimed as pending with lease fields cleared after restart simulation.
- Controlled queue-enqueue check passed: **50 jobs enqueued in 30 ms** in a disposable SQLite library; full external-URL drain timing remains intentionally unrun.
- Backup restore check passed: a dated SQLite backup reopened and contained the source user row.
- Security scan found no secret, injection, or unsafe-shell finding. It reported expected trust-boundary notices for deleted hosted-auth files and the static SQLite DDL `exec` used to create FTS5 triggers.

### Deliberately not required for the local-only target

- Distributed workers, broker-backed SSE, multi-instance coordination, hosted deployment review, historical health timeline, favicon/image downloading, and true streamed export are outside the selected product boundary.
- The old MySQL dataset is not auto-imported. A future migration/import tool can be added only after the fresh-library behavior is accepted.

### Remaining acceptance work

- Run a controlled 50-URL queue benchmark against disposable URLs and verify retry/drain timing without reopening the old 651-row backlog.
- Run a controlled crash/restart test proving processing jobs return to pending and are resumed by the local runner.
- Exercise backup restore manually on a disposable copy and document the recovery command.
- Decide whether to add a guided migration/import path from the untouched MySQL backup; it is not needed for the selected fresh-library launch.

### Current assessment

- **Local/trusted-machine use:** the selected architecture is implemented and technically runnable with a fresh SQLite library.
- **Hosted production use:** intentionally unsupported by this delivery; the app should remain loopback-only.
