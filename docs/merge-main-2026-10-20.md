# Main integration — 2026-10-20

Resolved PR #5 conflicts while preserving Arabic localization, health timelines, rot reports, cloud sign-in and serverless ESM imports. The merged health features now use the active database adapter. Added matching Neon schema, persistence methods, run attribution and completion hooks. Preserved main’s pinned Neon SDK versions and removed duplicate dependency declarations.

The additive migration `drizzle/postgres/0001_health_history.sql` was applied successfully to Preview `br-twilight-frog-bavlqcr2` and Production `br-nameless-flower-baau26aj`, database `fihrist`, in Neon project `spring-dream-59127345`. Existing rows were retained.

Verification: 28 test files / 138 tests passed; the updated bilingual landing test passed again (4 tests); TypeScript, emitted serverless ESM execution, cloud adapter API availability and the production web build passed. The build retains the existing large-chunk warning.

Google sign-in, actual two-account isolation and device PWA acceptance remain Unknown / verify. The local Vercel Git deployment map is exactly `{"*":false,"main":true}`. The project API did not expose a separate live map for comparison.
