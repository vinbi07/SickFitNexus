# Inventory discrepancy baseline: 2026-09-21

Produced by [inventory-discrepancy-report.sql](inventory-discrepancy-report.sql) against the linked Supabase project (read-only). Re-run the same file later and compare against this table.

| Check | Result | Notes |
|---|---|---|
| 1. `current_inventory` vs sum of `inventory_items` | **0 rows** | Pass. |
| 2. Negative inventory rows | **7 rows** | All at "SickFit", lowest −8. All are products with generated `SHOPIFY-<id>` SKUs (no SKU set in Shopify). Shopify oversells are legitimate; no fix needed in Nexus. |
| 3a. Duplicate PO numbers | **3 numbers, 8 rows** | `PO-20260529-0001` ×2 (both Draft Retailer POs), `PO-20260603-0001` ×2 (Draft Retailer PO and Cancelled Manufacturer PO), `PO-20260603-0003` ×4 (Pending Retailer PO, two Ordered Manufacturer POs, one Draft Manufacturer PO). |
| 3b. Duplicate invoice numbers | **0 rows** | Pass. |
| 4. Duplicate sock-card deductions | **0 rows** | Pass. Note `sockCardService.confirmDraw` has no idempotency guard, so this can still happen. |
| 5. Allocations vs active reservations | **10 products differ** | Total allocated is 86 units across products; 9 reservation rows exist. See below. |
| 6. Duplicate inventory events | **0 rows** | Pass. |
| 7. Stored `inventory_available` vs `current − allocated` | **311 of 496 products differ** | See below. This is the most important result. |
| 8. Snapshot | 496 products, 485 Shopify-linked, 487 inventory rows, 1,864 events, 9 reservations, 0 awaiting Shopify, 86 units allocated | For later comparison. |

## Update after fixes (2026-09-21)

- `shopify-sync` redeployed and Sync All run: check 7 dropped from 311 rows to 14.
- The remaining 14 (plus 6 more) were 20 orphaned products whose Shopify variants no longer exist. Ignored, unlinked and zeroed with [cleanup-2026-09-21-orphaned-shopify-products.sql](cleanup-2026-09-21-orphaned-shopify-products.sql) (20 products, 20 stock rows, 20,438 units; previous values in the `-snapshot.json` file).
- Re-run afterwards: **check 1 = 0 rows, check 7 = 0 rows.** 465 products are Shopify-linked and all were seen by the latest sync. Checks 3a (duplicate PO numbers) and 5 (allocations vs reservations) are still open.

## Check 7: stale available counts (resolved, see update above)

`shopify-sync` used to write `current_inventory` without recomputing `inventory_available`, so the stored available count drifted on 311 products. Examples: `current_inventory` 65 with `inventory_available` 0; `current_inventory` −2 with `inventory_available` 99. Lookbook ordering and the PO screens read `inventory_available`, so buyers can see wrong availability today.

The fix is already in `supabase/functions/shopify-sync/index.ts` (not yet deployed). After deploying, run "Sync All" once and re-run check 7: it should return 0 rows. Any product still differing after that has a real allocation problem (check 5).

## Check 5: allocation mismatch — investigated and repaired (2026-09-22)

The original version of this check compared `inventory_allocated` against active `inventory_reservations`. That comparison was wrong: `inventory_reservations` is a separate ledger, written only by `purchaseOrderService.approve` / `reject` / `queueForFulfillment` / `fulfill`, not at lookbook submit time (`lookbookOrderService.save` calls `inventoryService.allocateProducts` directly). A submitted-but-not-yet-approved order legitimately has `inventory_allocated > 0` with no reservation row yet, so the two are not supposed to always match. Check 5 has been rewritten in `inventory-discrepancy-report.sql` to compare `inventory_allocated` against the actual PO line items instead (units on POs with `allocation_status` `Allocated` or `Queued for Fulfillment`, plus units on `Awaiting Shopify` reservations).

Against that corrected definition, 6 products had a real mismatch, traced by joining each product's `inventory_allocated` to its `po_line_items` / `purchase_orders` rows:

| Product | Stored | Real POs referencing it | Truth |
|---|---|---|---|
| `SLH-P01-000-UNI--45760437682340` | 36 | None with `allocation_status = Allocated` (only Draft/Ordered-Manufacturer rows) | 0 |
| `SLH-P01-000-UNI--45760527564964` | 12 | None | 0 |
| `SHOPIFY-51225652920484` | 12 | None | 0 |
| `CRW-P06-ESS-UNI` | 4 | None | 0 |
| `CRW-P06-ESS-UNI--50917998657700` | 4 | None | 0 |
| `SHOPIFY-51071815516324` | 18 | One PO (`SF-20260522-001`) genuinely Pending Approval/Allocated for 6 units; the rest are Draft or Cancelled | 6 |

Root cause: before the 2026-09-21 fix to `supportService.saveProduct` (H1), editing a product — including the "ignored" toggle — wrote back whatever `inventory_allocated` value was cached in the browser at load time, silently reverting later allocation changes. These 6 rows are historical damage from that bug, not something currently happening.

**Repaired** with [cleanup-2026-09-22-allocation-repair.sql](cleanup-2026-09-22-allocation-repair.sql) (values before the change saved in `cleanup-2026-09-22-allocation-repair-snapshot.json`). Result: `products_repaired = 6`. Re-run: **check 5 = 0 rows, check 7 = 0 rows** (available recalculated in the same statement). `SHOPIFY-51071815516324` went from 0 available (falsely, `current_inventory` 17 minus a stuck 18) to 11 available.

## Duplicate PO numbers

Two of the duplicates are Draft Retailer POs and one pairs a Retailer PO with Manufacturer POs, so numbering comes from more than one place (`generatePoNumber` counts existing rows by date prefix, which can repeat when the builder and wizard create POs close together). No unique constraint exists on `purchase_orders.po_number` (only a plain index). Cleaning these up needs a decision on which rows to renumber, so nothing was changed.
