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
- [src/db/seed.sql](/c:/Users/Vinbi/SickFitNexus/src/db/seed.sql)

4. Start the app:

```bash
npm run dev
```

5. Import the sample file from:

- [public/sample-po-import.csv](/c:/Users/Vinbi/SickFitNexus/public/sample-po-import.csv)

The sample import is now shaped around the preferred Shields-style wholesale format.

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
- write orders and line items in chunks so dashboard sync stays isolated from product sync
