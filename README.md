# fihrist-bookmark-manager

A project managed in the Apex Yard workspace.

## Run it

```bash
pnpm install
pnpm run dev        # http://localhost:3000
pnpm run check      # typecheck
pnpm run test       # vitest
pnpm run build      # production build
```

## New features (branch `fihrist-maktaba-update`)

- **Tri-state link health** — bookmarks are `ok`, `needs_review`, or `broken`.
  Bot-blocked or ambiguous pages land in `needs_review` and are never labeled
  dead; only hard failures (DNS, connection refused, consistent 404/410) are
  `broken`. Full policy: [docs/health-policy.md](docs/health-policy.md).
- **Full-drain health queue** — the weekly run processes the entire backlog and
  the UI shows a live progress banner (x of y, ETA, last run).
- **Chrome extension (unpacked MV3)** — one-click save of the current tab plus
  popup search. Install: [docs/extension-install.md](docs/extension-install.md).
- **BYOK AI tag suggestions** — bring your own OpenAI-compatible key; every
  suggestion waits for your approval. Setup: [docs/ai-tagging.md](docs/ai-tagging.md).

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
