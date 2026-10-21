# Fihrist Design System v2 — «كشك الجرايد» (The Little Kiosk)

Replaces DESIGN.md ("Archive in Motion", dark forest). Direction: Hany's
newspaper-kiosk identity, locked 2026-10-20. **Visual reference = the K1
kiosk** (chosen by Hany over the photographic cover-wall variant after both
were fully explored): a cozy wooden stall with a green-and-cream striped
awning, shelves of magazine bundles, and newspapers hanging on a string.
Warmth and charm win over documentary realism — that is a deliberate,
recorded choice. This document is the design contract the builder prompt
(OpenSpec) points to.

## 1. Identity

Fihrist is **the little kiosk for the web**: a warm wooden stall where your
reading is kept — bundles on shelves, fresh papers hung on the line, a
hand-painted sign, everything under one striped awning.

- Your library lives on the **shelves**: collections are the shelf stacks —
  tied bundles of magazines, each bookmark's OG image its cover.
- The **hanging line** («على الحبل») is freshness: the newest saves are hung
  up on the string with clothespins, like today's papers put up to be seen;
  pinned items are the ones that stay on the line.
- The **awning** is shelter: your links are kept *under cover* — and the
  health system is the keeper checking nothing got rained on or blown away.
- The red editorial **stamp** is link health: a run that passed is *checked* —
  stamped, dated, done. Broken links are yesterday's paper: flagged, never hidden.
- The **highlighter** is human attention: saved-for-later and search hits are
  marked in mustard, like a reader's pen.
- The **wooden sign** carries the shop's name — the brand lockup on auth and
  footer is set like hand-painted sign lettering (display font, letterspaced).

Calm newsprint carries the product; the kiosk's color bursts only where the real
kiosk has color: the covers themselves.

### The two zones (C16)
- **«واجهة الكشك» — the Kiosk Front** (landing + auth + empty states): full
  identity, the kiosk scene, stamps, texture. Sells and welcomes.
- **«غرفة القراءة» — the Reading Room** (everything inside `/library`): the
  same paper and ink, but quiet — covers appear only as bookmark cards, stamps
  only as health outcomes, no texture under data, no decorative walls. A user who
  opens fihrist every morning must never pay a decoration tax on a daily tool.

## 2. Color

All colors remain semantic CSS variables in `client/src/index.css`; components
keep using Tailwind roles (`background`, `card`, `primary`, …). Hex below is the
source of truth; the builder converts to oklch in place, matching the file's
existing convention.

### Light — «صباح الكشك» (kiosk morning)
| Role | Hex | Notes |
|---|---|---|
| background | `#F6EEDC` | aged newsprint cream |
| foreground / ink | `#211D18` | printing ink, never pure black |
| card | `#FDFBF4` | fresh paper |
| card-foreground | `#211D18` | |
| popover | `#FDFBF4` | |
| primary | `#B3402A` | faded brick red — masthead red |
| primary-foreground | `#FBF6E9` | |
| secondary | `#46695A` | awning green (the K1 striped awning) |
| secondary-foreground | `#FBF6E9` | |
| accent | `#D9A441` | mustard — highlighter family |
| accent-foreground | `#2A2118` | |
| muted | `#EDE3CB` | older paper |
| muted-foreground | `#6E6151` | faded ink |
| destructive | `#A62B1F` | deeper red than primary; primary is brand, this is danger |
| border / input | `#DDD0B2` | paper edge |
| ring | `#B3402A` | |
| sidebar | `#241B12` | dark kiosk wood |
| sidebar-foreground | `#F1E8D2` | |
| sidebar-accent | `#37291B` | lighter wood step |
| sidebar-primary | `#D9A441` | active item = mustard label |

### Dark — «الكشك بالليل» (kiosk at night, one lamp on)
| Role | Hex |
|---|---|
| background | `#171310` |
| foreground | `#EFE6CF` |
| card / popover | `#221C15` |
| primary | `#D06048` (brighter brick for dark contrast) |
| primary-foreground | `#1D130C` |
| secondary | `#6FA287` (awning green lifted for dark) |
| accent | `#D9A441` |
| muted | `#2A231A` |
| muted-foreground | `#A99B7F` |
| destructive | `#D95F4B` |
| border / input | `rgba(239,230,207,0.14)` |
| ring | `#D06048` (= dark primary, mirrors light where ring = primary) |
| card-foreground | `#EFE6CF` (= foreground) |
| popover-foreground | `#EFE6CF` (= foreground) |
| accent-foreground | `#241A0E` (dark ink on mustard, mirrors light) |
| sidebar | `#120D08` |
| sidebar-foreground | `#EFE6CF` |
| sidebar-accent | `#241B12` (one step up from sidebar, = light theme's sidebar wood) |
| sidebar-primary | `#D9A441` (= light, mustard active label) |

### Cover / collection palette (fixed set of 8)
Used for collection masthead bands, cover placeholders when a bookmark has no OG
image, chart series, and tag chips. Never for body text backgrounds.
`#B3402A` brick · `#D9A441` mustard · `#46695A` awning green · `#31597F` old blue ·
`#C96A2B` burnt orange · `#5F7247` olive · `#7C4A6E` plum · `#8A6D3B` brass

### Health states (unchanged semantics, re-skinned)
healthy = teal `#2E7D5B` · redirected = mustard `#B07E2B` · broken = brick
`#A62B1F` · needs_review = burnt orange `#C96A2B` · unchecked = faded ink.
Status is always text + icon; color is supplementary (existing rule kept).

## 3. Typography

- **Display EN:** Newsreader (already loaded in the live build, currently
  unused) — headlines, masthead, numbers. Weights 500/600, tight tracking.
- **Display AR:** Noto Kufi Arabic 700/800 — the newspaper-masthead voice.
- **Body EN:** DM Sans (existing). **Body AR:** IBM Plex Sans Arabic 400/500/600.
- Fonts load from Google Fonts in `client/index.html`, same pattern as today;
  `font-display: swap`; no other font files.
- Scale unchanged (12 metadata / 14 body / 16–17 titles / 18–24 sections /
  32–34 page titles); display headlines on landing may go to clamp(2.6rem, 6vw, 5rem).

## 4. The kiosk language (components)

- **Masthead (landing header + app top bar on landing only):** double rule
  (3px ink line over 1px line), brand mark left (right in RTL), dateline strip
  under it («العدد اليومي» / "Daily edition" + real date in AR locale).
- **Newspaper rules as dividers:** section separators are 1px ink rules with a
  small centered diamond/ornament — replaces generic borders on the landing.
- **Cover card (bookmark with OG image) (C9):** fixed **3:4 cover area** at the
  card top (`aspect-ratio: 3/4`, `object-fit: cover`); a masthead band overlays
  the cover's top edge carrying the **site name as live text** (never baked
  into an image) on the collection's palette color; title below in serif (EN) /
  Kufi (AR). No-OG bookmarks get a generated cover: palette color derived from
  a hash of the domain + the domain's first letter as a big serif/Kufi initial
  + the same live-text masthead band.
- **Stamp badge:** rotated −6deg, double-border, uppercase, used ONLY for
  health outcomes (landing ledger + in-app health summary + the digest): «اتفحصت» / CHECKED,
  «محتاج مراجعة» / REVIEW. Never decorative elsewhere.
- **Highlighter:** mustard translucent stroke behind saved-for-later titles and
  search-match text (`background: linear-gradient(transparent 55%, #D9A44166 55%)`).
- **Stone (pinned):** pinned bookmarks show a small stone-dot marker ⚫ replaced
  by a drawn grey pebble glyph (CSS radial-gradient circle) at the card corner —
  "held down so it doesn't fly away".
- **Buttons:** primary = brick red pill (affordance kept from v1); secondary =
  ink outline pill; on the landing, primary CTA label stays exactly
  "Open bookmarks library" / «افتح المكتبة» per the existing contract i18n keys.
- **Radius:** base `--radius: 0.5rem` (print is squarer than the old 0.8rem);
  masthead bands and stamps are square-cornered (2px).
- **Texture:** `newsprint-texture.webp` at ≤6% opacity on landing section
  backgrounds and the auth screen ONLY. Never under data-dense app surfaces.

## 5. Landing layout (route `/` → Landing.tsx, contract preserved)

1. **Masthead nav** — as §4; links: shelves, link health (existing anchors).
2. **Hero — «واجهة الكشك» (C13, locked composition):** kiosk art + a glimpse of
   the real UI (the hung sheet) + serif headline (existing i18n keys
   landing.heroLine1–3) + **one plain-language category line** directly under
   the headline so a stranger classifies the product in ≤5 seconds
   («مدير إشارات مرجعية بيحافظ على روابطك ويفحصها» / "A bookmark manager that
   keeps your links alive and checked" — final wording via i18n keys
   landing.categoryLine, added to both locales) + CTAs
   (existing behavior: sign-in/guest/see-how), note line. Left side in LTR,
   right side in RTL. Right: the kiosk
   hero asset (`hero-kiosk-{ar,en}.webp`) inside a **paper mount** — shown
   whole, never cropped, in a frame with the masthead's double rule and a
   caption bar (awning stripe on top, small-caps label + hairline + text from
   the new key `landing.kioskCaption`, both locales). The app console card
   (existing console content/keys) is no longer an overlay on the artwork: it
   is **the hung sheet** — the newest paper clipped to the kiosk's line, with
   two clothespins, tilted 1.1deg, tucked two fifths under the frame's bottom
   edge so it hangs clear of the stall, and printed as newsprint in BOTH
   themes (paper + ink, never inverted). Below 1024px it stacks under the
   mount with no overlap at all. No stamp badge
   in the hero — the stamp lives only in the health section, the in-app
   health summary, and the digest (§4). Orbit rings and CSS-drawn console illustration
   are REMOVED.
3. **Shelf-strip divider:** full-bleed strip `shelf-strip.webp` (awning
   valance + hanging papers + two shelves of bundles; locale-neutral, no
   text) between hero and link health — the stall front you walk past.
   Height ~180–260px, object-fit cover. Decorative, aria-hidden.
4. **Link health — «ختم المراجعة»:** the FIRST feature section after the
   hero (aliveness before nostalgia, C5). Existing ledger content/keys; the ledger
   panel becomes a stamped newspaper clipping: paper card, rule header, the
   90% as a big serif numeral, and the stamp badge overlapping its corner.
5. **Shelves → «أقسام الكشك»:** after link health. Existing 3 cards/keys, re-skinned: each card
   gets its spot illustration (`spot-collections.webp`, `spot-health.webp`,
   `spot-ai-tags.webp`) and a masthead band top border in its palette color.
6. **Final CTA + footer:** existing keys; footer gets the double-rule masthead
   treatment.

Responsive rules from DESIGN.md §9 carry over unchanged (1024px / 640px
breakpoints, no horizontal scroll at 375px, semantic headings, focus rings).

## 6. In-app translation (route `/library` and all app surfaces)

- Token swap only (§2) + radius + fonts: NO layout changes, NO component
  restructuring, NO behavior changes. Existing `fihrist-*` component classes
  keep working; the dark-mode hardcoded-hex override block in index.css is
  re-mapped to the new palette values (same selectors, new colors).
- Sidebar becomes the kiosk frame (dark wood) in BOTH themes — this is the
  one deliberate layout-adjacent change; content area stays paper.
- Bookmark cards gain the cover treatment (§4) ONLY where an OG image already
  exists in the data; list rows stay as-is. Grid/list toggle behavior unchanged.
- Health summary banner gains the stamp badge.
- **Protected weekly surfaces (C2):** the rot-report digest entry point (with
  its unread indicator) and the health-queue progress banner keep their exact
  current positions and prominence after the recolor — recoloring must never
  bury the two surfaces Hany opens fihrist for.
- **The digest = «نشرة الروابط» — The Link Gazette (C18):** the weekly
  rot-report digest is presented as a small newspaper: masthead rule + the
  title «نشرة الروابط» / "The Link Gazette" in display type + two-column
  change list (broke / recovered / needs review) + the run's stamp badge.
  This is a named product surface, not a styled notification.
- Empty states use `empty-library.webp` / `empty-search.webp`.
- Guest/demo surfaces and auth screen: paper background + texture (§4 rule),
  brick primary button.

## 7. Motion

Paper, not plastic: 160–200ms ease-out fades/slides; hero kiosk has a very
slow (12s) 1.5% scale "breathing" drift; the shelf strip may translate
horizontally on scroll (transform only, ≤40px). Stamp badge animates in with
a 120ms scale-from-1.4 "stamp" once when the health section enters viewport.
All of it collapses under `prefers-reduced-motion: reduce` (existing pattern).

## 8. Hard rules (carried + new)

- WCAG 2.2 AA; status never by color alone; keyboard reachability unchanged.
- NO text inside generated imagery beyond the composited lettering shipped
  in this pack (the hero's wooden sign: «جرايد ومجلات» / "NEWS • PERIODICALS");
  any future asset follows blank-then-composite (see ASSETS.md).
- Real magazine/newspaper trademarks (الأهرام، الأخبار as brands, المصور…)
  are NEVER reproduced; any lettering in assets is generic words only —
  never a real publication's name or masthead.
- Asset weight: every webp ≤ 600KB, hero ≤ 550KB; landing total image budget
  ≤ 1.6MB. Lazy-load everything below the hero.
- Performance budget (C3): landing image assets MUST NOT be imported by any
  module reachable from `/library` (route-level separation verified in the
  build output); the app bundle gains zero image weight from this redesign.
- Texture & contrast (C10, adapted for K1): identity density lives ONLY at
  the Kiosk Front — the hero scene and the shelf strip; the Reading Room
  gets no decorative walls at all (bookmark covers are content, not décor);
  texture sits behind section
  backgrounds only, never behind body text; body text on `#F6EEDC` must hold
  WCAG AA (ink `#211D18` on it is 13.9:1 — do not lighten the ink).
- i18n: every visible string goes through existing locale keys; new strings
  are added to BOTH ar.json and en.json in the same change; RTL is designed,
  not mirrored-by-accident (hero image does NOT flip; text side swaps).
