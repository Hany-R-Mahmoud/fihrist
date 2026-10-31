# Fihrist usability overhaul — final local report

2026-10-31 · `main` · base `598b567` · local working-tree changes only.

Specs 0–12 have local implementations. **Full acceptance is not complete.** No commit, push, deployment, or production migration was performed. The user explicitly chose “كمّل المحلي وسجّل الاختبارات الخارجية غير متحققة”. Human/account tests are therefore recorded as unverified, never counted as passes.

<!-- TOKEN_POLICY_BATCHED_EXECUTION: final reconciliation replaces partial checkpoints and updates portfolio facts. -->

## Recon and Spec 0 gates

README and docs/portfolio.json were read before editing. The prompt names `5c4aae3`; this checkout starts at `598b567`. Library views remain within `/library`; the five existing routes remain.

| Assumption/check | Observed result |
| --- | --- |
| `health.shelves` | Actual current procedure is `topics.shelves`; existing grouping reused. |
| Weekly flag/Neon trigger | Current source explicitly retires automatic schedules (`cloudWeeklyHealthEnabled` returns false). No scheduler invented or restored. No evidence establishes a missing production flag/trigger. |
| Google sign-in visible | PASS for availability: live sign-in page offered Continue with Google. Completed login unverified. |
| Authenticated cloud sweep → digest | UNVERIFIED: no authenticated production session. This is not proof of a deployment defect. |
| Cloud extension | Original localhost-only defect confirmed in source. New cloud transport implemented; real installed/account flow UNVERIFIED. |
| Existing duplicate normalization | Did not strip all required tracking/trailing-slash variants; shared duplicate comparison normalization added without changing safety normalization. |
| Analytics 400 placeholder | NOT FOUND in current app/index/Vite source. No fake replacement added. |
| Vercel baseline | Local `vercel.json` already has exactly `git.deploymentEnabled: {"*":false,"main":true}`. Remote setting unverified. |

No missing deployment component was proven, so no flag/trigger is falsely named as `BLOCKED-DEPLOYMENT`.

## Per-task status

Implemented means code in this checkout, not deployed or accepted in production.

| Task / Spec | Status | Delivered and evidence |
| --- | --- | --- |
| T0 / 0 | Recon complete; live partial | Source facts and live gates above. |
| T1 / 1 | Implemented locally | Four sections, counts/view-all, reading fallback, health reasons, existing shelves/dismissals, empty explanations/actions. Existing BookmarkCard/tokens reused. Responsive captures; stranger acceptance remains open. |
| T2 / 2 | Implemented locally | Both schemas and reversible migrations; four reading states/star/pin, owner-scoped mutation, guest storage; pinned-first list/search cursor and shelves. Real SQLite defaults/isolation/pagination/filter/rollback tests. Dependent views refresh. |
| T3 / 3 | Implemented locally | Global Cmd/Ctrl+K uses existing search/add, URL save inline, arrows/Enter/Esc, typing-field protection. Component tests and actual local save. |
| T4 / 4 | Implemented locally | Select-all, Shift ranges, singles, live count, move/tag/remove/create-and-move. Existing bulk procedures; over 100 explicitly refused. Browser moved 20; delete dialog showed 2 and was cancelled. |
| T5 / 5 | Implemented locally | Collection/health/topic/domain/date/reading/pinned AND filters in local/cloud adapters and guest search/list. Removable chips, clear-all, total and empty result. Saved filter reapplied in browser. |
| T6 / 6 | Implemented, display only | Existing health icons/language; existing archive lookup/replace on broken cards with confirmation. Stored check fields hydrated correctly; verdict engine/policy untouched. |
| T7 / 7 | Implemented; account acceptance open | Production and local permissions; session bridge on app origin; no raw token stored by extension; sign-in state/action. Fresh install opens sign-in; existing local setting retained on upgrade. Shared popup/context-menu path. Transport tests; installed cloud flow unverified. |
| T8 / 8 | Implemented locally | Parent FK, scoped collection names, collapsible tree, drag/drop, keyboard parent selector; owner/cycle refusal. Real nested import, case-insensitive sibling matching, prior flat folders retained, partial-failure receipts, count-confirmed exact-ID undo. Real SQLite fixture/rollback tests. |
| T9 / 9 | Implemented locally | Deterministic exact/tracking/title/content candidates and evidence; all titles shown before merge; oldest kept, tags unioned, notes appended, oldest collection retained. Atomic tag union/update/delete; survivor history retained, no fabricated merged history. Real fixtures. |
| T10 / 10 | Implemented locally | List/rename/merge/delete, affected counts, source-aware tag links, per-owner deleted-name blocklist. Tests verify both automatic and topic recompute do not resurrect deleted tags. |
| T11 / 11 | Implemented locally | Persisted full query/filter combinations, sidebar apply/rename/delete, guest IndexedDB. Actual local save/reapply observed. Search deletion never touches bookmarks. |
| T12 / 12 | Implemented locally | Deterministic habits through completed-run digest hook and refresh on open; added/tags/status counts/oldest unread five. Date-grouped timeline with stored health transitions; clusters reuse shelves. Promotion uses single-collection move fallback, count and per-item approvals. Guest export notice before content. Analytics mismatch reported. |
| T13 | Local verification/report delivered; acceptance partial | Matrix and remaining work below. |

## Required verification matrix

Evidence directory: `/Users/hanyramadan/.codex/visualizations/2026/10/31/01a1939f-a032-72c1-91a0-d5cd9cf9561b/fihrist-evidence`.
All local browser mutations used isolated synthetic temporary databases, not the user's real library.

| Check | Outcome | Evidence / exact limits |
| --- | --- | --- |
| V-STR | UNVERIFIED | Participant: none; exposure/answer/pass/fail: not recorded. Blocks a full acceptance “done” claim. |
| V-SEC | Local PASS | Eight `sections-{1440,375}-{light,dark}-{ar,en}.jpg` captures; `sections-empty-ar.jpg`, `sections-empty-375-ar.jpg`. Four populated/empty sections. Empty mobile page width equals 375px viewport. |
| V-CMD | Local PASS | `command-saved-inline.jpg`. Ctrl+K → URL → ArrowDown/Enter → inline Saved; stayed `/library`. Search arrows/Esc and typing-field protection observed. A second keyboard search used ArrowDown/ArrowUp/Enter and opened the selected fixture at `https://example.org/fihrist-demo/2` in a new tab; dialog closed. Component tests cover add/sign-out. |
| V-BULK | Local PASS | Shift first-to-twentieth → count 20 → counted confirmation → new QA selection 20 collection held 20. Selected 2 → delete count 2 → Cancel. `bulk-confirm-20.jpg`, `bulk-moved-20.jpg`, `bulk-delete-count.jpg`. |
| V-EXT | PARTIAL | `server/extension.transport.test.ts` executes shared JS with mocked Chrome: cloud relay save/search, no-tab/sign-out errors, localhost HTTP, unknown-host refusal. No installed cloud/local popup/context-menu end-to-end test. |
| V-IMP | Local PASS | `server/import.tree.test.ts`: Work/Reading, Work/Later, matching, preserved existing URL/flat folder, cycle refusal and exact inserted-ID undo. Organization migration rollback test preserves bookmarks. |
| V-DUP | Local PASS | `server/usability.facts.test.ts`, `server/libraryOrganization.test.ts`: exact/UTM/title/content/unrelated fixtures; oldest/tags/notes/collection merge outcome. |
| V-TAG | Local PASS | Real SQLite rename/merge/delete counts and owner isolation; next automatic AND topic recompute cannot resurrect deleted names. |
| V-HEALTH | Automated PASS; live cloud open | Existing server/client tests include health, progress, timeline, digest/narrative and SSRF. Policy and `linkSafety.ts` diff exits 0. Local app runs. Authenticated production check/sweep/digest unverified. |
| V-LIFE | Local PASS | Initial fixture: 24 added, 21 unread/3 reading, tag counts 24. After command save: 25 added, 22 unread/3 reading. Timeline/clusters rendered. Promotion approved one member and rejected 23; only approved member moved. `timeline-local.jpg`, `clusters-local.jpg`, `promotion-count.jpg`, `promotion-per-item.jpg`. |
| V-A11Y | PARTIAL | Labels/native controls/Radix dialogs, pressed/expanded state, count live announcements, focus rings/restore; actual command/dialog keyboard paths. Hover movement is motion-safe. Full every-surface keyboard audit and browser reduced-motion emulation not completed. |
| V-REPORT | Delivered | This recon/status/evidence/decision report and [copy table](usability-copy-table.md). |

Final automated results and retained machine output: `fihrist-evidence/verification.md` and `fihrist-evidence/tests.json`. PostgreSQL SQL exists and adapter typechecks; no production migration or cloud execution is claimed.

## Decisions

- Duplicate title Jaccard ≥0.8; content word Jaccard ≥0.9, first 4,000 stored characters, minimum 10 distinct words. Connected candidates form transitive groups. No fetch/AI. Review limit 10,000 links, merge limit 100; combined notes over 20,000 characters refused before changes. No silent truncation.
- Data still has one collectionId. Promotion **moves only individually approved members**, with original collection change explicitly disclosed. No dual membership invented. Oldest duplicate's collection wins.
- Habits week starts Monday 00:00 UTC. Saved facts only; refresh on read plus existing completed-full-run hook. No scheduler restored.
- Extension requires an open signed-in production Fihrist tab for its same-origin bridge. Session stays in the app; extension stores server preference only. No open app tab produces a clear sign-in/open-app message.
- Guest IndexedDB supports new organization/reading/life features. Network health/AI stay unavailable. No automatic account migration or new cloud offline-cache mechanism; export/import remains the migration route.
- Reversing tree migration can conflict when equal names exist in different branches. Down migration refuses rather than discard/rename data; conflicting names must be renamed before rollback.
- Existing visual tokens/fonts/palette untouched. Existing deterministic topic rules extracted for shared guest/account use. No new health verdict, scheduler, AI surface, semantic search, graph, native app or theme.

## Owning files and procedures

- App integration: `client/src/App.tsx`, `pages/Home.tsx`, `DashboardLayout.tsx`; new `LibraryOverview`, `ReadingControls`, `LibraryCommandBar`, `LibraryDialogs`, `CardRecovery`, `CollectionTree`, `LibraryCleanup`, `LibraryLife`, `ExtensionBridge`; `lib/guestLibrary.ts`.
- Data: both Drizzle schemas, SQLite 0005–0007 and Postgres 0003–0005 forward/down SQL, SQLite journal; `server/db.ts`, `cloudDb.ts`, `libraryRecords.ts`, `libraryOrganization.ts`.
- Reused procedures: existing bookmark add/search/list/move/bulkMove/bulkAddTag/bulkRemove/tag/notes/import/export; collections, topics.shelves/dismiss, digest.lookupArchive/replaceArchive, existing health/timeline/digest and optional AI procedures.
- Added/extended: `bookmarks.updateReading/importReceipts/undoImport`, list/search filters; `collections.createNested/reparent`; `tags.list/govern`; `duplicates.list/merge`; `savedSearches.list/save/remove`; `life.overview/habits`.
- Shared facts: `duplicates.ts`, `habits.ts`, `libraryFilters.ts`, existing rules extracted to `topicRules.ts`/`topicGrouping.ts`; existing bookmarkUtils/topicShelves/rotDigest, new libraryLife service.
- Extension manifest/popup/background/options and new api/content bridge. Tests and temporary fixture seeder. Stale Neon/rot-digest mocks updated to actual existing contracts; explicit React import fixes standalone HealthReasonIcon render; compiler target ES2022.

## Not done / not claimed

1. Human stranger test: external person unavailable; user accepted unverified.
2. Installed extension cloud save/search/context menu, completed Google login and real localhost popup: authenticated/installed environment unavailable; user accepted external tests unverified.
3. Authenticated production sweep/digest and two-account isolation: no production fixture/session. No guessed missing deployment flag/trigger.
4. Production Postgres migration/rollback/RLS execution: supplied SQL, no production mutation.
5. Complete keyboard-only audit of every new surface and actual reduced-motion emulation: targeted paths/source constraints only. Accessibility acceptance remains partial.
6. Commit/push/deploy and remote Vercel setting check: not performed.
7. Serverless runtime script was not rerun in final batch because the central test policy rejected that extra check. Typecheck/build/tests are recorded separately.

The prior short run was incomplete. This report supersedes it and separates implemented code, verified local behavior and unverified acceptance.
