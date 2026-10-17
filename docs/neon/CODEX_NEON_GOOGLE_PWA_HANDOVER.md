# Fihrist — Neon + Google Sign-In + PWA: Codex Handover

**Prepared:** 2026-10-16  
**Repository:** https://github.com/Hany-R-Mahmoud/fihrist  
**Work branch:** `feat/neon-auth-pwa-foundation` (branched from merged `main`)  
**Status:** Infrastructure preview foundation done; **application integration, Google Cloud, tests, and deployment NOT done**.

## 0. Goal and boundaries

Convert Fihrist from a **local-only React/Vite + Express/tRPC + SQLite bookmark library** into an **installable, secure mobile-accessible PWA**, backed by a dedicated **Neon PostgreSQL** project and **Neon Managed Better Auth / Google Sign-In**. Preserve existing bookmarks, tags, collections, metadata, AI tags, health checks, Chrome extension and local data. **Do not deploy, merge, or enable GitHub Actions.** Open a PR from this feature branch *after implementation and checks*, then stop for review.

**Security gate:** The current `server/_core/sdk.ts` authenticates every request as `local-user` without checking credentials, and the server binds to `127.0.0.1` for safety. **Never expose that implementation on the internet, put it behind a public URL, or point a public PWA at it.**

## 1. Verified Neon foundation (already performed in ChatGPT)

| Resource | Actual value |
|---|---|
| Project | `fihrist` |
| Neon project ID | `spring-dream-59127345` |
| Region / DB | `aws-eu-central-1` / PostgreSQL 17 / database `fihrist` |
| Production/main DB branch | `main` / `br-nameless-flower-baau26aj` |
| **Preview/test DB branch** | `preview/fihrist-neon-auth-pwa` / `br-twilight-frog-bavlqcr2` |
| Preview Auth | Managed Better Auth, display name **Fihrist** |
| Preview Auth base URL | `https://ep-rough-moon-babz891l.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth` |
| Preview Auth JWKS | `https://ep-rough-moon-babz891l.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth/.well-known/jwks.json` |
| **Google Web redirect URI** | `https://ep-rough-moon-babz891l.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth/callback/google` |
| Auth status | Google provider is **SHARED** (not custom), no Google Cloud client added; localhost allowed, trusted domains currently empty |
| App schema **only on Preview** | `fihrist`: `collections`, `bookmarks`, `tags`, `bookmark_tags`, `bookmark_jobs`, `ai_tag_suggestions`, `health_check_settings` |
| Preview database sample/data | **0 bookmarks**; no local SQLite data migrated |
| Dedicated app grants | `fihrist_runtime` group role, **NOLOGIN**, only `fihrist` schema DML. SQL-role verification: no membership, no BYPASSRLS, cannot SELECT `neon_auth.user` or `neon_auth.session`. |
| Production database schema/Auth | **Not provisioned** on main; no app tables |
| Vercel project | No accessible Vercel project named `fihrist` was found in the connected team |

**IMPORTANT on roles:** Neon roles created by API/Console automatically inherit `neon_superuser` and may read Auth secrets/data. An inadvertently created privileged `fihrist_app` role was **deleted**, not used. Use SQL (not the Neon role API/Console) to create any runtime LOGIN role with least privileges. To prepare private credentials locally, create `fihrist_web` via Neon SQL Editor with a strong generated password, then `GRANT fihrist_runtime TO fihrist_web`. Keep the password in ignored local environment/secure Vercel configuration, never in this repo/PR/chats. Verify `fihrist_web` has **no** `neon_superuser` membership, no `BYPASSRLS`, and cannot select any `neon_auth` table. **Do not activate cloud mode until this is verified.**

The preview app schema includes UUID `user_id` foreign keys to `neon_auth."user"(id)`, 12 FK constraints, and key uniqueness/index constraints. Cross-user link-to-collection and bookmark-to-tag relationships are guarded with composite `(id,user_id)` foreign keys. These are *schema safeguards*, **not complete application authorization**. Row-level-security policies are **not enabled**: enforce user filtering on every server query and explicitly test account isolation. Evaluate additional fail-closed RLS if feasible with authenticated request transactions.

**No existing SQLite file was uploaded, read from the user's machine, deleted, or migrated.**

## 2. Split of responsibilities

**Already done here (ChatGPT + Neon):**
- Confirm repo merged PR #1; inspect project architecture.
- Create isolated Neon project, `main` and Preview branches.
- Provision **Preview** Neon Better Auth and name it Fihrist.
- Create seven application tables **on Preview only**, with owner-aware FKs, uniqueness/indexes.
- Create/verify the restricted NOLOGIN group `fihrist_runtime`, remove an overly powerful API-created role.
- Identify PWA absence and current local-only auth/hosting blockers.

**Codex tasks below (local checkout/browser/Google Console):** implement code and schema migrations, configure Google Cloud OAuth, securely wire preview envs, test, push, PR, stop. Codex should not repeat the above Neon project/branch creation.

## 3. Codex order of operations

### A. Inspect, create tests, and protect existing data
1. Open local checkout of `Hany-R-Mahmoud/fihrist`, confirm local `git status`, fetch `feat/neon-auth-pwa-foundation` and switch without discarding local work. Review `AGENTS.md`, `README.md`, `docs/portfolio.json`, `drizzle/schema.ts`, `server/db.ts`, `server/_core/sdk.ts`, `server/_core/index.ts`, `server/_core/localDatabase.ts`, `server/services/localJobRunner.ts`, `server/services/liveEvents.ts`, and client.
2. Run baseline `pnpm install --frozen-lockfile`, `pnpm run check`, `pnpm run test`, `pnpm run build`; record baseline failures separately.
3. Confirm the **SQLite data path and backup method**. Backup any existing local SQLite database before cutover; do not replace/remove it.
4. Prepare versioned Postgres/Drizzle migrations checked into this branch matching the verified Preview tables, tested on disposable DB. Do not silently change existing SQLite migrations or drop SQLite support until data preservation is proven.

### B. Implement secure cloud backend
1. Keep the existing local-only mode working by default. Introduce an **explicit cloud mode**, not an automatic fallback from cloud auth to `local-user`. Cloud requests require a **server-verified** Neon Auth session; unauthenticated protected API calls must return **401**. Never trust a client-supplied `user_id`.
2. Use a **server-only** Neon Postgres driver and restricted `fihrist_web` role; never put `DATABASE_URL` or any DB password/Google secret in frontend or Vite `VITE_*` variables. Implement correct session/cookie/CSRF/origin handling for React/Vite + Express/tRPC using current official Neon Auth guidance (do **not** blindly copy the Next.js-specific Al-Rawi wrapper).
3. Port the relevant `server/db.ts` methods to PostgreSQL, preserving search/pagination, de-duplication, notes, tags, collections, health states, AI tag approval, import/export, and queue behavior. Scope **every** read/write/delete to the authenticated UUID. Add cross-account tests including forged identifiers and foreign-key ownership.
4. **Full-fidelity, opt-in migration from SQLite:** after authenticating the desired Google account, import all relevant user data into that account's UUID; remap old integer IDs and relationships, preserve titles, URLs, normalized hashes, notes, metadata, tags, AI suggestions, timestamps, health checks and collections. Make import idempotent, transactional, log counts/checksums, and rollback safely. Do **not** silently import into the wrong Google account; do not auto-delete local database. Requeue unfinished background jobs safely rather than importing invalid locks.
5. Handle the long-running Express job runner, weekly checks, SSE, and SQLite backup strategy explicitly. **Vercel static hosting alone cannot replace this persistent Node job runner.** Decide/propose a viable always-on Node/worker or a tested serverless/cron redesign *before* any deployment. No paid infra without permission.

### C. Google Cloud / Neon OAuth (interactive browser, done by Codex)
1. First inspect Google Cloud for an existing **Fihrist** project/client. Reuse if appropriate; otherwise create an appropriately named Google Cloud project **Fihrist** without billing or extra APIs.
2. Google Auth Platform branding: app name **Fihrist** (NOT Neon); configure support email and audience External/Testing, add actual authorized tester accounts, confirm consent status. Only request basic sign-in scopes: `openid email profile`. No Gmail/YouTube API scopes.
3. Create/reuse **OAuth 2.0 Web application** client; **authorized redirect URI exactly**:
   `https://ep-rough-moon-babz891l.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth/callback/google`
   Do not replace that callback with `/auth/callback` on the app; that latter route is the **app** callback handled after managed Neon authentication. Add origins only when their actual scheme/host is known and required.
4. Configure the **custom Google provider** in the **PREVIEW Neon Auth branch** securely using the Web Client ID and secret; do not paste the secret in this Markdown, code, a PR, or chat. Verify Neon provider changes from `shared` to `standard/custom` and its secret is masked, and Google consent shows **Fihrist**.
5. Neon Preview trusted origins currently empty except implicit localhost. Once local/preview app origins are verified, allowlist only exact required origins. Do **not** use wildcard trusted origins. Keep any production/main Auth provider untouched.
6. Google account sign-in and logout with independent test accounts; verify session survives refresh, failed/denied callback is handled, cross-account isolation, and no accidental account reuse.
7. Google Console test-user configuration is **not yet done**; do not claim successful OAuth merely because Auth is provisioned.

### D. Installable PWA (same branch)
1. Add a Web App Manifest with name **Fihrist**, standalone display, `start_url=/library`, theme/background, proper 192/512/maskable app icons and iPhone touch icon.
2. Add carefully scoped Service Worker via current `vite-plugin-pwa` or equivalent. Cache **static build assets only**; **never cache** `/api/**`, `/api/trpc`, Neon Auth endpoints, authenticated HTML, OAuth responses, user bookmark data, or `Set-Cookie` responses. Clear stale SW/cache correctly on updates/sign-out where appropriate.
3. A PWA cannot read data from a server available only on `127.0.0.1` of a *different* computer. Installability via mobile requires a secure HTTPS origin and an accessible **authenticated backend**.
4. Retain mobile nav and UI; test keyboard dialogs, viewport safe areas, touch targets, loading/auth redirects, offline shell vs offline data messaging, and standalone OAuth on real Android/iPhone as possible. Add Web Share Target only after login/API/installation works; never share/save URLs without consent.
5. Keep `extension/manifest.json` (Chrome extension) separate from `client/public/manifest.webmanifest` (PWA).

### E. Verification and PR gate
- Baseline + new `pnpm run check`, `pnpm run test`, `pnpm run build`, unit and integration tests; regenerate `pnpm-lock.yaml` appropriately.
- Verify no path exposes `local-user` automatically in cloud mode.
- Unauthenticated protected API access must return 401; cross-site forged POST must be blocked; account A never sees/updates/deletes B data, including bookmarks, tags, collections and background jobs.
- Test migration from representative SQLite fixture and idempotency/cross-user imports; verify data counts, field equality, preserved links, and local database unchanged.
- Test Google branding **Fihrist**, custom provider, callback, sign-in/out/reload, tester status; no credentials in repo/build artifacts/logs.
- Test PWA installation, offline behavior, service worker API exclusions, and mobile navigation. Note any device tests not performed as NOT TESTED.
- Push all implementation/migrations/docs to existing branch `feat/neon-auth-pwa-foundation`, open one **new PR** targeting `main`, give link and checks, then **STOP**. No merge, deploy, workflows/GitHub Actions, or unrelated PR-comment fixes.
- Main Neon schema/Auth remains untouched until explicit later go-live approval; never point a shared Preview URL at main/production DB.

## 4. Expected Codex handoff result

Return a compact report with: Google Cloud project ID and branding/testing status; **Web Client ID only** (no secret); exact registered redirect URI; whether Preview Neon provider is custom; credentials/environment status without values; database role permissions and auth isolation check results; SQLite migration readiness/backup; hosting decision and server-background work plan; PWA manifest/install result; checks and blockers; branch/commit/PR URL. Stop.

## References
- Neon managed, branchable Better Auth: https://neon.com/blog/handling-auth-in-a-staging-environment
- SQL-created least-privilege roles vs API-created superuser roles: https://neon.com/docs/manage/roles
- Database permissions: https://neon.com/docs/manage/database-access
- Neon Auth integration patterns for React/Vite (verify current SDK before coding): https://neon.com/blog/teaching-ai-how-to-do-auth
