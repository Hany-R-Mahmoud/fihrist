# Google sign-in regression handover

Date: 2026-10-18 (Africa/Cairo).
Base: latest fetched `main`, `c72f5aa25f23ece1f2523ad2c0430e1b318e36b3`.
Branch: `codex/fix-google-signin-runtime`.

## Root cause

The project uses native ESM (`package.json` has `type: module`). Vercel emits JavaScript for the API functions, but extensionless relative import specifiers survive compilation. Node does not append `.js` when resolving an ESM import. The Production log identifies the first failing import: `server/services/cloudJobDrain` from `api/trpc/[trpc].js`.

The same problem exists throughout the transitive backend import graph, including the health endpoint. Two backend imports also depend on the TypeScript-only `@shared` alias. TypeScript uses `moduleResolution: bundler`, so its successful check does not establish that unbundled emitted JavaScript can load in Node. The Vite web build does not execute the API functions.

Read-only Production probes confirmed HTTP 500 `FUNCTION_INVOCATION_FAILED` from both `/api/health` and `/api/trpc/auth.me`. No Production settings or data were changed.

## Changes

- `api/health.ts`, `api/trpc/[trpc].ts`, `api/cron/jobs.ts`, and relative backend imports under `server/`, `shared/types.ts`, and `drizzle/relations.ts`: use emitted `.js` paths. Backend `@shared` imports now use relative paths. Runtime packages remain dependencies; no dependency or OAuth version migration was made.
- `client/src/lib/neonAuth.ts`: recover the pinned Neon SDK session on mount, focus, and page restoration; report pending/error states; retrieve a current JWT for each HTTP batch. No JWT or session credential is persisted by application code.
- `client/src/_core/hooks/useAuth.ts`: wait for session recovery before the cloud `auth.me` query; ignore cached member data after sign-out; keep Guest Mode independent of Neon availability.
- `client/src/main.tsx`: use the shared Authorization-header function. The bearer token still comes from the installed SDK's `getJWTToken`, which reads the recovered session and its `set-auth-jwt` token.
- `client/src/pages/CloudSignIn.tsx`: keep the callback destination at the current origin plus `/library`; request an OAuth URL with `disableRedirect: true`, clear only the Guest Mode flag, then navigate. This ensures SDK auto-navigation cannot interrupt clearing the mode flag. Recovering an existing session on the sign-in page opens `/library`.
- `client/src/pages/Landing.tsx`: reflect the recovered session and offer Open Library links.
- `client/src/App.tsx`: show a retry action for session/API failure instead of displaying a misleading signed-out form.
- Session/header, library gate, Google redirect ordering, and landing regression tests; `scripts/check-serverless-runtime.mjs`; `package.json` (`check:runtime`); `tsconfig.json` (include API entrypoints); README and portfolio facts.

## Checks

- Frozen-lockfile dependency installation succeeded.
- TypeScript passed using the repository compiler (`node node_modules/typescript/bin/tsc --noEmit`). One `pnpm exec tsc` invocation selected a different compiler and reported removed `baseUrl`; the repository-pinned TypeScript 5.9.3 passes without removing configuration.
- Full Vitest suite: 20 files, 73 tests passed. The final Guest Mode error-independence refinement also passed its focused two-test file.
- `pnpm run build:web` and `pnpm run build` passed. Vite reports its existing large-chunk warning.
- `pnpm check:runtime` passed: it transpiles backend/API sources, then executes the emitted ESM using plain Node, without tsx or Vite alias resolution. Health executes and deliberately reports database-unavailable without credentials; anonymous `auth.me` returns null; protected bookmark/collection routes and cron reject requests; a fake bearer token is rejected. Temporary output is removed afterward.
- `git diff --check` passed before the initial fix commit.

## Actual Vercel runtime evidence

Manual Preview deployment: `dpl_99nzikBatsTP1gbN1M516nVCNjmB`, source commit `5af80d5df6ad27935cc0ddd314739babf7ef39ba`.
URL: https://fihrist-7uel4172n-hany-mahmouds-projects.vercel.app/
State: READY. This is a Preview deployment (`target: null`), not Production.

The existing restricted Preview database and Auth settings were reused only for this bugfix branch after explicit user approval. Their values were not printed or committed. No Production credentials, OAuth configuration, schema, account, or session rows were changed.

| Request | Actual result |
| --- | --- |
| GET `/api/health` | HTTP 200, `{"status":"ready","database":"neon"}`; executes the database `select 1` |
| GET `/api/trpc/auth.me` without an app token | HTTP 200, `{"result":{"data":{"json":null}}}` |
| GET `/api/trpc/bookmarks.list` without an app token | tRPC `UNAUTHORIZED`, `httpStatus: 401`, `path: bookmarks.list`, observed with authenticated `vercel curl` |
| GET `/api/trpc/collections.list` without an app token | HTTP 401, application JSON with tRPC `UNAUTHORIZED` |
| GET `/api/trpc/bookmarks.list` with a deliberately fake bearer token | HTTP 401, application JSON with tRPC `UNAUTHORIZED` |
| GET `/api/cron/jobs` without a cron secret | HTTP 401, `{"error":"Unauthorized"}`; no job drain runs |

The connector successfully fetches health/auth.me but classifies protected-route 401 responses as deployment-authentication failures. It is not used as proof of application authorization. The official CLI uses existing Vercel authentication to reach the protected Preview; Vercel Deployment Protection remains enabled.

The final Guest Mode refinement changes only client hook error handling; serverless handler code is identical to the runtime-tested commit.

## Preserved boundaries and remaining acceptance

- `vercel.json` remains unchanged with `git.deploymentEnabled` exactly `{"*":false,"main":true}`. Feature-branch pushes do not request automatic deployments. The Preview was created explicitly through the Vercel API. The project summary API did not expose the separate live Git setting, so no independent live-setting equality claim is made.
- No merge, Production deployment, GitHub Actions, database migration, or Production data write was performed. The original dirty checkout remains untouched; work used `/private/tmp/fihrist-google-signin`.
- Guest IndexedDB storage, its database name/version, and account/guest separation were not changed. Clearing Guest Mode removes only its mode flag, never bookmarks.
- Completed Google sign-in, a real browser JWT, post-login cloud-library content, browser refresh after real OAuth, and real sign-out remain **Unknown / verify**. Initial Production browser inspection reached the sign-in form on `/library`; this does not establish whether a usable Neon session existed. Database session rows alone do not establish a usable browser session.
- Browser automation became unavailable with the explicit message `Local browser use is disabled in Work settings`. No other browser was substituted and no Production sign-in was performed. The new redirect/session tests use simulated SDK responses; they do not claim a real Google OAuth completion.
- Preview OAuth uses existing Preview settings. Production Google credentials, provider callback, and allowed origins were preserved; no new Preview OAuth trust was added. Real OAuth acceptance requires an allowed browser/origin and the account owner's normal Google sign-in.

After review, the acceptance sequence is: complete Google sign-in on an approved origin; confirm `/library` opens; refresh; return to `/` and use Open Library; sign out; refresh and confirm protected APIs no longer receive a bearer token. Perform deployment/merge only under separate authorization.
