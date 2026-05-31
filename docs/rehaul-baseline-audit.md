# Rehaul Baseline Audit

Date: 2026-05-30

Purpose: capture the current SickFit Nexus implementation before the rehaul begins. This is a behavior-preserving audit only; no UI, service, route, or database behavior should change as part of this note.

## Current App Stack

- Vite 7 + React 19 + TypeScript 5, with `react-router-dom` 7 for routing.
- Supabase JS v2 for client data access, Supabase Postgres migrations under `src/db/migrations`, and Supabase Edge Functions under `supabase/functions`.
- Vitest + Testing Library + jsdom for tests.
- Recharts for dashboard/report charting.
- PapaParse for CSV import parsing.
- Vercel serverless auth endpoints under `api/auth`, though the current React auth context primarily uses Supabase RPC admin session functions from migration `018_dashboard_auth.sql`.
- Global styling is centralized in `src/styles.css`, with Copernicus font assets in `public/fonts` and brand image assets in `public/assets`.
- Shared app infrastructure includes `src/components/AppShell.tsx`, `src/components/TopBar.tsx`, `src/components/PageHeader.tsx`, data/table/modal/state components, and `src/hooks/useAsyncData.ts`.
- Domain models are hand-authored in `src/types/domain.ts`; generated or Supabase-oriented database types also exist in `src/types/supabase.ts` and `src/types/supabase.generated.ts`.

## Routes And Current Purpose

Top-level public routes:

- `/login`: admin login screen using `AuthContext`.
- `/lookbook/:token`: buyer-facing wholesale lookbook/order page for magic-link access.

Protected app routes inside `ProtectedRoute` and `AppShell`:

- `/`: Operations Dashboard. Shows wholesale revenue, DTC/Shopify revenue, inventory danger, reorder windows, manufacturing/invoice status, retailer visibility, alerts, activity, and chart summaries.
- `/imports`: CSV Import + Normalization. Uploads wholesale PO CSVs, maps headers, validates, commits, displays import history/errors, supports undo/reset-style import maintenance.
- `/purchase-orders`: Purchase Orders list. Filters/searches/sorts POs by status/type/vendor/retailer/location, shows operational counts, links to details, edit, duplicate, preview, and delete.
- `/purchase-orders/new`: Purchase Order Builder. Manual PO creation with retailer/buyer/location templates, catalog/barcode search, line item editing, live PO document preview, local autosave for new drafts.
- `/purchase-orders/:id`: Purchase Order detail workspace. Shows lifecycle, line items, generated document preview, reservations, status history, counter workflow, compliance holds, communications, documents, notifications, activity, comments, and lifecycle actions.
- `/purchase-orders/:id/edit`: Purchase Order Builder in edit mode.
- `/purchase-orders/:id/preview`: Dedicated PO document preview/print/save-to-PDF screen.
- `/pending-queue`: Internal pending intake queue for inbound retailer/order requests before conversion.
- `/inventory`: Inventory records, current/incoming quantities, COGS/margin, danger/no-bundles filters, adjustments, transfers, and event history.
- `/vendors`: Vendor CRUD plus operational performance context.
- `/retailers`: Accounts/Retailers list with account metadata, contact/SOP/shipping fields, reorder windows, and recent PO activity.
- `/retailers/:id`: Account profile with account rollups, locations, top SKUs, recent POs, buyer access/magic links, lookbook template assignment, and buyer management.
- `/compliance`: Retailer compliance requirements/documents, expiration/missing-doc tracking, and exportable packet data.
- `/production`: Manufacturing view focused on active SKUs in route, open/shipped invoices, incoming inventory, capacity snapshots, and production timeline data.
- `/locations`: Location CRUD for warehouses/stores linked to inventory and POs.
- `/products`: Product catalog CRUD with pricing, product images, inventory danger, Shopify fields, compliance fields, variants, barcode links, and no-bundles flag.
- `/products/:id`: SKU detail showing Shopify links, pricing, compliance, reservations, recent order history, and related generated PO documents.
- `/barcodes`: Barcode-book staging catalog with barcode row CRUD and product link management.
- `/lookbook-templates`: Reusable lookbook assortment builder for products/variants assigned to buyers.
- `/alerts`: Alert triage board and operating alert log.
- `/reports`: Executive reporting for PO health, vendor performance, inventory risk, delayed orders, and projected stockouts.
- `/sops`: SOP library CRUD for quick links, categories, favorites, and docs.
- `/wins`: Wins board CRUD.
- `/people`: People/contact directory CRUD.
- `/training`: Training module CRUD and participant completion tracking.
- `/settings`: Branding settings and dashboard prior-year baseline values.

## Current Modules

- Dashboard: `DashboardPage`, `dashboardService`, chart/card components, Shopify dashboard sync function hook.
- Purchase Orders: list/detail/builder/preview pages, `purchaseOrderService`, PO document utilities/actions, comments, reservation/status/counter/compliance workflows.
- Inventory: `InventoryPage`, `inventoryService`, inventory event source, transfer/adjust/allocation/release/fulfill helpers, operation utilities.
- Vendors: `VendorsPage`, `vendorService`.
- Accounts/Retailers: `RetailersPage`, `RetailerDetailPage`, `retailerService`, `buyerService`, lookbook buyer setup.
- Manufacturing: `ProductionPage`, `capacityService`, production timeline utilities, dashboard manufacturing snapshot fields.
- Products: `ProductsPage`, `ProductDetailPage`, support/product planning services, product variants and barcode links.
- Barcodes: `BarcodesPage`, barcode portions of `supportService`.
- Lookbooks: `LookbookOrderPage`, `LookbookTemplatesPage`, `lookbookOrderService`, `lookbookTemplateService`, `lookbookAnalyticsService`, lookbook utilities.
- Alerts: `AlertsPage`, `alertService`.
- Reports: `ReportsPage`, `reportService`.
- SOPs: `SopsPage`, base CRUD service.
- Wins: `WinsPage`, base CRUD service.
- People: `PeoplePage`, base CRUD service.
- Training: `TrainingPage`, base CRUD service.
- Settings: `SettingsPage`, base CRUD service and `AppSettings` domain type.

## Current PO Capabilities

- PO list supports status/type/vendor/retailer/location/search filters, summary cards, sorting, detail navigation, edit, duplicate, preview, and delete.
- Builder supports new/edit/duplicate flows, generated PO numbers, retailer/buyer/location field prefills, vendor selection, billing/shipping/payment/header fields, barcode-backed product search, line item add/remove/duplicate/reorder, totals, and live document preview.
- New builder drafts autosave to `localStorage`; edit mode saves directly through `purchaseOrderService`.
- Detail workspace supports approve, counter, queue for fulfillment, fulfill, reject/cancel, mailto handoff, print/save PDF, generated document history, document attachments, communication log, comments, compliance holds, reservation ledger, counter events, status history, activity, and notification queue.
- Service layer records generated HTML PO documents, status history, inventory reservations, compliance holds, and activity events.
- PO statuses/types already cover manufacturer, retailer, work order, customer reorder, pending approval, counter, on hold, in transit, fulfilled, closed, delayed, and issue states.

## Current Lookbook Capabilities

- Public magic-link route loads a buyer by token and tracks an opened event.
- Buyer access is linked to retailers/accounts and may be assigned a lookbook template.
- Lookbook templates define reusable assortments of product variants, with sort order and featured flags.
- Buyer page displays branded retailer intro/logo/accent color where configured.
- Order mode respects buyer enablement, retailer order-mode policy, EDI requirement, and token expiry.
- Buyers can review products, select case quantities within available inventory limits, see subtotal/unit counts, add notes, request quote, or submit PO.
- Save logic supports draft/quote/submit paths; submit validates buyer profile, validates selection/inventory, snapshots compliance, creates or updates retailer POs, writes line items, allocates inventory, queues notifications, records compliance holds, and records lookbook analytics.
- Existing non-closed buyer draft/counter/on-hold/pending orders hydrate back into the same live link.

## Current Inventory Capabilities

- Inventory list joins products, vendors, and locations and applies calculated safety stock for display.
- Inventory page shows total on-hand units, danger count, incoming units from dashboard snapshot, and inventory value.
- Inventory records can be created, edited, viewed, deleted, manually adjusted, and transferred between locations.
- Adjustments and transfers create `inventory_events`; product-level `current_inventory` and `inventory_available` are synced from inventory item totals and allocations.
- Danger logic currently treats on-hand quantity `25` or lower as red/danger.
- Inventory view surfaces product image, SKU, location, current quantity, incoming quantity, COGS, margin, no-bundles state, status, reorder window hints, and recent inventory history.
- Inventory service also supports allocation, release, and fulfillment flows used by lookbook/PO lifecycle actions.

## Current Dashboard Capabilities

- Dashboard snapshot reads POs, products, alerts, CSV imports, activity, SOPs, vendors, retailers, inventory events/items, PO line items, Shopify orders/line items, and app settings.
- Shows wholesale revenue separate from DTC/Shopify revenue, prior-YTD baseline, projected year-end, channel revenue, top SKUs, retailer pipeline, inventory status breakdown, vendor spend, retailer visibility, inventory danger alerts, SKU reorder windows, manufacturing metrics, recent alerts, and activity feed.
- Manufacturing dashboard areas include incoming inventory, active SKUs in route, open/shipped/in-route invoice counts, production-to-arrival timeline, incoming inventory by manufacturer, and manufacturing snapshot rows.
- Dashboard has a Shopify dashboard sync action that invokes the `shopify-dashboard-sync` Supabase function.

## Supabase And Migration Patterns

- Migrations are numbered sequentially from `001_init.sql` through `021_purchase_order_builder.sql`.
- Pattern is additive SQL: `create table if not exists`, `alter table ... add column if not exists`, idempotent indexes, RLS enablement, and broad MVP public policies in early/many migrations.
- Major schema areas include vendors, locations, products, purchase orders, line items, inventory events/items, CSV imports/errors/lineage, alerts, SOPs, comments, activity, wins, people, training, app settings, retailers/accounts, compliance, capacity, Shopify orders, buyers, lookbook templates/items/views, barcodes/links, dashboard auth, reservations, status history, counter events, compliance holds, generated PO documents, and inbound intake.
- Auth migration `018_dashboard_auth.sql` adds `dashboard_users`, `admin_sessions`, `login_attempts`, and admin RPC functions used by the React auth context.
- Supabase client is optional at runtime until used; `assertSupabase()` throws a configuration error if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are missing.
- There are Supabase Edge Functions for `shopify-sync` and `shopify-dashboard-sync`.

## Styling And UI Patterns

- Styling is global CSS in `src/styles.css`; there is no component-scoped CSS or utility framework.
- Main shell uses a fixed/sticky dark sidebar and content area with panels, cards, tables, modals, banners, and shared form classes.
- Brand colors are defined as CSS variables, with red/black/white as the dominant palette.
- Lookbook and PO document/builder styles live in the same global stylesheet.
- Existing UI relies on shared components and CSS class conventions; later rehaul work should preserve class usage or update shared components deliberately.

## Risks Before Implementation

- Domain types are hand-maintained separately from Supabase schema types, so schema changes can drift from `src/types/domain.ts`.
- Several service methods use broad `select("*")` and manual relation attachment, which makes field additions easy but can hide contract changes until runtime.
- RLS policies are broad MVP-style public access in many migrations; any auth/security rehaul must be careful and staged.
- Inventory mutation paths are spread across inventory service, lookbook submit, and PO lifecycle actions; rehaul work risks double allocation, missed release, or inventory/event mismatch.
- Dashboard snapshot computes many derived metrics client-side from many tables; changes to PO status semantics, source channels, or inventory fields can ripple into multiple dashboard cards.
- PO builder uses `localStorage` autosave and recent-item state; changing form shape can strand old drafts or hydrate bad data.
- Buyer lookbook route is public token-based and writes orders/line items/allocations; changes need strict validation and regression coverage.
- Some UI text/output shows mojibake characters in existing files, likely from encoding history. Avoid broad formatting rewrites until encoding strategy is deliberate.
- README setup migration list appears behind the latest migration count; implementation phases should confirm DB state before adding migrations.
- Build emits artifacts under `dist` and TypeScript build info files already exist; avoid treating generated files as source changes unless intentionally refreshed.

## Files Likely Touched In Later Phases

- Routing/navigation: `src/App.tsx`, `src/components/AppShell.tsx`, `src/components/TopBar.tsx`.
- Shared UI/state: `src/components/*`, `src/hooks/useAsyncData.ts`, `src/styles.css`.
- Domain/contracts: `src/types/domain.ts`, `src/types/supabase.ts`, `src/types/supabase.generated.ts`.
- PO workflows: `src/pages/PurchaseOrdersPage.tsx`, `src/pages/PurchaseOrderDetailPage.tsx`, `src/pages/PurchaseOrderBuilderPage.tsx`, `src/pages/PurchaseOrderPreviewPage.tsx`, `src/services/purchaseOrderService.ts`, `src/utils/purchaseOrderDocument.ts`, `src/utils/purchaseOrderActions.ts`.
- Lookbook workflows: `src/pages/LookbookOrderPage.tsx`, `src/pages/LookbookTemplatesPage.tsx`, `src/services/lookbookOrderService.ts`, `src/services/lookbookTemplateService.ts`, `src/services/lookbookAnalyticsService.ts`, `src/utils/lookbook.ts`.
- Inventory/manufacturing: `src/pages/InventoryPage.tsx`, `src/pages/ProductionPage.tsx`, `src/services/inventoryService.ts`, `src/services/capacityService.ts`, `src/utils/operations.ts`, `src/utils/productionTimeline.ts`.
- Dashboard/reports/alerts: `src/pages/DashboardPage.tsx`, `src/pages/ReportsPage.tsx`, `src/pages/AlertsPage.tsx`, `src/services/dashboardService.ts`, `src/services/reportService.ts`, `src/services/alertService.ts`.
- Accounts/vendors/products/barcodes/compliance: `src/pages/RetailersPage.tsx`, `src/pages/RetailerDetailPage.tsx`, `src/pages/VendorsPage.tsx`, `src/pages/ProductsPage.tsx`, `src/pages/ProductDetailPage.tsx`, `src/pages/BarcodesPage.tsx`, `src/pages/CompliancePage.tsx`, `src/services/retailerService.ts`, `src/services/buyerService.ts`, `src/services/vendorService.ts`, `src/services/supportService.ts`, `src/services/complianceService.ts`.
- Imports/intake: `src/pages/CsvImportsPage.tsx`, `src/pages/PendingQueuePage.tsx`, `src/features/csv-import/CsvImportWorkflow.tsx`, `src/services/csvImportService.ts`, `src/services/intakeService.ts`, `src/utils/csv.ts`.
- Auth/settings: `src/context/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/services/dashboardSessionService.ts`, `api/auth/*`, `src/pages/SettingsPage.tsx`.
- Database/functions later, but not in this audit: `src/db/migrations/*`, `src/db/seed.sql`, `supabase/functions/*`.

## Baseline Guardrails

- Do not change application behavior during this audit.
- Do not redesign UI during this audit.
- Do not create database migrations during this audit.
- Keep later rehaul phases incremental and verify `npm run build` after each meaningful phase.
