# Production Planner: Manufacturing Specs editing (deferred)

## Status

Temporarily disabled (commented out, not deleted) as of 2026-07-16, per product decision to
simplify the "Products & Planned Quantities" panel for now. All underlying data, types, and
schema are untouched — only the UI entry point to edit per-line manufacturing specs is hidden.

## What this covers

Each `production_plan_items` row carries a full manufacturing spec snapshot (mirrored from
`po_line_items`): `sock_card_id`, `pack_pairs`, `sock_size`, `construction`, `cards_used`,
`box_no`, `pantone`, `barcode_required`, `art_status`, `art_note`, `mockup_file_ref`,
`artwork_file_ref`, `rib_lr`, `toe`, `pattern`, `signature`, `foot_text`.

Before this change, each product line in the plan builder had a "Specs" button that opened an
`EntityFormModal` to edit these fields directly on the plan item, ahead of running a simulation
or converting to a Manufacturer PO. `getReadinessBlockers` (`src/utils/productionSimulation.ts`)
still checks these same fields (construction, sock_size, barcode readiness, art approval) when
determining whether a plan is ready to approve/convert — that check is unaffected by this change.

## What was commented out (not removed)

- `src/pages/ProductionPlanDetailPage.tsx`:
  - `EntityFormModal` import
  - `editingSpecItem` state
  - the `onEditSpecs` prop passed to `ProductPlanItemRow`
  - the `EntityFormModal` block at the bottom of the page that rendered the specs form
- `src/components/production/ProductPlanItemRow.tsx`:
  - the "Specs" button in the per-line actions column
  - `onEditSpecs` was widened to an optional prop (`onEditSpecs?: () => void`) so the row
    still type-checks without a caller wiring it up

Each spot is marked with a comment pointing back to this file.

## How to re-enable

1. Uncomment the `EntityFormModal` import, `editingSpecItem` state, the modal block, and the
   `onEditSpecs` prop pass in `ProductionPlanDetailPage.tsx`.
2. Uncomment the "Specs" button in `ProductPlanItemRow.tsx` (optionally revert `onEditSpecs`
   back to a required prop once every caller supplies it again).
3. Re-run `npm run build` and `npm test` to confirm no regressions.

## Ideas for a future pass (not required, just notes)

- The current modal exposes all 16 fields flatly; grouping them (packaging, art/branding,
  barcode) similar to the plan-assumptions wizard could reduce how overwhelming it feels.
- Readiness blockers currently only surface as a blocking error message at conversion time —
  surfacing them inline per product line (e.g. a small warning icon on the row) would let users
  fix specs without needing this modal open in the first place.
