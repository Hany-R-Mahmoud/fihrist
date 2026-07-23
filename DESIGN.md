# Fihrist Design System

## 1. Atmosphere & Identity

Fihrist is a calm personal library: warm paper surfaces, deep forest navigation, and compact maintenance tools. Its signature is orderly shelving, with health and destructive states visible without making the workspace feel alarming. The public landing page extends that identity into “Archive in Motion”: a dark forest stage, paper-bright type, and a dimensional library preview that makes organization feel tangible before the user enters the workspace.

## 2. Color

All product colors come from semantic CSS variables in `client/src/index.css`. Components use Tailwind roles such as `background`, `card`, `primary`, `muted`, `accent`, `destructive`, `border`, `input`, and `ring`. Health uses the existing emerald, amber, red, and neutral status recipes. The landing extension defines its dark-stage ramp in `client/src/pages/landing.css` as `--landing-deeper`, `--landing-deep`, `--landing-ink`, `--landing-muted`, `--landing-paper`, `--landing-mint`, `--landing-amber`, and `--landing-coral`; these are the only landing-specific color tokens.

## 3. Typography

DM Sans is the only product font. The working scale is 12px metadata, 14px supporting text, 16-17px card titles and controls, 18-24px section titles, and 32-34px page titles. Headings use tight negative tracking; body copy stays at normal tracking and at least 14px.

## 4. Spacing & Layout

Spacing follows Tailwind's 4px base unit. The shell has a 248px desktop sidebar and a fluid main region capped at 1540px. Page content is capped at 1152px. Controls use wrapping clusters; content uses responsive one-, two-, and three-column grids. The document owns vertical scrolling, the desktop sidebar remains sticky, and primary content must reflow without horizontal scrolling at 375px.

## 5. Components

### Navigation and action buttons

- Structure: semantic buttons with Lucide icons and short labels.
- Variants: primary, outline, ghost, destructive.
- States: hover, active, focus-visible, disabled, loading.
- Accessibility: one-line labels, visible focus, icon plus text except compact icon controls.

### Cards and status rows

- Structure: `fihrist-card` surface with title, metadata, status, and contextual actions.
- Variants: bookmark card, collection card, health summary, health row.
- States: selected, loading, empty, warning, confirmed broken.
- Accessibility: status is written as text; color is supplementary.

### Dialogs

- Structure: Radix dialog with heading, explanation, actions, and a safe default focus order.
- Variants: form and destructive confirmation.
- States: open, pending, error reported by toast.
- Accessibility: labelled title and description; keyboard close remains available.

### Selection toolbar

- Structure: wrapping cluster with selected count and scoped bulk actions.
- States: hidden at zero selection, visible when selected, pending actions disabled.
- Accessibility: native checkboxes and a labelled toolbar region.

## 6. Motion & Interaction

The dashboard keeps functional 160-180ms transitions. The landing page uses meaningful motion: a perspective-tilted library console, orbiting link nodes, and floating collection cards communicate organization and link health. Animations only change transform, opacity, or filter; they run in CSS and are disabled to a near-instant state under `prefers-reduced-motion: reduce`. All landing actions are native links with visible focus rings.

## 7. Depth & Surface

Use a mixed strategy: semantic borders define panels and rows; `shadow-sm` lifts interactive cards; dialogs and popovers use the existing Radix elevation. New surfaces reuse `fihrist-panel`, `fihrist-card`, `fihrist-subtle-action`, and `fihrist-danger`.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA. Every action must be keyboard reachable, every checkbox labelled, status understandable without color, destructive bulk actions confirmed with an exact count, and mobile layouts free of primary horizontal scrolling.

The root route `/` is a public landing page. The bookmarks workspace is explicitly `/library`, so a visitor never hits authentication before seeing the product. Every landing section has a semantic heading, decorative 3D nodes are hidden from assistive technology, and the main CTA is repeated with the exact label “Open bookmarks library.” Target WCAG 2.2 AA. Every action must be keyboard reachable, every checkbox labelled, status understandable without color, destructive bulk actions confirmed with an exact count, and mobile layouts free of primary horizontal scrolling.

## 9. Public Landing Contract

- Route: `/` always renders `client/src/pages/Landing.tsx`; `/library` renders the existing bookmark workspace.
- Hero: “Keep the web you mean to return to.” with one primary library action and one in-page discovery action.
- Reusable primitives: landing navigation, primary/secondary CTA, perspective console preview, orbit node field, shelf card, health ledger, and footer action.
- Responsive behavior: two-column hero and 12-column dense feature shelf at desktop; one-column stage and feature stack below 1024px; compact nav and single-column content below 640px.
- Surface rule: landing cards use a low-contrast forest surface with a single semantic border and a restrained shadow; the central console adds an inset rim and paper/mint status accents for depth.
