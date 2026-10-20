# Sentinel layer — handoff

Two features shipped on `feature/add--2-flows-muse`: a **per-link check timeline**
and a **narrative rot report**. Both are additive; the existing health behaviour,
the extension and the AI tag path are untouched.

---

## 1. What Spec 0 settled (and what it contradicted)

| The brief assumed | What the code actually does |
|---|---|
| Database engine unverified | **SQLite** (`better-sqlite3`, `drizzle.config.ts` dialect `sqlite`). `@neondatabase/*` is in `package.json` but imported nowhere. `drizzle/postgres/` is an untracked, unwired preview. |
| "Arabic-first UI with EN toggle" already ships | **No i18n existed.** Every string was a hard-coded English literal; no `t()`, no dictionary, no `dir` on `<html>`. |
| An existing "bookmark detail surface" | **None existed.** `BookmarkCard` was the de-facto detail. |
| `runId` points at a `bookmarkJobs` record | **`bookmarkJobs` is one row per bookmark**, so it cannot identify a run. No run record existed anywhere. |
| An existing outbound notification capability | **None.** `server/_core/notification.ts` is the Manus platform's `notifyOwner`, not end-user delivery. The digest is in-app only, as the brief expected. |

### Deviations, and why

1. **`health_runs` table added.** A run needs its own record. `health_checks.runId`
   and `rot_digests.runId` both point at it; `bookmarkJobs.runId` and
   `health_checks.jobId` keep the explicit per-job attribution the brief asked
   for. Attribution is never inferred from a timestamp.
2. **A locale layer was created, then extended to the whole app.** The brief's
   binding Arabic requirements and canonical digest line needed an i18n layer that
   did not exist. Per the owner's decision this was done app-wide, not just for
   the new surfaces: Arabic is the default, English is one toggle away, and
   `document.documentElement` carries `lang` and `dir`.
3. **The timeline lives in a dialog.** One tap from the bookmark card, from every
   triage row, and from every digest item. No detail page was invented.
4. **`needs_review` has faithful sub-variants.** The brief's plain-language table
   pins one `needs_review` sentence; it is used for the bot-blocked case. The
   empty-app-shell, inconclusive and malformed cases get their own sentences, so
   the report never asserts a cause the checker did not record.
5. **The digest has a fifth "redirected" section.** The brief requires redirected
   items to carry an *update the address* action, so they have to be visible. The
   four binding sections keep their exact order and the numbers line its exact
   canonical shape.
6. **`invokeLLM`'s transport-level retry is unchanged.** "One attempt" is enforced
   at the narrative-generation level: exactly one generation call, no second
   generation on failure. Re-implementing a single-shot HTTP client would have
   been a second AI integration, which the brief forbids.
7. **`fihrist-health-needs-review` was used but never defined** in `index.css`.
   Added (one line). This also fixes the health summary tile's accent bar, which
   rendered with no background.
8. **DESIGN.md §9 pins the CTA label "Open bookmarks library."** That exact
   label is preserved in the English locale; the Arabic locale renders the Arabic
   equivalent.

---

## 2. Files changed, by spec

### Spec 1 — check-history persistence
| File | Change |
|---|---|
| `drizzle/schema.ts` | `health_runs`, `health_checks`, `rot_digests`; `bookmarkJobs.runId`; `bookmarks.healthAlertDismissedAt`; `healthCheckSettings.lastRunId` |
| `drizzle/sqlite/0003_sleepy_bruce_banner.sql` | Generated migration (new tables + three `ALTER TABLE ADD COLUMN`) |
| `shared/healthLanguage.ts` | **New.** State labels, design-system classes, and the plain-language sentences — one source of truth for client and server |
| `server/services/healthHistory.ts` | **New.** The single recording point, the shared transition definitions, the timeline summary |
| `server/db.ts` | Accessors for runs, checks, digests, dismissals, and `updateBookmarkUrl` |
| `server/services/linkSafety.ts` | `checkLinkHealth` now also returns the probe's `finalUrl`. **`classifyHealthStatus` is untouched.** |
| `server/services/jobProcessor.ts` | Every check (ingestion, single, drain) goes through `runAndRecordHealthCheck` |
| `server/services/localJobRunner.ts` | Runs are created with a run record; run completion is the digest hook |
| `server/routers.ts` | `health.timeline`, `health.checkOne`, `digest.*` |

### Spec 2 — per-link timeline
| File | Change |
|---|---|
| `client/src/components/HealthTimeline.tsx` | **New.** The timeline: summary, run separators, density rule |
| `client/src/pages/Home.tsx` | Timeline dialog; one-tap history from the card, the triage rows and the digest |

### Spec 3 — narrative rot report
| File | Change |
|---|---|
| `server/services/rotDigest.ts` | **New.** Facts block, the grounding guard, the narrative layer |
| `server/services/aiTagging.ts` | `aiConfigured()` — the BYOK check is now shared, not duplicated |
| `server/services/liveEvents.ts` | `digest.updated` event |
| `client/src/components/RotDigestCard.tsx` | **New.** Numbers line, sections, actions, footer |
| `client/src/hooks/useFihristEvents.ts` | Listens for `digest.updated` |
| `client/src/components/DashboardLayout.tsx` | Unread indicator |

### i18n (owner decision: app-wide)
| File | Change |
|---|---|
| `client/src/i18n/dictionary.ts` | **New.** ~330 entries, Arabic and English |
| `client/src/i18n/LocaleContext.tsx` | **New.** Provider, persisted preference, `lang`/`dir` |
| `client/src/i18n/format.ts` | **New.** Locale-aware relative and absolute dates |
| `client/src/App.tsx` | `LocaleProvider` |
| `client/src/pages/Home.tsx`, `Landing.tsx`, `DashboardLayout.tsx` | Every string translated |

### Docs
`README.md`, `docs/portfolio.json` — corrected the health states (`ok` never
existed; there are four plus `unchecked`) and recorded the new features.

---

## 3. How to run

```bash
pnpm install
pnpm run dev        # http://localhost:3000
pnpm run check      # typecheck
pnpm run test       # vitest
pnpm run build      # production build
```

The migration applies itself on the next launch (`migrate()` runs inside
`openLocalDatabase`). Nothing else to run by hand.

**To see the two features**, the library needs links that have been checked. The
timeline fills up after the weekly sweep or a "Check links now"; the digest
appears on the home surface after a completed full-drain run.

---

## 4. Verification

| Check | Result |
|---|---|
| `pnpm run check` | Clean |
| `pnpm run test` | **120 passed / 24 files** |
| `pnpm run build` | Clean (`dist/index.js` 160 kB) |
| Migration on a fresh database | Clean (`server/_core/localDatabase.test.ts`) |
| Migration on a database already at the old schema | Clean — tables created, three columns added, re-run is a no-op, cascade verified |
| Two-run delta scenario | Automated: `server/services/rotDigest.scenarios.test.ts` — run 1 reports 2 newly broken / 1 newly suspicious / 1 redirected; run 2 reports **only** the delta (1 newly broken, 1 recovered, 1 still broken) |
| Dismiss-until-next-transition | Automated — dismissed link stays hidden, returns on its next transition |
| Grounding guard | Automated — a poisoned fixture naming a link outside the facts is rejected; `needs_review` narrated as dead is rejected; a cause the server did not record is rejected; markup is rejected; the 120-word cap holds |
| Silent cases | Automated — no key → **no LLM call**, facts-only; zero changes → **no LLM call**; LLM failure → exactly one call, facts-only, run completion unaffected |
| Digest narrative (Layer 2) | Generated through the **real** path — `invokeLLM` → model resolution → grounding guard → stored → rendered — against a local OpenAI-compatible endpoint. Accepted: `narrativeStatus: ok`, model `gpt-5-mini`, 512 in / 48 out tokens, estimate 123, and the card rendered «ملاحظة» + the narrative + the footer counts. **Rejected**: a narrative naming a link outside the run, and one calling a `needs_review` link dead — both came back `narrativeStatus: failed` with the facts intact |
| Timeline density rule | Automated on the real mount path (`loading` → data): a 30-check history opens on **changes only**, a 1-check history on **all**. Confirmed in a browser at 375 px: 30 checks → «بعرض التغييرات بس» with 1 row shown, not 30 |
| Design conformance | Verified in a real browser at 375 px: `scrollWidth === clientWidth === 375` (no horizontal scroll) with the digest card and with the timeline dialog open; `dir="rtl"`, `lang="ar"` |
| One-tap reachability | Verified in the browser: the timeline opens from a triage row and from a digest item, each in one click |
| Regression surface | Health states, progress banner, filters, bulk selection, dark mode, landing page, extension and AI tags: the existing suite is green |

The DB-backed suites open a real SQLite file and apply every migration, which
is slower than vitest's 5-second default on a loaded machine; they carry an
explicit 20-second budget, and the suite was run twice back to back to confirm
it is stable.

### Accuracy spot-check (real checker, live URLs, verified in a browser)

Each URL was checked by the real checker, **recorded as a row in `health_checks`**,
and then opened in a real browser to see what a person would see.

| URL | Recorded row | What the browser shows | Verdict |
|---|---|---|---|
| `https://example.com/` | `healthy` 200 | the "Example Domain" page | ✓ |
| `https://example.com/no-such-page-fihrist-xyz` | `broken` 404 | the page renders — example.com is a catch-all that returns its homepage body **with a 404 status** (verified with `curl`: `status=404`) | ✓ the status is genuinely 404, so the policy's "HTTP 404 ⇒ broken" applies |
| `https://this-does-not-exist-fihrist-xyz.example/` | `broken`, DNS failure | "This site can't be reached" | ✓ |
| `https://httpbin.org/status/403` | `needs_review` 403 | "Access to httpbin.org was denied … HTTP ERROR 403" | ✓ the site is alive and blocking — never "dead" |
| `https://httpbin.org/status/404` | `broken` 404 | "This httpbin.org page can't be found" | ✓ |
| `https://httpbin.org/redirect-to?url=…` | `redirected`, final URL `https://example.com/` | lands on `https://example.com/` | ✓ the final URL matches the browser exactly |

**Zero confidently-wrong `broken` records.** Every `broken` verdict is backed by
the status the server actually returned, every `needs_review` is a site that is
genuinely alive, and every `redirected` names the address the browser really
landed on. Two independent runs over the same URLs produced identical verdicts.

### Regression walk (Spec 4 Step 7)

| Surface | Result |
|---|---|
| Health states, progress banner, filters, bulk selection | Unchanged and green |
| Extension — one-click save | The extension's exact request (`POST /api/trpc/bookmarks.add`, `Origin: chrome-extension://…`) saves the link ✓. Saving the same tab again returns the `CONFLICT` the popup turns into "Already in your library." ✓. A **non-allow-listed** extension origin is still refused with 403 ✓ |
| Extension — popup search | Now works — see the FTS fix below ✓ |
| AI tag suggestions | Walked end to end against a local OpenAI-compatible endpoint: suggest → three **pending** suggestions with token counts recorded → approve → the tag is created and linked with `source: "ai"`, and the other two stay pending ✓. Nothing auto-applies ✓ |
| `docs/health-policy.md` | The classifier is byte-identical to the pre-change implementation; the policy still matches ✓ |

---

## 5. Review pass — findings and fixes

An independent review of this change found one blocker, six suggestions and
three nits. All are fixed.

| Finding | Severity | Fix |
|---|---|---|
| The timeline's density rule never fired: `useState(defaultMode)` captured the default while the query was in flight, so a long history still opened on "all checks" | **Blocker** | The mode is now derived from the data with an explicit override (`HealthTimeline.tsx`), the component is keyed per bookmark so the mode and the 50-entry window reset, and a regression test mounts it the way the app does (`loading` → data). Confirmed in a browser: 30 checks → «بعرض التغييرات بس» with 1 row shown. |
| Past reports were listed but not re-openable — `onSelectDigest` was never passed | Suggestion | `Home.tsx` now holds the selected report and renders it; the card's list is the other reports, so the latest is one click away. |
| The digest's overflow deep link landed in a filter no summary card represents, so nothing said which filter was active | Suggestion | The health toolbar now names the active filter («بعرض: كل المكسور»), including the "all broken" filter the digest links to. |
| Digest generation loaded the entire check history for every bookmark in the run | Suggestion | The "previous check before the run" is now found in the database with a window function (one row per bookmark), and the spell is read from the one bookmark's own history only where it is needed. The whole-library read with tag hydration is gone. |
| A second "Check links now" during a sweep started a second run, and so produced a second report for one sweep | Suggestion | `openHealthRun` joins the run already running instead of opening another one; a single-bookmark check is still always its own run. |
| `checked` counted check rows rather than distinct links, so a retried job inflated the numbers line | Suggestion | The facts now count distinct bookmarks, and `skipped` follows from that. |
| A report whose facts failed to parse made the whole card vanish, with no error | Suggestion | The card now says plainly that the report could not be read, and draws no numbers line it cannot back. |
| Dead code (`runDeltaForBookmark`, `latestChecksBefore`, `listHealthRuns`, the `bookmarkTitle` prop, `runCompletedAt`) | Nit | Removed, except `latestChecksBefore`, which was rewritten into the bounded query above. |
| "Open link" used `window.open` | Nit | It is a real anchor now: middle-click and "copy link address" work, and there is no popup-blocker risk. |
| A full sentence rendered in a 10 px label | Nit | It is its own line under the numbers line. |

### One pre-existing defect found by the regression walk

The extension's popup search 500s on any query of three or more characters, and
so does the library's own search. The cause is in `server/db.ts`:

```ts
bookmarks_fts match ${`+${fullText}*`}   // ← `+term*` is not valid FTS5
```

`+term*` is FTS3/4 syntax; FTS5 wants a quoted string followed by `*`. Every
query that reached the full-text index therefore raised
`fts5: syntax error near "+"`. The bug is **pre-existing** — the line is
byte-identical in `f2fe04b` and was not touched by this change — and it went
unnoticed because `server/db.search.test.ts` only exercised the pure helpers,
never the query itself.

Fixed to `"${fullText}"*`, with the DB-backed test that was missing: the new
test fails with the old syntax and passes with the fix. Search now returns
results for three-or-more-character terms, and the extension's popup search
works.

This was outside the sentinel layer's scope, but the brief required walking the
extension's save/search surface, and a 500 in a required surface is a defect
rather than a finding to leave in place.

### Second review pass — findings and fixes

A second independent pass over the same change found four more issues, all
fixed:

| Finding | Severity | Fix |
|---|---|---|
| The `dismissed` count included links that were never part of the report (a link whose status did not change is in no section, but a dismissal for it was still counted) | Suggestion | The section membership is decided first; only links that would have been shown can be counted as dismissed. An unchanged link is also skipped before its history is read, so the run does less work |
| "Ignore until the next check" had **no visible effect** — the report is a snapshot, so the item stayed exactly as it was and the dismissal was invisible | Suggestion | The card now shows the outcome in place of the action («Ignored until the next check»). The dismissal is still persisted, so the next report leaves the link out |
| "Update the link to the new address" had no visible effect either, and **"Open link" still pointed at the old address**; the bookmark also kept the old redirect verdict after its address changed | Suggestion | The card shows the outcome, "Open link" follows the new address, and the server resets the health verdict to `unchecked` — the new address has not been checked, so saying so is honest |
| A newly landed report did not take over the card when the owner was reading an older one | Nit | The selection resets when a new report arrives; the shell badge remains the nudge |
| The timeline query could return an unbounded history for a bookmark checked for years | Nit | The payload is capped at 500 entries; the timeline renders 50 at a time anyway |

---

## 6. Retention estimate and the review trigger

Measured on this schema: **~134 bytes per row** (table + both indexes, with a
realistic URL and error string). Rows per year = `bookmarks × 52` (weekly).

| Bookmarks | Rows / year | Storage / year | 100 K rows reached |
|---|---|---|---|
| 100 | 5 200 | ~0.7 MB | ~2 years |
| 500 | 26 000 | ~3.5 MB | ~1 year |
| 1 000 | 52 000 | ~7 MB | ~2 years (at 1 000: 100 K ≈ 13 MB) |
| 5 000 | 260 000 | ~35 MB | ~5 months |
| 10 000 | 520 000 | ~66 MB | ~2.5 months |

SQLite has no engine-imposed row ceiling; the practical ceiling is the owner's
disk. At 134 bytes/row the **100 000-row trigger is reached long before storage
becomes a problem**, so the row count is the operative limit.

**Named review triggers — pruning becomes a separate task requiring the owner's
approval:**

- **Trigger A (row count):** `health_checks` exceeds **100 000 rows** (≈13 MB).
- **Trigger B (dated):** on or before **2027-04-20**, re-measure the row count and
  the table's share of the database file. If `health_checks` exceeds **70 %** of
  the file, pruning must be planned before that date.

Nothing is pruned today. History is additive and unbounded on purpose until the
owner decides otherwise.

---

## 7. Cost per digest

The narrative receives **aggregated facts plus the capped item lists** (six per
section) — never the bookmark list. `max_tokens` is 500 and the narrative is
capped at 120 words.

- **Estimate:** ~200–400 prompt tokens for a typical run, plus up to 500 output
  tokens.
- **Observed in testing:** the mocked-LLM fixture recorded **120 prompt / 40
  completion tokens**. The estimate is stored on the digest
  (`estimatedPromptTokens`) and shown in the footer before the narrative runs; the
  actual model and token counts are recorded and shown after.
- **In this environment no BYOK key was configured, so no real LLM call was made
  and no real money was spent.** The narrative path is covered by a mocked-LLM
  test that exercises the success, failure and poisoning branches.

---

## 8. Still open — needs a human

**The 30-second comprehension test (Spec 4 Step 4) is the one item that cannot
be executed here.** It needs a tester who has not seen the feature, and it
cannot be self-attested.

Script: open the library after a run, and within 30 seconds say **how many links
broke** and **what the first action on one of them** would be. Record who
tested, how many seconds, pass/fail. If it fails, the digest's first screen is
wrong — fix it before handoff, not after.

Everything else in Spec 4 has been executed. The accuracy spot-check was run
against recorded rows and confirmed in a real browser (see §4); the regression
walk covered the extension's save and search, the AI tag path, the health
surfaces, and the health policy.

---

## 9. Explicitly V2

- **Digest email delivery.** No notification service exists in the codebase and
  none was added. Adding one changes the feature's cost classification and needs
  the owner's explicit approval first. Until then the digest is in-app only.
- **History pruning.** Parked until Trigger A or Trigger B fires.
- **Content-drift baselines.** Parked from the guardian concept — out of scope by
  the owner's decision, not forgotten.

Also out of scope, by the same decision: a standalone dashboard app, a new design
identity, and any new palette. The existing design system was reused by name
(`fihrist-card`, `fihrist-panel`, `fihrist-subtle-action`, `fihrist-danger`,
`fihrist-health-*`), with no new colours.
