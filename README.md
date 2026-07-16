# SickFit Nexus

SickFit Nexus is an Operational Command Center that turns messy wholesale PO CSVs into clean inventory intelligence, manufacturing visibility, retailer account context, and operations-ready reporting.

## Stack

- React + TypeScript + Vite
- Supabase Postgres
- Recharts
- PapaParse

## What is included

- CSV import workflow with drag-and-drop upload, preview, header mapping, preset saving, validation, duplicate detection, import history, and failed-row review
- Purchase order tracking with filters, detail pages, line items, comments, and activity feed
- Inventory tracking with manual adjustments, inventory events, low-stock indicators, and rule-based forecasting calculations
- Alerts, vendor scorecards, executive reporting, SOP library, wins board, people directory, training modules, and branding settings
- Supabase SQL schema, seed data, and sample CSV import file

## Operations Refresh

This repo now includes a wholesale operations cleanup pass focused on real invoice, shipment, inventory, and account workflows instead of forecast-heavy dashboard metrics.

### Dashboard and Manufacturing

- Dashboard cleanup removed forecast/pipeline-heavy emphasis such as weighted forecast, active pipeline, 14-day forecast framing, recent CSV imports, and SOP links from the main command view
- Revenue headline now reflects wholesale revenue only and excludes Shopify / DTC revenue
- Manufacturing now uses actual invoice and shipment-based tracking for:
  - active SKUs in route
  - quantities in route
  - open invoices
  - shipped invoices
  - inventory in route
  - reorder windows

### Inventory and Products

- Inventory danger logic marks any SKU at `25` units or less as red / danger
- Inventory views now surface:
  - SKU
  - product name
  - product image
  - current quantity
  - incoming quantity
  - COGS
  - margin
  - no-bundles status
  - danger status
- Products now support reusable `image_url` metadata and a `no_bundles` flag so product data can flow directly into inventory views

### Accounts / Retailers

- Retailers were reshaped into a more operational Accounts workflow
- Each account can now store:
  - contacts
  - account numbers
  - SOP notes
  - shipping requirements
  - notes
  - group / parent account metadata
- Retailer profile pages now show:
  - top SKUs
  - recent POs
  - ship dates
  - open invoices
  - shipped invoices
  - location coverage

### CSV Import

- CSV import now prefers a simpler Shields-style wholesale PO template
- Import mapping and normalization now support:
  - retailer/account
  - shipment status
  - invoice status
  - order date
  - ship date
  - ETA
  - pricing
  - SKU
  - quantity
  - notes
- Undo import, preview before commit, validation, duplicate detection, and failed-row review are still supported
- A future-state placeholder was added for AI-assisted PDF-to-CSV conversion feeding into the same CSV import path

### Schema / Files Added

- New migration: [src/db/migrations/011_operations_dashboard_refresh.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/011_operations_dashboard_refresh.sql)
- New lookbook migration: [src/db/migrations/012_lookbook_order_mode.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/012_lookbook_order_mode.sql)
- New account profile page: [src/pages/RetailerDetailPage.tsx](/c:/Users/Vinbi/SickFitNexus/src/pages/RetailerDetailPage.tsx)
- New shared operations helpers: [src/utils/operations.ts](/c:/Users/Vinbi/SickFitNexus/src/utils/operations.ts)

## Setup

1. Install dependencies:

```bash
npm install --include=dev
```

2. Copy `.env.example` to `.env` and fill in:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. In Supabase SQL editor, run:

- [src/db/migrations/001_init.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/001_init.sql)
- [src/db/migrations/002_public_mvp_policies.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/002_public_mvp_policies.sql)
- [src/db/migrations/003_crud_foundation.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/003_crud_foundation.sql)
- [src/db/migrations/004_relationship_backfill.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/004_relationship_backfill.sql)
- [src/db/migrations/005_csv_import_lineage.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/005_csv_import_lineage.sql)
- [src/db/migrations/006_command_center_additions.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/006_command_center_additions.sql)
- [src/db/migrations/007_shopify_order_history_sync.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/007_shopify_order_history_sync.sql)
- [src/db/migrations/008_inventory_event_source_index_fix.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/008_inventory_event_source_index_fix.sql)
- [src/db/migrations/009_shopify_orders.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/009_shopify_orders.sql)
- [src/db/migrations/010_dashboard_baselines.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/010_dashboard_baselines.sql)
- [src/db/migrations/011_operations_dashboard_refresh.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/011_operations_dashboard_refresh.sql)
- [src/db/migrations/012_lookbook_order_mode.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/012_lookbook_order_mode.sql)
- [src/db/migrations/013_lookbook_templates.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/013_lookbook_templates.sql)
- [src/db/migrations/014_product_variants.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/014_product_variants.sql)
- [src/db/migrations/015_retailer_supplier_activation_ids.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/015_retailer_supplier_activation_ids.sql)
- [src/db/seed.sql](/c:/Users/Vinbi/SickFitNexus/src/db/seed.sql)

4. Start the app:

```bash
npm run dev
```

5. Import the sample file from:

- [public/sample-po-import.csv](/c:/Users/Vinbi/SickFitNexus/public/sample-po-import.csv)

The sample import is now shaped around the preferred Shields-style wholesale format.

## Lookbook Order Mode

The app now includes a buyer-facing wholesale lookbook flow that lets a retailer buyer submit a case-pack order from a public magic link. Submitted orders become SickFit purchase orders, queue internal approval, snapshot compliance, and allocate inventory without immediately deducting on-hand stock.

The app also now supports reusable lookbook templates and linked product variants, so different buyers can receive different assortments and order the exact sellable variant instead of only a base product.

### Internal setup

1. Run the new migration:
   [src/db/migrations/012_lookbook_order_mode.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/012_lookbook_order_mode.sql)
2. Run the template migration:
   [src/db/migrations/013_lookbook_templates.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/013_lookbook_templates.sql)
3. Run the product variant migration:
   [src/db/migrations/014_product_variants.sql](/c:/Users/Vinbi/SickFitNexus/src/db/migrations/014_product_variants.sql)
4. Open `Products` and fill in wholesale-ready product fields for any SKU you want to expose in the lookbook:
   - `UPC`
   - `Pack Size`
   - `Case Pack Quantity`
   - `Wholesale Price`
   - `MSRP`
   - `Weight`
   - `Dimensions`
   - `Compliance Docs`
   - `Compliance Status`
5. If one style has multiple sellable options, split it into linked variants:
   - keep one base style row
   - create a separate product row for each sellable variant such as `1 Pack (Default)`, `3 Pack`, or `6 Packs`
   - on each child row, set `Parent Style` to the base style
   - set `Variant Title` to the buyer-facing option name
   - set `Variant Sort Order` to control display order
   - keep SKU, UPC, pricing, inventory, and pack/case data on the variant row itself
6. Open `Lookbooks` and create one or more templates.
7. Add the exact variant SKUs you want visible in each template.
8. Open `Accounts`, then open a retailer profile.
9. In the `Buyer Access` section, create a buyer, make sure `Order Mode Enabled` is checked, and assign a `Lookbook Template`.
10. Copy the buyer magic link from the retailer profile. The route format is:

```text
/lookbook/{access_token}
```

### Template editor flow

1. Open `Lookbooks` from the main navigation.
2. Create a new template with a name and optional description.
3. In the template editor:
   - search the catalog
   - add variant SKUs to the template assortment
   - remove variant SKUs from the template
   - set `Sort Order`
   - mark selected items as `Featured`
4. Save the template.

The template catalog now treats products as families plus variants:

- the main product name is the parent style
- the helper text shows the variant title
- buyers order the exact variant SKU that was added to the template

Each buyer can be assigned a different template. This lets you maintain:

- premium assortments
- basics-only assortments
- retailer-exclusive capsules
- seasonal or launch-specific lookbooks

### Buyer flow

1. Open the buyer magic link.
2. Review the wholesale product cards shown for that buyer’s assigned template.
3. Use the plus/minus stepper to add products by case only.
4. Review the live order summary on the right side.
5. Use one of the buyer actions:
   - `Save Draft`: saves quantities without inventory allocation
   - `Request Quote`: saves the order for internal review without inventory allocation
   - `Submit PO to SickFit`: validates buyer info, inventory, SKU/UPC data, and compliance, then creates a pending-approval PO and allocates inventory

After submit, the buyer sees a confirmation screen with the generated PO number.

If a buyer does not have a template assigned, the app falls back to showing all wholesale-ready products.

### Variant setup example

Use linked products whenever one style has multiple pack, pricing, or inventory options.

Example:

- Parent style: `3D Bean Cushioned Quarter Sock`
- Variant: `1 Pack (Default)`
- Variant: `3 Pack`
- Variant: `6 Packs`

Recommended setup:

- create one base style row for `3D Bean Cushioned Quarter Sock`
- create three child product rows with their own SKU, UPC, price, inventory, and pack metadata
- link each child row back to the base style with `Parent Style`
- set the variant labels and sort order on the child rows
- add the child rows, not just the base style, to your lookbook template

This is what makes variant-specific ordering, pricing, inventory allocation, and case math work correctly in the buyer lookbook.

### Internal review flow

1. Open `Purchase Orders`.
2. Filter or scan for orders in `Pending Approval`.
3. Open the PO detail page to review:
   - buyer info
   - compliance snapshot
   - allocation status
   - queued notifications
   - print-friendly PO preview
4. Use the approval actions on the PO detail page:
   - `Approve`
   - `Queue for Fulfillment`
   - `Reject / Cancel`

### PDF and email behavior in this MVP

- `Preview / Print` on the PO detail page is the current PDF/export path. Use the browser print dialog to save as PDF with the PO preview layout.
- Buyer and internal email sends are not live yet. Instead, the app writes queued notification records to `purchase_order_notifications` so a later Edge Function or mail provider can process them.

### Inventory behavior

- Drafts and quote requests do not allocate stock.
- Submitted buyer POs increase `inventory_allocated`.
- Allocated units stay in inventory until the PO is rejected, cancelled, or later fulfilled.
- Available-to-sell inventory is treated as:

```text
current_inventory - inventory_allocated
```

## Notes

- This MVP intentionally does not implement Supabase Auth, login, signup, or sessions.
- Supabase is used strictly as the database/backend layer.
- `002_public_mvp_policies.sql` creates wide-open RLS policies for a no-auth MVP. This is appropriate for development/demo use, but should be tightened before production.
- Business logic is kept in `src/services` and `src/utils`, with UI kept in `src/components`, `src/features`, and `src/pages`.
- If Supabase env vars are missing, the UI will still load but data-backed actions will prompt for configuration.

## Shopify Sync

Real Shopify sync is implemented through a Supabase Edge Function so the Shopify Admin token is never exposed in the browser.

Deploy the function:

```bash
supabase functions deploy shopify-sync
supabase functions deploy shopify-dashboard-sync
```

Set these Supabase function secrets before using `Sync Shopify` or `Sync All Shopify` from the Products page:

```bash
supabase secrets set SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
supabase secrets set SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
supabase secrets set SHOPIFY_ORDER_LOOKBACK_DAYS=120
supabase secrets set SHOPIFY_DASHBOARD_LOOKBACK_DAYS=365
```

The `shopify-sync` function will:

- fetch Shopify variants through the Admin GraphQL API
- fetch recent Shopify orders through the Admin GraphQL API
- match or create `products` by SKU
- update Shopify metadata on products
- sync inventory into `inventory_items` by Shopify location
- convert Shopify order line items into negative `Usage` records in `inventory_events`
- refresh `current_inventory` totals on synced products

The `shopify-dashboard-sync` function will:

- fetch up to a year of Shopify orders for dashboard reporting
- persist Shopify orders into `shopify_orders`
- persist Shopify order line items into `shopify_order_line_items`

## Production Planner & Simulator

A visual, non-destructive decision-support layer between inventory risk and a Manufacturer PO, built on top of the existing `/production` Manufacturing Orders / Reorder Queue / Capacity workflow (which is unchanged).

1. Run the new migration:
   [src/db/migrations/028_production_planner.sql](/src/db/migrations/028_production_planner.sql)
2. Open `Production & Restock` > `Planner & Simulator` in the sidebar (or `/production/planner`) to create a plan blank, from a template, from the SKU reorder queue, or by duplicating a prior plan.
3. On a plan's detail page, set the horizon/manufacturer/dates/demand method, add products with planned quantities and manufacturing specs, then **Run Simulation**. Simulating never writes to `products`, `inventory_items`, `inventory_events`, `capacity_snapshots`, or `purchase_orders` — it only persists an immutable, versioned result to `production_simulation_runs`.
4. Review the Simulation Results: inventory projection (baseline vs proposed), before/after coverage, production schedule, manufacturer capacity utilization, SKU risk matrix, and cost/quantity mix — all charts and the SKU table read from the same stored result so totals always reconcile. Save additional named scenarios and compare them side by side.
5. Once a plan is **Approved** (requires a current, non-stale simulation with zero readiness blockers), **Convert to Manufacturer PO** creates a real `po_type = "Manufacturer PO"` record via the existing Purchase Order service, preserving `source_production_plan_id`/`source_simulation_run_id` lineage. Conversion is idempotent and does not touch on-hand inventory — receiving inventory still goes through the existing Receive Inventory flow on `/production`.

Simulation math (`src/utils/productionSimulation.ts`) and recommendation rules (`src/utils/productionRecommendations.ts`) are pure, Supabase-free functions covered by unit tests in the same directory.
- write orders and line items in chunks so dashboard sync stays isolated from product sync
