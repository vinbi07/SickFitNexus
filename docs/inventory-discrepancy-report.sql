-- Inventory discrepancy report. READ-ONLY: every statement is a SELECT.
-- Run each check separately (Supabase SQL editor, or `supabase db query --linked "<sql>"`).
-- A check that returns no rows is a pass, except checks 2 and 8 which return a count/summary.
-- Baseline results from 2026-09-21 are in docs/inventory-discrepancy-baseline.md.

-- CHECK 1: products.current_inventory vs the sum of inventory_items (expect 0 rows)
select p.sku, p.current_inventory, coalesce(sum(i.quantity_on_hand), 0) as items_total
from products p
left join inventory_items i on i.product_id = p.id
group by p.id
having p.current_inventory <> coalesce(sum(i.quantity_on_hand), 0)
order by abs(p.current_inventory - coalesce(sum(i.quantity_on_hand), 0)) desc;

-- CHECK 2: negative inventory rows (Shopify allows oversold negatives; review, do not auto-fix)
select p.sku, l.name as location, i.quantity_on_hand
from inventory_items i
join products p on p.id = i.product_id
join locations l on l.id = i.location_id
where i.quantity_on_hand < 0
order by i.quantity_on_hand;

-- CHECK 3a: duplicate PO numbers (expect 0 rows)
select po_number, count(*) as copies, array_agg(id) as ids
from purchase_orders
group by po_number
having count(*) > 1;

-- CHECK 3b: duplicate invoice numbers (expect 0 rows)
select invoice_number, count(*) as copies, array_agg(id) as ids
from invoices
group by invoice_number
having count(*) > 1;

-- CHECK 4: duplicate sock-card deductions for the same PO line (expect 0 rows)
select purchase_order_id, po_line_item_id, sock_card_id, txn_type, count(*) as copies, sum(cards_used) as cards_deducted
from sock_card_txns
where txn_type = 'order_confirmed'
group by purchase_order_id, po_line_item_id, sock_card_id, txn_type
having count(*) > 1;

-- CHECK 5: allocations vs "truth" (expect 0 rows). Truth = units on PO lines whose PO has
-- allocation_status 'Allocated' or 'Queued for Fulfillment', plus units on 'Awaiting Shopify'
-- reservations (shipped, held until the Shopify count is lowered — see the 2026-09-21 fulfillment fix).
-- inventory_reservations.status 'Reserved'/'Released'/'Committed' is a separate ledger for the
-- approvals UI and is NOT authoritative for stock holds; do not compare inventory_allocated against it
-- (an earlier version of this check did, and produced false positives — see
-- docs/inventory-discrepancy-baseline.md, "Allocation mismatch").
select
  p.sku,
  p.inventory_allocated as stored,
  coalesce(po_sum.held, 0) + coalesce(r_sum.awaiting, 0) as truth
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
where coalesce(p.inventory_allocated, 0) <> coalesce(po_sum.held, 0) + coalesce(r_sum.awaiting, 0)
order by abs(coalesce(p.inventory_allocated, 0) - (coalesce(po_sum.held, 0) + coalesce(r_sum.awaiting, 0))) desc;

-- CHECK 6: duplicate inventory events by source (expect 0 rows)
select source_system, source_reference, count(*) as copies
from inventory_events
where source_system is not null and source_reference is not null
group by source_system, source_reference
having count(*) > 1;

-- CHECK 7: stored available count vs current - allocated (expect 0 rows)
select sku, current_inventory, inventory_allocated, inventory_available,
       greatest(current_inventory - coalesce(inventory_allocated, 0), 0) as expected_available
from products
where inventory_available is distinct from greatest(current_inventory - coalesce(inventory_allocated, 0), 0);

-- CHECK 8: snapshot counts for comparison over time
select
  (select count(*) from products) as products,
  (select count(*) from products where is_shopify_synced) as shopify_linked,
  (select count(*) from inventory_items) as inventory_rows,
  (select count(*) from inventory_events) as events,
  (select count(*) from inventory_reservations) as reservations,
  (select count(*) from inventory_reservations where status = 'Awaiting Shopify') as awaiting_shopify,
  (select coalesce(sum(inventory_allocated), 0) from products) as total_allocated;
