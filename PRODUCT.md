# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is a solo operator running the SickFit wholesale/apparel operation end-to-end: purchasing, inventory, production, and retailer/account management. Not a multi-role team product today — one person wearing every hat (ops, buying, production tracking, account management).

## Product Purpose

SickFit Nexus is the operations command center for the SickFit brand: purchase orders, inventory, manufacturing/production tracking, retailer accounts, compliance, lookbooks/buyer assortments, barcodes, and reporting, all in one system. It exists to give a single operator a coherent, trustworthy view and workflow across the full wholesale lifecycle instead of juggling disconnected tools.

## Positioning

A unified wholesale + production + inventory system, not a point tool. Its mechanism is tying together CSV/PO intake, inventory, production status, and retailer account activity with shared lineage and history, so state in one area (e.g. a purchase order) is traceable through inventory and production rather than living in a separate spreadsheet or inbox thread.

## Operating Context

Workflows include: importing/normalizing wholesale order CSVs, building and progressing purchase orders through a wizard/lifecycle (approvals, invoices, fulfillment), tracking on-hand/incoming/allocated inventory and risk, managing retailer/buyer accounts and lookbook assortments, tracking production/manufacturing routes and invoices, and monitoring compliance holds and alerts. Shopify is the system of record for products/orders; Supabase is the backend/data layer.

## Capabilities and Constraints

- Shopify integration for product and order data sync.
- Supabase as the backend (auth, data, migrations).
- Barcode-book staging and product-barcode linking.
- Lookbook templates generate buyer-facing assortment previews/orders via shareable links (`/lookbook/:token`).
- Currently single-operator in practice; the app does support login/auth (`ProtectedRoute`, `AuthContext`) but is not presently used as a multi-role team tool.

## Brand Commitments

Brand name: SickFit (product surfaced as "SickFit Nexus"). Logo is fixed and served from the SickFit Shopify CDN (see `src/lib/branding.ts`).

## Product Principles

- One coherent system beats a patchwork of spreadsheets, Shopify admin tabs, and email threads.
- State should be traceable end-to-end: a PO's history should be visible through inventory and production, not siloed.
- Built for a solo operator's real workflow: fast intake (CSV/PO wizard), clear risk/status signals (alerts, compliance holds), not team-oriented permissioning or handoffs.
- Shopify remains the source of truth for catalog/orders; Nexus is the operations layer on top.
