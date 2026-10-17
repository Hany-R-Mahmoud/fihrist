# Fihrist — Final OAuth readiness handover

Verified 2026-10-17, Africa/Cairo. **NOT READY FOR MERGE**.

## Resources and configuration

- Existing branch: `feat/neon-dashboard-restoration`; Draft PR: https://github.com/Hany-R-Mahmoud/fihrist/pull/3. Starting head: `a21a3eace07fb5be13c71fc76560c039647530fc`. Fetched branch was 60 ahead / 0 behind main.
- Isolated checkout: `/private/tmp/fihrist-oauth-final`. Original dirty checkout on `feat/neon-auth-pwa-foundation` preserved.
- Google project **Fihrist**, ID `trans-serenity-511917-p8`, created under `audiobookstrial2@gmail.com` after explicit approval. No billing or extra APIs enabled by this run. Fihrist branding saved with the three new URLs and authorized domain `fihristy.vercel.app`; support/developer contact is the same account. External audience, only openid/email/profile selected and saved, no sensitive/restricted scopes. After explicit policy/publication approvals, Google reports **In production**. No logo uploaded. Focus Flow untouched.
- OAuth Web client **not created**. Form prepared as `Fihrist Production Web`, JavaScript origin `https://fihristy.vercel.app`, no redirect registered. Exact custom callback is not yet independently confirmed. Browser credential policy requires user takeover before entering/submitting new credentials to Neon; do not send them in chat.
- Neon project `spring-dream-59127345`, Production/main `br-nameless-flower-baau26aj`, database `fihrist`: Better Auth provisioned. Provider readback: Google **shared**, NOT custom.
- Verified base: `https://ep-mute-king-bawaaobf.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth`.
- Expected custom callback: `https://ep-mute-king-bawaaobf.neonauth.c-8.eu-central-1.aws.neon.tech/fihrist/auth/callback/google`. This is derived from the confirmed base; exact custom-provider callback remains unverified. Current shared-provider initiation followed once without sign-in returns Google redirect_uri `https://neonauth.c-8.eu-central-1.aws.neon.tech/auth/oauth/callback/google` (shared proxy). Do not register that shared callback for a custom client by assumption.
- Added/read back trusted origin `https://fihristy.vercel.app`; preserved `https://fihrist-fawn.vercel.app` and `https://fihrist-hany-mahmouds-projects.vercel.app`.
- Production social-sign-in initiation from the new Origin returned HTTP 200; its token-bearing initiation URL was followed without logging it, returning HTTP 302 to Google with the shared callback above. This does NOT prove Google consent, callback or sign-in. Original 403 was not reproduced; original cause remains unproven.
- Current Neon Google Configure dialog exposes only the shared-key warning and Update/Cancel, no custom credential fields or callback. Its Update action saved the existing shared configuration; shared status remained unchanged. The connector supports provider updates, but no credentials were generated, read or transmitted. A secure custom-provider entry flow and callback confirmation remain required.
- Keep `VITE_GOOGLE_OAUTH_READY` gated until valid custom configuration. No OAuth secrets exposed.

## Vercel and current Production

- Project `fihrist` / `prj_5u7VIXduJ4zxxdGUaK8zYV6OjnLc`; domain API confirms `fihristy.vercel.app`, verified, no branch override.
- https://fihristy.vercel.app/, https://fihristy.vercel.app/privacy.html and https://fihristy.vercel.app/terms.html return HTTP 200 with intended Fihrist titles/content.
- Current READY Production deployment: `dpl_5nuk1z8JmmHz61vss5wxtMdhiEF3`, commit `9ddb1bdbe3fb5a615102b45b7d321e726dc6f938`, ref `feat/fihrist-vercel-public-foundation`. It serves the older informational release, not the PR Dashboard.
- General project response had stale old aliases; dedicated domain endpoint and public requests establish the new domain.
- Effective root is repository root (live Root Directory blank). Root vercel.json retains exactly `"git":{"deploymentEnabled":{"*":false,"main":true}}`.
- Live Git UI: correct repository, no deploy hooks. Build UI: Ignored Build Step Automatic. No second deploymentEnabled map exposed; an independent remote branch map is NOT verified.
- Live build: Vite, output dist/public, Node 24.x, install override pnpm install --no-frozen-lockfile, build override selects build:web if present. No live settings changed.
- No merge, deployment, domain reassignment, workflow, additional Vercel project, or application-data write in Production. Neon changes: trusted-origin addition and saving the unchanged shared provider. The dedicated Google project/OAuth configuration was created as described above.

## Changes and verification

Files changed: README.md, client/index.html, client/src/pages/CloudSignIn.tsx, client/src/pages/CloudSignIn.test.tsx, server/_core/cloudAuth.test.ts, pnpm-lock.yaml, docs/portfolio.json, docs/neon/PRODUCTION_ROLLOUT_AND_OAUTH.md, this report.

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

1. Google project, branding, minimum scopes and publication are complete. Confirm the exact custom-provider callback through Neon's supported custom-provider setup; current shared callback differs. The present Console exposes no custom-key fields. Resolve that capability with Neon before registering the redirect.
2. Complete the prepared Fihrist Web client with that confirmed redirect. User must enter/submit credentials directly into Neon Production Auth through a secure supported flow (browser credential handoff requirement); verify custom status without exposing the secret. Do not paste credentials into chat, logs, Git or this report.
3. Verify Vercel Production environment alignment: client/server cloud mode, both Auth base URLs use Production/main, restricted DB role, CRON_SECRET. Set VITE_GOOGLE_OAUTH_READY=true only when setup is valid; VITE_ changes require rebuilding.
4. Review PR #3 and remaining OAuth/isolation blockers. Keep Draft. Do not merge or deploy in this run.
5. After approved merge into main, verify its automatic Production deployment becomes READY and the new commit serves fihristy.vercel.app. Never manually promote the feature branch.
6. On that origin verify Google consent/callback to /library, reload, signed JWT/tRPC, sign-out/return, cross-device CRUD/import/export, two-account read/update/delete/tag/collection isolation and forged IDs, Guest preservation/no upload, cron authorization and PWA. Recheck all three public URLs.

Full end-to-end acceptance needs the reviewed PR implementation deployed; HTTP 200 and build success do not prove Google Sign-In.

