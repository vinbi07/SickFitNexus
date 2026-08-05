---
name: SickFit Nexus
description: A dense, flat operations console for running wholesale, inventory, and production from one screen.
colors:
  ledger-ink: "#0b1220"
  ink-soft: "#344054"
  canvas: "#eef1f4"
  surface: "#ffffff"
  panel: "rgba(255, 255, 255, 0.94)"
  border: "#e4e7ec"
  border-strong: "#d9dee7"
  muted: "#667085"
  danger: "#c0262d"
  danger-bg: "#fff1f2"
  danger-border: "#f5b7bd"
  warning: "#b45309"
  warning-bg: "#fffaeb"
  warning-border: "#fedf89"
  success: "#047857"
  success-bg: "#ecfdf3"
  success-border: "#abefc6"
  info: "#1d4ed8"
  info-bg: "#eff4ff"
  info-border: "#b2ccff"
  accent-blue: "#2563eb"
  flow-teal: "#0f766e"
typography:
  metric:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(1.45rem, 1.2vw + 1rem, 2rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "normal"
  title:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  content: "4px"
  chrome: "10px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.ledger-ink}"
    textColor: "#ffffff"
    rounded: "{rounded.content}"
    padding: "7px 10px"
  button-primary-hover:
    backgroundColor: "#344054"
  button-secondary:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.content}"
    padding: "7px 10px"
  status-badge:
    rounded: "{rounded.content}"
    padding: "3px 8px"
    typography: "{typography.label}"
---

# Design System: SickFit Nexus

## Overview

**Creative North Star: "The Command Console"**

SickFit Nexus reads like the cockpit of a one-person freight operation, not a storefront. The interface's own CSS history tells the story directly: an earlier pass built a warm, brand-forward look — a red-and-black palette, a serif display face ("Copernicus"), a dark gradient sidebar, shadowed cards with a red top-accent stripe. Three later cascade layers, named in the source itself ("Nexus Rehaul Visual Foundation," "Phase 1B Command Center Rehaul," "Dashboard 2.0 Command Workspace"), systematically stripped that back: shadows off, corners sharpened to 4px, the sidebar flattened to white, the type swapped to Helvetica, and the near-black `#0b1220` became the only color doing real structural work. Red survives only as a semantic danger color and a small logo mark — no longer the brand's visual signature.

That progression is the design decision, and it should be read as final: this is a solo operator's dense operations tool, and every rehaul moved toward less ornament and tighter density, never back. New surfaces continue that trajectory rather than reintroducing the earlier brand-forward look.

One inconsistency is worth naming rather than hiding: purchase order and invoice documents (`purchaseOrderDocument.ts`) still render with the old serif "Copernicus" type and a mint-green banner, disconnected from the app shell around them. This is leftover from the pre-rehaul identity, not a deliberate second visual track — treat it as unmigrated debt, not a pattern to extend.

**Key Characteristics:**
- Flat surfaces, thin borders, near-zero shadow — depth comes from a border and a background-shade step, not elevation.
- Near-black "Ledger Ink" as the only strong color; every other hue is semantic (danger/warning/success/info) or a small accent (focus blue).
- Sharp 4px corners on nearly everything that holds content; a handful of navigation chrome elements (sidebar rail, brand mark, topbar shell) run slightly softer at 8–10px.
- Helvetica/Arial throughout the app shell — no display serif, no decorative type.
- Letter-spacing reset to `0` almost everywhere; tracking is not part of this system's voice anymore.
- Small, tight components: 30–34px input heights, 32px buttons, 20px status chips. Built for scanning many rows, not for spacious marketing rhythm.

## Colors

A near-monochrome console: one dark ink color carries all primary emphasis, and every other color is a semantic signal, not decoration.

### Primary
- **Ledger Ink** (`#0b1220`, also appears as `#101828` in a few older call sites — treat both as the same role): primary buttons, active navigation state, KPI-highlight card backgrounds, primary text on light surfaces. This is the system's only strong color; everything else is either neutral or semantic.

### Neutral
- **Canvas** (`#eef1f4`): the page background, laid under a faint 28px grid line pattern (`rgba(15,23,42,0.03–0.035)` hairlines) — gives the app a graph-paper, instrumentation feel at rest.
- **Surface** (`#ffffff`): cards, panels, inputs, the sidebar.
- **Panel** (`rgba(255,255,255,0.94)`): the current (final-cascade) background for `.card`/`.panel`/`.table-shell`/`.modal-shell` — a translucent-white variant of Surface, letting the canvas grid show faintly through.
- **Border** (`#e4e7ec`) / **Border Strong** (`#d9dee7`): the two hairline border tones in circulation. Functionally interchangeable; `#d9dee7` (`--command-line`) is the one actually used on cards and panels in the final cascade layer.
- **Muted** (`#667085`): secondary text — labels, footnotes, helper copy, table headers.
- **Ink Soft** (`#344054`): secondary body text one step darker than Muted, used for nav-link and field-label copy.

### Semantic
- **Danger** (`#c0262d` on `#fff1f2`, border `#f5b7bd`): errors, destructive actions, compliance holds, critical alerts.
- **Warning** (`#b45309` on `#fffaeb`, border `#fedf89`): at-risk states, pending review, low stock.
- **Success** (`#047857` on `#ecfdf3`, border `#abefc6`): completed, in-stock, healthy states.
- **Info** (`#1d4ed8` on `#eff4ff`, border `#b2ccff`): neutral informational states, in-progress signals.
- **Accent Blue** (`#2563eb`): the one color reserved for interaction, not status — the active-nav marker bar and focus-visible outlines. It never appears in a status badge.
- **Flow Teal** (`#0f766e`): defined alongside the command tokens for a "flow" state; use sparingly for movement/in-transit signals distinct from Info's blue.

### Named Rules
**The One Ink Rule.** Ledger Ink is the only color allowed to carry primary visual weight (buttons, active states, emphasis). Every other color in the system is either a neutral surface tone or a semantic status signal — never a second "brand" color competing with Ledger Ink.

**The Danger Is Not Decoration Rule.** The original brand red (`#e72027`) is retired as a UI color. Where red appears now, it must be `--danger` (`#c0262d`) signaling an actual error or hold state — never used for emphasis, brand flourish, or a call-to-action that isn't destructive.

## Typography

**Body & Display Font:** Helvetica, "Helvetica Neue", Arial, sans-serif — no serif, no custom webfont, anywhere in the app shell.

**Character:** Plain, dense, and utilitarian. The system font stack is a deliberate choice from the "Dashboard 2.0" rehaul, made after the project shipped a licensed serif ("Copernicus") for the earlier brand-forward look — new UI work should not reach back for that face.

### Hierarchy
- **Title** (700, `1rem`, line-height 1.2): topbar and page-header `h1`s. There is no larger display size in the current system — headlines stay compact.
- **Metric** (700, `clamp(1.45rem, 1.2vw + 1rem, 2rem)`, line-height 1.05): the one place type gets visually large — dashboard KPI values.
- **Body** (400, `0.9rem`, line-height 1.45): default reading text.
- **Table/Dense Body** (400, `0.78rem`): data-table cells, page-header subtext — the density workhorse size.
- **Label** (800, `0.72rem`, letter-spacing `0.05em`, uppercase): metric labels, section kickers, rail group headers. The one place tracked-out uppercase type survives — reserved for short structural labels, not for running text.

### Named Rules
**The Zero-Tracking Rule.** Outside of uppercase Labels, letter-spacing is `0`. The original system's wide `0.01–0.03em` body tracking has been removed everywhere the rehaul touched; don't reintroduce it in new components.

## Layout

Fixed-sidebar app shell: a 238px navigation rail (64px collapsed) beside a fluid content column, no max-width cap on content (`--brand-max-width` was raised to 1520px and finally uncapped for the dashboard). Content padding is tight (`10px 12px 22px`) and the vertical rhythm between sections is a consistent 10px gap — this is a dense instrument panel, not an airy document layout.

Cards and metric tiles sit on a 12-column grid (`.card-grid`, `.dashboard-card-grid`) with 12px gaps; dashboard tiles typically span 3–4 columns. Tables and forms use the same underlying grid discipline (`.table-shell`, `.form-grid`) rather than bespoke layouts per page.

Responsive behavior collapses the sidebar to a 64px icon rail (or an off-canvas mobile nav) under ~1180px, and stacks multi-column grids to single-column under ~900–640px breakpoints scattered per component.

## Elevation & Depth

Flat-by-default; borders do the work shadows used to do. In the current (final) cascade, `.card`, `.panel`, `.table-shell`, and `.modal-shell` all resolve to `box-shadow: none` with a 1px `border-strong` hairline instead. The original shadow tokens (`--brand-card-shadow`, `--brand-card-shadow-strong`) still exist and still get used, but only for transient or interactive states: hover lift on dashboard link-cards, the KPI-highlight tile, dropdown/tooltip panels, and modals-over-backdrop — never for a card at rest.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(16,24,40,0.04)`): unused at rest in the current system; kept as a token but not applied to base surfaces.
- **Strong** (`0 8px 24px rgba(16,24,40,0.08)`): hover states, KPI-highlight cards, tooltips, and modal shells — reserved for things that are temporarily "up" off the canvas.

### Named Rules
**The Shadow-Is-A-State Rule.** A shadow means something is temporarily elevated — hovered, floating, or modal. A resting surface never has one; it has a border instead.

## Shapes

Two radius tiers, applied by role rather than by component type:

- **Content chrome** (cards, panels, tables, modals, buttons, inputs, status badges): `4px`. This is the terminal value after the "Dashboard 2.0" pass explicitly flattened corners system-wide — treat 4px as the default for anything that holds data or triggers an action.
- **Navigation chrome** (sidebar rail container, brand mark, topbar shell, rail-toggle): `8–10px`. The frame around the workspace is allowed a softer curve than the workspace contents.

### Named Rules
**The Content-Is-Sharp Rule.** If it holds data or is a control (button, input, badge, table, card), it's 4px. If it's part of the app's fixed frame (sidebar, topbar, brand mark), it can run 8–10px. Don't mix the two registers within one component.

## Components

### Buttons
- **Shape:** 4px radius, 32px min-height, `7px 10px` padding, `0.78rem` / weight 800 label.
- **Primary:** background `#0b1220` (Ledger Ink), white text, no shadow. Hover darkens to `#344054`.
- **Secondary / Ghost:** white background, `border-strong` hairline, `ink-soft` text; hover shifts to `#f9fafb` background with a darker border.
- **Danger:** `--danger` background and border, white text.

### Status Badges
- **Shape:** small pill-intent chips that resolve to 4px corners in the final cascade (not a true pill) — `3px 8px` padding, `0.68rem` uppercase label, weight 800, letter-spacing `0.04em`.
- **Color assignment:** background/border/text always come from one semantic pair (danger, warning, success, info, or neutral) — never a custom color per badge.

### Cards / Panels
- **Corner:** 4px.
- **Background:** `rgba(255,255,255,0.94)` (Panel) over the gridded Canvas.
- **Border:** 1px `border-strong` (`#d9dee7`).
- **Shadow:** none at rest (see Elevation & Depth).
- **Internal padding:** 12–18px depending on density (dashboard metric tiles run tighter than form panels).

### Inputs / Fields
- **Style:** white background, 1px `#d0d5dd` border, 4–6px radius (field-level radius wasn't swept into the 4px pass, so inputs sit slightly rounder than the buttons beside them — a minor inconsistency worth normalizing to 4px if touched), `30–34px` min-height, no shadow.
- **Label:** `ink-soft` color, `0.76rem`, no tracking.
- **Focus:** not consistently defined across all inputs; where a focus treatment exists (navigation, interactive controls), it's a 2px `accent-blue` (`#2563eb`) outline with 2px offset. New input components should adopt that same outline rather than inventing a new focus treatment.

### Navigation
- **Style:** white sidebar (`rgba(248,250,252,0.96)`), `ink-soft` (`#3f4a5d`) link text, 8px radius per nav item.
- **Default/Hover:** hover fills white with a `border-strong` outline.
- **Active:** filled `#0f172a` (near-black) background, white text, plus a 3px rounded accent-blue bar floating just outside the item's left edge — the one place accent-blue appears as a persistent (not just interactive) marker.
- **Mobile:** collapses to an off-canvas drawer via a hamburger toggle in the topbar; collapsed-rail mode (64px, desktop) hides all text labels and centers icons.

## Do's and Don'ts

### Do:
- **Do** treat Ledger Ink (`#0b1220`) as the only non-semantic strong color in the system.
- **Do** default new surfaces to flat: border + background-shade step, no resting shadow.
- **Do** use 4px radius for anything that holds data or is directly actionable (cards, tables, buttons, badges, modals).
- **Do** use Helvetica/Arial for all in-app UI type; reserve the "Copernicus" serif for legacy document templates only, and don't extend its use.
- **Do** keep letter-spacing at `0` outside of small uppercase Labels.
- **Do** use `--danger` / `--warning` / `--success` / `--info` token pairs for every status signal; never invent a one-off status color.

### Don't:
- **Don't** reintroduce the original brand red (`#e72027`) as a UI accent, button color, or emphasis device — it now means "danger," exclusively.
- **Don't** add drop shadows to resting cards, panels, or list rows; shadows are reserved for hover lift, dropdowns, tooltips, and modals.
- **Don't** widen letter-spacing on body or heading text to match the pre-rehaul brand voice — that tracking was deliberately removed.
- **Don't** copy the purchase-order/invoice document styling (serif type, mint banner) into app-shell UI; it's unmigrated legacy, not a second design track to extend.
