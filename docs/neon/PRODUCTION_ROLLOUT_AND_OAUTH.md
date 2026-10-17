# Fihrist — Production rollout: current state and Google OAuth handover

Updated: 2026-10-17

This is the source of truth for work on `feat/neon-dashboard-restoration`. **Do not treat a successful build as proof that login or cloud CRUD works.**

## Completed

- Existing Fihrist Dashboard preserved at `/library` and public Landing Page restored at `/`.
- Guest Mode routes all tRPC workspace operations through browser-only IndexedDB; browser local storage holds a guest-mode flag, not the bookmark library. Guest supports bookmark/collection/tag CRUD, search, Netscape HTML import/export. Guest link-health background checking and AI processing are not available.
- Browser app manifest, generated 192/512/maskable PNGs, offline shell and safe static-only Service Worker.
- Server-only PostgreSQL connector, cloud CRUD adapter, signed-JWT middleware, browser Neon Auth client, private tRPC serverless function, DB health endpoint.
- Vercel Functions worker processing for bookmark saves, a daily protected Cron fallback for missed jobs. No GitHub Actions.
- Vercel Git auto-deploy gate in `vercel.json`:
  `"git":{"deploymentEnabled":{"*":false,"main":true}}`.
  Automatic deployments from feature branch commits disabled when this configuration takes effect. **Any** push to `main`, including a merge, may deploy; this is not merge-only enforcement without branch rules.
- Actual Neon Production Auth and application tables are **provisioned**.
- Restricted SQL-created production role has privileges only for Fihrist application tables, no access to `neon_auth` user/session records and no bypass-RLS or admin memberships. Production credentials and `CRON_SECRET` are stored in Vercel Production env vars, not in Git.

## Production resources

| Setting | Value |
|---|---|
| Repo | https://github.com/Hany-R-Mahmoud/fihrist |
| PR | https://github.com/Hany-R-Mahmoud/fihrist/pull/3 |
| Vercel project | `fihrist` / `prj_5u7VIXduJ4zxxdGUaK8zYV6OjnLc` |
| Intended production domain | https://fihrist-fawn.vercel.app |
| Neon Project | `spring-dream-59127345` |
| Neon Production DB branch | `main` / `br-nameless-flower-baau26aj` |
| Neon Production database | `fihrist`, PostgreSQL, Frankfurt |
| Neon Auth | Better Auth on production/main |
| Public production Auth URL | `https://ep-mute-king-bawaaobf.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth` |
| Production Auth Google provider | **SHARED — NOT CUSTOM CONFIGURED** |
| Production role | `fihrist_web_prod` (limited; credential held only in Vercel production config) |

## Google OAuth — only the Fihrist production client, not Focus Flow

**Pending interactive Google Cloud Console steps (Codex):**

1. Locate an existing **Fihrist** Google Cloud project, if present. Otherwise create a new project for **Fihrist**, without billing or unrelated APIs. **Do not edit Focus Flow**.
2. Configure OAuth branding as **Fihrist**, with support email, app homepage **https://fihrist-fawn.vercel.app/** and privacy policy **https://fihrist-fawn.vercel.app/privacy.html**, terms **https://fihrist-fawn.vercel.app/terms.html**. Google may need public, reachable branded URLs (the current live URLs exist).
3. Audience **External** and Testing (or an already-approved production publishing status). Add the intended Google tester accounts. Only scopes: `openid`, `email`, `profile`.
4. Create or reuse a Fihrist-specific OAuth **Web application** client. Register **exact Google redirect URI**:
   `https://ep-mute-king-bawaaobf.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth/callback/google`
   Register authorized JS origin `https://fihrist-fawn.vercel.app` if required by the selected OAuth client flow.
5. Configure the Google Client ID and Client Secret **directly in Neon Production Auth**, updating provider `google` from **shared** to **custom**. Keep the secret out of terminal logs, chat, Git and PRs. Do not use the Preview Auth callback or its keys for Production.
6. Production Neon Auth allowed redirect origins include `https://fihrist-fawn.vercel.app` and `https://fihrist-hany-mahmouds-projects.vercel.app`. Verify exact origin used by the browser and callback before changing any allowlist.
7. Once custom Google Sign-In works, set the Vercel Production **public feature flag** `VITE_GOOGLE_OAUTH_READY=true` (currently omitted/false to avoid a known broken Google button). No Google secret belongs in `VITE_*`.
8. Test Google sign-in on **production origin**, callback into `/library`, a browser refresh and sign-out; verify two Google accounts have completely separate bookmark/tag/collection data. If this fails, report the exact failing URL/status, but never secret or OAuth code.

**Important:** Shared Google provider / old Preview 403 does not guarantee Production OAuth will work. A successful Neon Auth provision only proves the auth service exists, not that Google consent and redirect are correctly configured. Neon JWT verification on the API requires valid signed user tokens.

## Final rollout verification before merge/promotion

- Typecheck, original Vitest suite, Vite PWA build and install icon validation.
- Guest IndexedDB: create, edit, search, import/export, reload persistence, backup warning and no API sends.
- Cloud authenticated flow: session, CRUD, import/export, cross-account isolation, forged IDs blocked, guest data remains local.
- Production environment variables resolve to **main**, not Preview; DB role cannot read `neon_auth`.
- Job processing and Vercel Cron route authorization, failed/retried link health status.
- Auto-deploy only on `main` (branch-side `git.deploymentEnabled` config). No workflows added.
- After OAuth acceptance and functional checks, merge PR to `main`, confirm the **new Production deployment** is READY on https://fihrist-fawn.vercel.app and sign-in/Guest work.

## Not yet implemented / intentionally deferred

- Full Chrome **automatic** bookmarks synchronization (Chrome extension currently targets only localhost).
- Automatic migration of older local SQLite files or Guest storage into signed-in Neon accounts.
- Device-specific iOS/Android installation QA, beyond static PWA files.
- Production cloud account deletion UI; handle privacy requests through the maintainer contact meanwhile.
