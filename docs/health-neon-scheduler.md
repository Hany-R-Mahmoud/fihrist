# Fihrist Health Engine 2.0 — Free Neon worker and acceptance runbook

## Superseded: on-demand checks (2026-10-31)

The project now runs health checks only on explicit user request. The Vercel
cron configuration is removed, its authenticated legacy endpoint does no work,
the local weekly timer is removed, and the Neon schedule gate always returns
false even if the old environment flag is true. Neon inspection on 2026-10-31
found no deployed functions or triggers on the default production branch.
Do not activate the historical scheduler described below. User-configurable
scheduling is not implemented. These source changes require deployment before
they affect production.

Manual batches process at most four jobs concurrently and select only the
requesting user's jobs. Adding/importing links retrieves metadata without an
implicit health check. The UI does not poll queue status or run progress on a
timer. Waiting work is displayed separately from recorded processing; broken
links and inconclusive results have separate counts. The old 500-link/48-hour
automatic throughput target below no longer applies to on-demand batches.

## Deployment decision
On 2026-10-22 the existing Vercel Hobby daily cron's ≤4 jobs per
invocation could not meet 500 checks/48h. The project uses the
**existing free Neon Frankfurt project** as the intended scheduler/worker,
not an additional paid service. A cloud function can process a bounded
240s budget every five minutes. This is a theoretical capacity model,
**not a passed production acceptance test.**

## Safety gates
The code is intentionally **off by default**:
`FIHRIST_ENABLE_CLOUD_WEEKLY_HEALTH=true` is required on BOTH the
Neon function and Vercel API. Until then no weekly schedule is
advertised, bulk cloud sweeps cannot be manually enqueued, and
individual manual checks still work using the existing small
mutation-job drain. Do not mark an unverified automatic run "active".

The link checker preserves per-hop DNS/SSRF protections, the honest
user agent, four-state verdicts, durable 90s host leases and 750ms
end-to-start per-host pacing, whether a function is invoked twice or
a previous invocation stops. Do not grant the Neon trigger public
access without checking `X-Neon-Trigger-Invocation-Id`.

## Before a merge or production rollout
1. Run `pnpm install --frozen-lockfile`, `pnpm run check`,
   `pnpm run test`, `pnpm run check:runtime`, `pnpm run build`.
2. Apply `drizzle/postgres/0002_health_engine_v2.sql` using a
   reviewed migration on a disposable Neon **test branch**, including
   source-enum upgrades and all table grants. Run the SQLite migrations
   by opening a clean and a previously upgraded local database.
3. Confirm the measured **typical** health-check row storage increase is
   at most ~350 bytes, and the chain ≤2500 UTF-8 bytes.
4. Seed scenarios for V1–V9; measure the 500-link 48-hour fixture
   including single-host 404, network stalls and Neon free quotas.
5. Deploy the worker on a disposable Neon branch with the flag OFF.
   Example commands after the branch has been verified:
   ```bash
   neon functions deploy fihristhealth --src neon/functions/health.ts \
     --project-id spring-dream-59127345 --branch <test-branch> \
     --env FIHRIST_MODE=cloud --env FIHRIST_ENABLE_CLOUD_WEEKLY_HEALTH=false
   ```
   Create the scheduled trigger as **disabled**, then inspect its
   invocations/logs. Only enable on a test branch, with test data and
   explicit test credentials. Test external check traffic and quotas.
6. After passing V1–V9 and reviewing the actual PR commit, apply the
   same migration on production Neon, deploy the Neon worker, create
   its five-minute Scheduled Trigger, then enable the flag on BOTH
   Neon and Vercel, verify a real weekly completion and digest row.
   Keep `main` merge the only Vercel production deployment trigger.

## Evidence required
| Check | Needed for release |
|---|---|
| V1 | A scheduled (not manual) Neon invocation that opened, drained and completed a weekly health run with a linked digest, recorded timestamps |
| V2 | Measured start/end, number of invocations and actual 500-item fixture within 48h |
| V3 | Measured pre/post row bytes; 90-day transitions, monthly anchors and unchanged counts/streak across prune |
| V4 | Deterministic fixtures for DNS/TLS/blocked/flapping HTTP/soft-404/redirect variants with class and move |
| V5 | 1-vs-2 different-sweep soft-404 guard and healthy reset |
| V6 | Archived URL found/not-found and explicit replacement (original URL + audit row) |
| V7 | Arabic/English shelves, stable dismissals/collections, topicTagId scope |
| V8 | Existing per-link, queue, BYOK grounding, local-mode and SSRF suites |
| V9 | Both locales and screen sizes for all eleven exact reason lines, no raw technical jargon on cards |

**Until actual evidence exists, V1–V9 must be reported as pending,
not "passed". No PR or app copy may claim a production completion from
committed code alone.**

References:
- https://neon.com/docs/compute/functions/triggers/schedule
- https://neon.com/docs/compute/functions/reference/runtime-limits
- https://neon.com/docs/introduction/plans
- https://vercel.com/docs/cron-jobs/usage-and-pricing
