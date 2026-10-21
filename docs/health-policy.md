# Fihrist link health policy — v2 (2026-10-22)

**Decision principle:** a confident wrong "dead" harms trust. Ambiguous checks
are `needs_review`, never `broken`. The four checked states remain `healthy`,
`redirected`, `broken` and `needs_review` (plus `unchecked`).

## Version history

- **v2 · 2026-10-22 · Specs 1–9:** persisted failure/move evidence, eight-hop
  chains, conservative home/login redirects, two-sweep guarded soft-404,
  timeout/TLS persistent-review streak, cross-invocation pacing, 90-day
  rollup retention, per-link controls, Wayback recovery and Topic Shelves.
- **v1:** initial four-state confidence policy and in-process pacing.

## Classification procedure (Specs 3–6)

1. Validate URL and each redirect hop against SSRF guards. DNS is checked
   before connecting **and at connect time**, including IPv4/IPv6 targets.
   Use the honest `FihristBookmarkHealth/1.0` user-agent.
2. `HEAD`, then bounded `GET Range: bytes=0-32767` for 400/403/405
   **and successes** to inspect the page body. Follow at most **8 hops**.
3. Up to 3 attempts (delays 0, 1s, 2.5s); an unchallenged real 2xx stops
   retries. Exceeding the hop cap or a checker exception is
   `needs_review/inconclusive`, never broken.
4. Persist the decisive evidence on **every** check: `failureClass` enum,
   `networkCode`, redirect chain of `{u,s}` capped at eight entries /
   2,500 UTF-8 bytes (each URL ≤256 characters), `finalHost`, title ≤300
   chars, normalized-visible-text SHA-256 `bodyHash`, `contentLength`,
   `moveClass`, and elapsed time.
5. **Hard `broken` only:** 3 identical HTTP 404/410, other stable
   non-blocked 4xx or 5xx, or 3 identical ENOTFOUND/ECONNREFUSED.
   Varying HTTP failures, timeouts, TLS, and DNS flapping remain
   `needs_review` regardless of repetition.
6. `failureClass` has these dispositions (blocked before generic 4xx):
   - `none`: successful ordinary check
   - `dns`, `refused`: all attempts returned ENOTFOUND/ECONNREFUSED
   - `timeout`: ECONNABORTED/ETIMEDOUT, remains under review
   - `tls`: TLS/certificate error, remains under review
   - `http_4xx`, `http_5xx`: hard failure only on consistent retries
   - `blocked`: 401/403/429, bot challenges or sign-in wall, review
   - `soft_404`: suspect 2xx missing page, see next section
   - `redirect_home`, `redirect_login`: deep link moved to root/auth
   - `inconclusive`: mixed/unknown failures; always review
7. Repeated `timeout`/`tls`/`inconclusive` on **3 consecutive
   distinct completed sweeps** sets `persistentFailure`, with a human
   reason line but **never `broken`**. A healthy/redirected verdict clears
   it. The bookmark's `healthStatus` still remains `needs_review`.

## Redirect truth (Spec 4)

`moveClass`:
- `none`: no change.
- `canonical`: only scheme, www, trailing slash, default port,
  casing or tracking parameters changed. Stored as redirected but
  shown as healthy-equivalent, without an update action.
- `relocation`: same site, meaningful path change; allow explicit
  one-click update, then reset the bookmark to `unchecked`.
- `cross_domain`: different site; same opt-in action.
- `to_home`: deep URL ends at domain or locale homepage; review.
- `to_login`: deep URL ends at login/auth wall; review.

No redirect is silently applied to a saved bookmark.

## Soft-404 detector (Spec 6)

For a 2xx deep page within a health sweep, at most one random
`/fihrist-probe-<16hex>` URL per host/run is requested. The probe
uses the same public-request SSRF protections and the host's paced
job lease. Cloud probe evidence is stored by `(host,runId)`, not a
process cache. Ordinary 404 probes do **not** incriminate a site.

A soft-404 suspicion requires a 2xx custom missing-page probe **and**
matching final URL, equal page title, Jaccard similarity ≥0.9 of
normalized visible-text word trigrams, or EN/AR missing-page phrases.
Normalization: strip scripts/styles/tags, decode HTML entities,
lowercase, remove punctuation, collapse whitespace; the same text
is SHA-256 hashed as `bodyHash`. One suspicion → `needs_review`.
A **later distinct sweep** with the same signal → `broken`;
a healthy result resets the streak. No parked/domain-drift verdict
is made in v2.

## Per-link controls and recovery (Specs 5, 8)

- Owner-controlled `checksDisabled` removes a bookmark from automated
  weekly enqueue, not from individual manual checks.
- `healthNote` is owner text, maximum 280 chars. It does not change
  the classifier.
- After a broken verdict, enqueue one advisory Wayback Availability
  lookup (`archive.org/wayback/available`). Store vetted
  `https://web.archive.org/...` URLs and timestamp or an explicit
  no-result. Archive service failure is a job failure, **never** a
  bookmark health-status change.
- The owner can open the archived page or explicitly replace the link,
  keeping the original URL and recording the operation in history.
  Replacement resets the saved link's latest status to `unchecked`.

## Pacing, scheduling and retention (Specs 2–3)

- Local: the existing serialized per-host pacer.
- Cloud: a durable DB row per host claimed conditionally, one active
  worker per host, a **750ms gap after the previous check ends** and
  90s lease to prevent cross-invocation overlap. Busy jobs are deferred
  instead of consuming an attempt. Failed function invocations are
  recovered using existing job leases.
- Automatic cloud weekly scheduling is **off by default** behind
  `FIHRIST_ENABLE_CLOUD_WEEKLY_HEALTH` (set on Neon worker and web API
  only after capacity tests). The Vercel daily cron remains a bounded
  legacy job drain, not the automatic weekly scheduler.
- After the weekly digest has been recorded, checks older than 90 days
  are compacted: retain the first check, every state transition, and
  the last check of each month. BEFORE deleting older repeat checks,
  store count and streak contributions in `health_rollups`. The
  visible timeline and digest combine rollups and retained rows.
- All counters, statuses and suggested recoveries are observational;
  the user must explicitly choose deletion or URL replacement.

## Topic Shelves (Spec 9)

Only derived `topic:` names and `bookmark_tags.source='topic'`
can be replaced during recompute. Original collections and all manual,
automatic and approved AI tags remain untouched. Host, bilingual
keyword topic and two-shared-tag overlap groups require ≥3 bookmarks.
Dismissing a shelf or an item persists across recomputation.
The display uses the existing bookmark cards and collection styling.

## Unverifiable cases

Login-protected sites, bot protections, JavaScript-only shells and
timeouts can be unreachable to a legitimate checker. They remain
`needs_review` with an explicit reason. Never delete on their behalf.
