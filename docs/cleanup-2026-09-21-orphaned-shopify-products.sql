-- Cleanup: 20 Nexus products whose Shopify variants no longer exist (confirmed with shopify-sync mode "lookup").
-- WRITES DATA. Review, then run once in the Supabase SQL editor. It is a single statement, so it is atomic.
-- Effect: marks the products ignored, unlinks them from Shopify, and zeroes their stock. Nothing is deleted;
-- history (55 events, 151 Shopify order lines) and all links stay in place.
-- Previous values are saved in docs/cleanup-2026-09-21-orphaned-shopify-products-snapshot.json.
-- Expected result: inventory_rows_zeroed = 20, products_ignored = 20.

with t as (
  select id from products where sku in (
    'CRW-P02-FNDR-UNI', 'CRW-P03-FNDR-UNI--50925280034980', 'CRW-P03-LMTD-UNI', 'CRW-P06-FNDR-UNI',
    'CRW-P06-FNDR-UNI--50925665222820', 'CRW-P10-FNDR-UNI', 'CRW-P10-FNDR-UNI--50952440217764',
    'SF-SCK-ANK-HNYCMB-1', 'SF-SCK-FRISCO-FALL', 'SF-SCK-OLV-GRV-FALL', 'SF-SCK-RNY-DAYS',
    'SHOPIFY-44384616775844', 'SHOPIFY-44384618479780', 'SHOPIFY-51220514373796', 'SHOPIFY-51247684976804',
    'SHOPIFY-51247719186596', 'SHOPIFY-51247719219364', 'SHOPIFY-51247719252132', 'SHOPIFY-51247719284900',
    'SLH-P01-000-UNI'
  )
),
i as (
  update inventory_items set quantity_on_hand = 0
  where product_id in (select id from t)
  returning 1
),
p as (
  update products
  set ignored = true, is_shopify_synced = false, current_inventory = 0, inventory_available = 0
  where id in (select id from t)
  returning 1
)
select (select count(*) from i) as inventory_rows_zeroed, (select count(*) from p) as products_ignored;

-- Afterwards, re-run docs/inventory-discrepancy-report.sql checks 1 and 7; both should return 0 rows.
-- Rollback: write the values from the snapshot JSON back by id (products: current_inventory, inventory_available,
-- ignored, is_shopify_synced; inventory_items: quantity_on_hand).
