# Fihrist link health policy

How Fihrist decides whether a saved link is alive, dead, or needs a human look.
This document is the contract — the implementation in `server/services/linkSafety.ts`
(`classifyHealthStatus`) must match it.

## The four checked states

| State | Meaning | Shown as |
|---|---|---|
| `healthy` | The site answered 2xx. The link works. | Green |
| `redirected` | The site answered 2xx at a different final URL. The link works but moved. | Amber |
| `broken` | Hard evidence the link is dead (see below). Safe to delete. | Red |
| `needs_review` | The check was inconclusive. **Never treated as dead.** Open the link yourself. | Amber |

Philosophy: a confident wrong "dead" destroys trust. When in doubt, the checker
says `needs_review`, never `dead`.

## Check procedure (per link)

1. `HEAD` request first (cheap).
2. On `405`/`403`/`400`, fall back to `GET` with `Range: bytes=0-32767`.
3. Up to **3 attempts** with exponential backoff (0s, 1s, 2.5s).
4. A clean 2xx stops the retries early.

## What counts as what

**`broken` only on hard signals:**
- DNS failure on every attempt (`ENOTFOUND`) — the domain does not resolve.
- Connection refused on every attempt (`ECONNREFUSED`).
- HTTP `404`/`410`.
- Consistent 4xx (other than 401/403/429) or consistent 5xx across all retries.

**`needs_review` (ambiguous — human decides):**
- HTTP `401`, `403`, `429` — the site blocks bots. It may be perfectly fine.
- Bot-challenge markers in the page (Cloudflare "Just a moment", captchas,
  "Access denied", login walls) — even when served with HTTP 200.
- Empty JavaScript app shells (HTTP 200, almost no text) — unverifiable, not dead.
- Repeated timeouts with no other signal — may be a slow or temporarily down site.

**`healthy` / `redirected`:** HTTP 2xx. `redirected` when the final URL differs
from the saved URL.

## Rate limiting (why bulk checks used to lie)

Bulk health runs used to hammer hosts, get the owner's IP throttled, and then
report everything as dead. Now:
- Max **1 concurrent check** per host (below the two-request safety limit).
- Minimum **750ms gap** between requests to the same host.
- Full-queue drains keep this pacing — draining fully never means hammering.

## Known unverifiable cases

- Sites behind aggressive bot protection (some banks, ticket sellers).
- Single-page apps that render nothing without JavaScript.
- Pages requiring login.
- Sites that block the `FihristBookmarkHealth/1.0` user agent specifically.

These report `needs_review` with an explanatory message, always in the
`healthError` field shown under the bookmark.
