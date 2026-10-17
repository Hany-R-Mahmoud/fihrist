# Fihrist — Final OAuth readiness handover

Verified 2026-10-17, Africa/Cairo. **NOT READY FOR MERGE**.

## Resources and configuration

- Existing branch: `feat/neon-dashboard-restoration`; Draft PR: https://github.com/Hany-R-Mahmoud/fihrist/pull/3. Starting head: `a21a3eace07fb5be13c71fc76560c039647530fc`. Fetched branch was 60 ahead / 0 behind main.
- Isolated checkout: `/private/tmp/fihrist-oauth-final`. Original dirty checkout on `feat/neon-auth-pwa-foundation` preserved.
- Google project **Fihrist**, ID `trans-serenity-511917-p8`, created under `audiobookstrial2@gmail.com` after explicit approval. No billing or extra APIs enabled by this run. Fihrist branding saved with the three new URLs and authorized domain `fihristy.vercel.app`; support/developer contact is the same account. External audience, only openid/email/profile selected and saved, no sensitive/restricted scopes. After explicit policy/publication approvals, Google reports **In production**. No logo uploaded. Focus Flow untouched.
- OAuth Web client **created** after action-time approval: `Fihrist Production Web`, Client ID `206272390715-6a8eq3d236jd0rmkeuhfvbm326upd8vi.apps.googleusercontent.com`. JavaScript origin `https://fihristy.vercel.app`; redirect registered to the branch-specific custom callback below. Secret is excluded from chat, logs and Git. Credentials were applied through the authenticated Neon plugin; the temporary mode-0600 handoff file was deleted and the one-time dialog closed.
- Neon project `spring-dream-59127345`, Production/main `br-nameless-flower-baau26aj`, database `fihrist`: Better Auth provisioned. Provider readback: Google **custom credentials configured**; the API serializes this as `type: standard` (not `shared`), with the Fihrist Client ID and a redacted secret.
- Verified base: `https://ep-mute-king-bawaaobf.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth`.
- Confirmed custom callback: `https://ep-mute-king-bawaaobf.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth/callback/google`. Current [Managed Auth OAuth documentation](https://neon.com/docs/auth/guides/setup-oauth) explicitly specifies the full branch Auth base URL plus `/callback/google`, including its database/auth path. Registered this callback, not the shared proxy. Runtime custom-provider initiation confirms exactly this callback and the new Fihrist Client ID; the shared proxy is no longer used.
- Added/read back trusted origin `https://fihristy.vercel.app`; preserved `https://fihrist-fawn.vercel.app` and `https://fihrist-hany-mahmouds-projects.vercel.app`.
- Production social-sign-in initiation from `https://fihristy.vercel.app` returned HTTP 200 with matching CORS origin, followed by HTTP 302 to `accounts.google.com`. Public redirect parameters match the Fihrist Client ID and exact branch callback; scopes are only email/profile/openid. Token-bearing URLs and state were suppressed. This verifies initiation, not completed Google consent or a signed-in session.
- The Neon Console field limitation was resolved using the authenticated Neon plugin and the [supported existing-provider PATCH API](https://api-docs.neon.tech/reference/updatebranchneonauthoauthprovider), supplying `client_id` and `client_secret` only for Production/main Google. Independent provider/config readbacks confirm `standard`, the Fihrist Client ID, and redacted secret. No separate Neon API key or user credential takeover is required for this connector route.
- Production `VITE_GOOGLE_OAUTH_READY=true` was saved after provider and redirect verification. It takes effect only on the next approved build. Google credentials remain in Neon Auth.
- Continuation readback: Vercel Production `FIHRIST_MODE=cloud`, `VITE_FIHRIST_MODE=cloud`; both Auth base variables match Production/main exactly. `DATABASE_URL` and `CRON_SECRET` exist as encrypted Production-only values (not decrypted in this continuation). `VITE_GOOGLE_OAUTH_READY=true` was created for Production only and independently read back. Prepared public configuration is in `.env.example`. Existing deployments and Preview variables were not changed.

## Vercel and current Production

- Project `fihrist` / `prj_5u7VIXduJ4zxxdGUaK8zYV6OjnLc`; domain API confirms `fihristy.vercel.app`, verified, no branch override.
- https://fihristy.vercel.app/, https://fihristy.vercel.app/privacy.html and https://fihristy.vercel.app/terms.html return HTTP 200 with intended Fihrist titles/content.
- Current READY Production deployment: `dpl_5nuk1z8JmmHz61vss5wxtMdhiEF3`, commit `9ddb1bdbe3fb5a615102b45b7d321e726dc6f938`, ref `feat/fihrist-vercel-public-foundation`. It serves the older informational release, not the PR Dashboard.
- General project response had stale old aliases; dedicated domain endpoint and public requests establish the new domain.
- Effective root is repository root (live Root Directory blank). Root vercel.json retains exactly `"git":{"deploymentEnabled":{"*":false,"main":true}}`.
- Live Git UI: correct repository, no deploy hooks. Build UI: Ignored Build Step Automatic. No second deploymentEnabled map exposed; an independent remote branch map is NOT verified.
- Live build: Vite, output dist/public, Node 24.x, install override pnpm install --no-frozen-lockfile, build override selects build:web if present. Only the Production public OAuth readiness flag was changed; build settings were preserved.
- No merge, deployment, domain reassignment, workflow, additional Vercel project, or application-data write in Production. Neon changes: trusted-origin addition and configuring the existing Google provider with Fihrist custom credentials. The dedicated Google project/OAuth configuration was created as described above.

## Changes and verification

Files changed: README.md, client/index.html, client/src/pages/CloudSignIn.tsx, client/src/pages/CloudSignIn.test.tsx, server/_core/cloudAuth.test.ts, pnpm-lock.yaml, docs/portfolio.json, docs/neon/PRODUCTION_ROLLOUT_AND_OAUTH.md, this report.

OAuth continuation also updates `.env.example` with commented Production configuration and `docs/portfolio.json` with verified configuration status. Focused auth regressions rerun: **9 passed**. Installed `@neondatabase/auth` 0.5.0-beta injects the `set-auth-jwt` response header into session data; its `getJWTToken` loads that session token. Existing browser header and server signature/expiry/issuer verification remain aligned with this installed version. No real signed-in sessions or two-account cloud acceptance were available. Do not substitute newer SDK examples without a version migration.

- Fixed stale lockfile: declared Neon Auth/serverless, jose and Vercel functions dependencies were absent. Initial frozen install failed ERR_PNPM_OUTDATED_LOCKFILE. CI-mode offline frozen install subsequently passed with the repaired lockfile.
- Updated canonical homepage and active documentation to the new URL.
- Failed Google initiation preserves Guest Mode; copy accurately describes local Guest storage and signed-in access. Production does not require verified email.
- JWT tests use real fixture signatures and a local JWKS resolver: wrong key/issuer, expired/missing expiry, invalid subject, missing bearer rejected; admin claim cannot grant admin.
- Typecheck PASS. Full suite PASS: **18 files, 65 tests**. Production build and build:web PASS; generated PWA icons verified by build. Existing large-chunk and dependency peer warnings remain. Local Node 22.22.3 differs from configured Vercel 24.x.
- IAB local Guest PASS: landing to Dashboard, save bookmark, reload persistence, add/search tag, visit sign-in and return with data intact. Google button correctly disabled.
- Collections/import/export retained; not manually tested this run. PWA device install/offline runtime and live jobs/cron not tested.
- Production schema column names/types compared with drizzle/neonSchema.ts: inspected mapping matches.
- Restricted role fihrist_web_prod can query application data; cannot access neon_auth schema, has no superuser/BYPASSRLS; only membership fihrist_runtime, no admin option.
- Database RLS disabled. Source ownership filters inspected. Real two-account isolation/forged-ID CRUD, Google session reload/logout/return, actual Neon JWT/tRPC and cross-device persistence remain **NOT VERIFIED**.
- Guest source has separate IndexedDB and does not upload on sign-in; no claim of packet-level network capture.

## Remaining steps

1. Google project, branding, minimum scopes, publication and Web client creation are complete. The custom callback is confirmed by current official docs and registered with Google. Do not use the shared proxy callback.
2. Custom credentials are configured and runtime initiation is verified. Neon API calls the custom-credential provider `standard`; do not expect a literal `custom` API enum. No credential handoff remains.
3. Production public cloud-mode/Auth variables match main; encrypted DATABASE_URL and CRON_SECRET are present. The readiness flag is now true for the next build. No deployment was made.
4. Review PR #3 and remaining OAuth/isolation blockers. Keep Draft. Do not merge or deploy in this run.
5. After approved merge into main, verify its automatic Production deployment becomes READY and the new commit serves fihristy.vercel.app. Never manually promote the feature branch.
6. On that origin verify Google consent/callback to /library, reload, signed JWT/tRPC, sign-out/return, cross-device CRUD/import/export, two-account read/update/delete/tag/collection isolation and forged IDs, Guest preservation/no upload, cron authorization and PWA. Recheck all three public URLs.

Full end-to-end acceptance needs the reviewed PR implementation deployed; HTTP 200 and build success do not prove Google Sign-In.

