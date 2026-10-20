# fihrist-bookmark-manager

A project managed in the Apex Yard workspace.

Production homepage: https://fihristy.vercel.app/
Privacy: https://fihristy.vercel.app/privacy.html · Terms: https://fihristy.vercel.app/terms.html

Production serves the Dashboard release at `c72f5aa`, whose serverless API imports fail at startup. The bugfix branch repairs ESM resolution and browser session recovery. Runtime evidence and remaining Google sign-in acceptance work: [regression handover](docs/neon/GOOGLE_SIGNIN_REGRESSION.md).

## Run it

```bash
pnpm install
pnpm run dev        # http://localhost:3000
pnpm run check      # typecheck
pnpm run test       # vitest
pnpm run build      # production build
```

## New features (branch `fihrist-maktaba-update`)

- **Four-state link health** — bookmarks are `healthy`, `redirected`, `broken`, or
  `needs_review` (plus `unchecked` before their first check). Bot-blocked or
  ambiguous pages land in `needs_review` and are never labeled dead; only hard
  failures (DNS, connection refused, consistent 404/410) are `broken`. Full
  policy: [docs/health-policy.md](docs/health-policy.md).
- **Full-drain health queue** — the weekly run processes the entire backlog and
  the UI shows a live progress banner (x of y, ETA, last run).
- **Per-link check timeline** — every check is recorded, so any bookmark can show
  its full history: status over time, HTTP codes, first-broken date, current
  streak, grouped under the run that produced each entry.
- **Narrative rot report** — after each weekly run, a delta-only digest: what
  broke, what recovered, what needs review, with an action on every item.
  A short Arabic note is written over the numbers using your own AI key; the
  numbers alone are always a complete report.
- **Bilingual Arabic-first UI** — Arabic by default with an AR/EN toggle in the
  shell; every new surface carries both languages and correct RTL.
- **Chrome extension (unpacked MV3)** — one-click save of the current tab plus
  popup search. Install: [docs/extension-install.md](docs/extension-install.md).
- **BYOK AI tag suggestions** — bring your own OpenAI-compatible key; every
  suggestion waits for your approval. Setup: [docs/ai-tagging.md](docs/ai-tagging.md).
- **PWA app shell** — install metadata and an offline shell cache for static
  files. API, sign-in, and bookmark responses are never cached. Cloud sign-in and Neon storage are implemented; full browser acceptance remains to be verified.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `FIHRIST_EXTENSION_ORIGINS` | Comma-separated `chrome-extension://<id>` origins allowed to call the API (extension install, step 1) |
| `FIHRIST_AI_BASE_URL` | OpenAI-compatible endpoint for AI features |
| `FIHRIST_AI_API_KEY` | Your LLM API key — never commit this |

## Apex Yard portfolio snapshot

- Status: showcase
- Category: Web
- Source of truth: [docs/portfolio.json](docs/portfolio.json)

This section is maintained from repository evidence and should be updated with docs/portfolio.json when the project changes.
