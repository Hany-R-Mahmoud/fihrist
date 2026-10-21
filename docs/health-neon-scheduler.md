# Fihrist automatic health checks — Neon free scheduler

## Decision (2026-10-22)
The single Vercel Hobby daily cron cannot clear an adversarial 500-link fixture
within 48 hours under a 45-second drain budget. **Do not upgrade Vercel.**
Neon Free includes Functions + schedule triggers (Sep 2026), including the
fihrist project's Frankfurt region. Scheduled calls run Node.js 24 directly
on Neon, not on Vercel. The current web app stays on Vercel.

## Safety / activation
- Scheduler is **OFF by default**. `FIHRIST_ENABLE_CLOUD_WEEKLY_HEALTH=true`
  must be set on the deployed Neon Function **only after** full verification.
- Required Neon function env: `FIHRIST_MODE=cloud`, and optionally
  `FIHRIST_NEON_DRAIN_BUDGET_MS=240000` (60–600s). Neon injects
  `DATABASE_URL` for the function's own branch.
- Before activation, migrate `domain_pacing` in the **Neon production** DB,
  verify the unique open-weekly index, and test on a throwaway Neon branch.
- The scheduled endpoint accepts only Neon Trigger POSTs. Do not put its
  endpoint URL into an unauthenticated public scheduler.
- Keep Vercel's existing small daily cron for legacy mutation-job draining
  until Neon's worker is independently proven. It MUST NOT open weekly runs.
- Disabled flag means weekly auto-sweeps are hidden in the cloud UI; single
  manual checks and existing health history remain accessible.

## Deploy from a real local checkout after reviewing the PR
```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run check:runtime
neon functions deploy fihristhealth --src neon/functions/health.ts \
  --project-id spring-dream-59127345 --branch <verified-neon-branch> \
  --env FIHRIST_MODE=cloud --env FIHRIST_ENABLE_CLOUD_WEEKLY_HEALTH=false
neon triggers create --function-slug fihristhealth --name fihrist-weekly-tick \
  --cron '*/5 * * * *' --project-id spring-dream-59127345 \
  --branch <verified-neon-branch>
```
Do not enable the trigger on production until DB migration + verification
complete. Prefer creating it **disabled** via the Neon Console/API, then
enable with the function flag only after acceptance. Never paste credentials
into a command line; Neon's connection is injected.

## Throughput requirement
Budget: 4 workers, maximum one active check per host, 750ms end-to-start,
90s host lease; 240s per 5-minute tick, 576 tick opportunities in 48h.
This has sufficient **theoretical** time for 500 slow links, unlike the
single daily cron; it is NOT V2 acceptance evidence. Require the measured
500-link fixture time, check outcomes, invocations, and Neon Free quota
consumption before enabling.

## Release gates (still pending until proved)
- V1 scheduled Neon tick completes a real sweep on Neon and produces a
  linked digest, with DB evidence and elapsed time.
- V2 500-link fixture completes within 48h including same-host and
  consistent-404 scenarios; record wall clock, API calls, and invocations.
- Cross-invocation domain pacing: no overlapping same-host leases and an
  end-to-start gap of at least 750 ms, including timeouts.
- Rate-limit and quota checks using the Neon Free plan's current documented
  usage; test scheduled invoke under real load before enabling.
- Existing local-mode runner remains unchanged.

Docs: https://neon.com/docs/compute/functions/triggers/schedule
https://neon.com/docs/compute/functions/reference/runtime-limits
https://neon.com/docs/introduction/plans
https://vercel.com/docs/cron-jobs/usage-and-pricing
