-- Repair: products.inventory_allocated drift (see docs/inventory-discrepancy-baseline.md, "Allocation
-- mismatch" section, for the investigation). WRITES DATA. Single atomic statement.
--
-- "Truth" for how many units of a product are legitimately held for wholesale right now is:
--   (a) the sum of po_line_items.unit_quantity across purchase_orders whose allocation_status is
--       'Allocated' or 'Queued for Fulfillment' (a submitted order still awaiting shipment), plus
--   (b) inventory_reservations.reserved_units where status = 'Awaiting Shopify' (a Shopify-linked
--       order that has shipped but is still held until the Shopify count is lowered — added by the
--       2026-09-21 fulfillment fix; a PO in this state already shows allocation_status = 'Fulfilled',
--       so it is not covered by (a)).
-- inventory_reservations rows with status 'Reserved'/'Released'/'Committed' are a separate ledger for
-- the approvals UI and are NOT authoritative for stock holds — do not compare against them (an earlier
-- version of check 5 in inventory-discrepancy-report.sql did, and that comparison was misleading).
--
-- Root cause of the drift: pre-fix, editing a product (including the "ignored" toggle) wrote back
-- whatever current_inventory/inventory_allocated value was cached in the browser at load time,
-- silently reverting later allocation changes. Fixed in src/services/supportService.ts saveProduct
-- on 2026-09-21; this statement repairs the historical damage, once.
--
-- Previous values for the 6 affected products are in docs/cleanup-2026-09-22-allocation-repair-snapshot.json.
-- Expected result: products_repaired = 6.

with truth as (
  select
    p.id,
    coalesce(po_sum.held, 0) + coalesce(r_sum.awaiting, 0) as allocated_truth
  from products p
  left join (
    select li.product_id, sum(li.unit_quantity) as held
    from po_line_items li
    join purchase_orders po on po.id = li.purchase_order_id
    where po.allocation_status in ('Allocated', 'Queued for Fulfillment')
    group by li.product_id
  ) po_sum on po_sum.product_id = p.id
  left join (
    select product_id, sum(reserved_units) as awaiting
    from inventory_reservations
    where status = 'Awaiting Shopify'
    group by product_id
  ) r_sum on r_sum.product_id = p.id
),
fixed as (
  update products p
  set
    inventory_allocated = truth.allocated_truth,
    inventory_available = greatest(p.current_inventory - truth.allocated_truth, 0)
  from truth
  where truth.id = p.id
    and coalesce(p.inventory_allocated, 0) <> truth.allocated_truth
  returning p.id
)
select count(*) as products_repaired from fixed;

-- Afterwards, re-run inventory-discrepancy-report.sql check 7 (should stay 0 rows) and the updated
-- check 5 (should return 0 rows).
-- Rollback: write the values from the snapshot JSON back by id (inventory_allocated, inventory_available).
