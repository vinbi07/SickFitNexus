# SickFit Nexus

SickFit Nexus is an Operational Command Center that turns messy PO CSVs into clean inventory intelligence, vendor visibility, forecasting alerts, and executive-ready reports.

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
- [src/db/seed.sql](/c:/Users/Vinbi/SickFitNexus/src/db/seed.sql)

4. Start the app:

```bash
npm run dev
```

5. Import the sample file from:

- [public/sample-po-import.csv](/c:/Users/Vinbi/SickFitNexus/public/sample-po-import.csv)

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
```

Set these Supabase function secrets before using `Sync Shopify` or `Sync All Shopify` from the Products page:

```bash
supabase secrets set SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
supabase secrets set SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
supabase secrets set SHOPIFY_ORDER_LOOKBACK_DAYS=120
```

The `shopify-sync` function will:

- fetch Shopify variants through the Admin GraphQL API
- fetch recent Shopify orders through the Admin GraphQL API
- match or create `products` by SKU
- update Shopify metadata on products
- sync inventory into `inventory_items` by Shopify location
- convert Shopify order line items into negative `Usage` records in `inventory_events`
- refresh `current_inventory` totals on synced products
