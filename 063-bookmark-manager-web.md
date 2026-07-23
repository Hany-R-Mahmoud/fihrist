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