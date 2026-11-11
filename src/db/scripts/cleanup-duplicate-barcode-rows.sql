-- One-off cleanup: remove stale barcode-book rows left over from the first import.
--
-- The May/June import used placeholder SKUs ("SF-" + last 6 digits of the UPC).
-- The Nov 2 re-import used real SKUs, and since the importer matches on SKU it
-- added new rows instead of updating the old ones. Every UPC that exists on both
-- an old "SF-" row and a newer real-SKU row shows as "Duplicate: Also on SF-…".
--
-- What this does, per stale "SF-" row that has a real-SKU twin with the same UPC:
--   1. Moves its links to the twin when there is exactly one twin, for products
--      whose Shopify UPC equals the code or is blank (blank keeps the "Shopify has
--      no barcode; the book says …" hint; review those). Links to a product with a
--      different UPC (e.g. the 3-pack linked to the 6-pack's code) are wrong and
--      are dropped.
--   2. Deletes the stale row (its remaining links go with it via ON DELETE CASCADE).
--
-- Not touched: codes shared only between real SKUs, or only between "SF-" rows
-- (850065635101 between two real SKUs, 850065635484 Sandstone/Desert Sand).
-- Those are genuine conflicts to resolve against GS1 by hand.
--
-- Run in the Supabase SQL editor. Step 1 is read-only; run it first and check
-- the list. Step 2 runs in a transaction; swap COMMIT for ROLLBACK to dry-run.

-- ── Step 1: preview ─────────────────────────────────────────────────────────
with book as (
  select id, sku, product_name, created_at,
         regexp_replace(coalesce(barcode_upc, ''), '\D', '', 'g') as code
  from public.product_barcodes
),
twins as (
  select code, array_agg(sku order by sku) as real_skus, count(*) as twin_count
  from book
  where sku not like 'SF-%' and code <> ''
  group by code
)
select b.sku as stale_sku,
       b.product_name,
       b.code,
       t.real_skus as replaced_by,
       (select string_agg(p.sku || case when t.twin_count > 1 then ' (dropped: 2+ twins)'
                                        when coalesce(p.upc, '') = '' then ' (moves, no UPC in Shopify)'
                                        when regexp_replace(p.upc, '\D', '', 'g') = b.code then ' (moves)'
                                        else ' (dropped: UPC ' || p.upc || ')' end, ', ')
          from public.product_barcode_links l
          join public.products p on p.id = l.product_id
         where l.barcode_id = b.id) as links
from book b
join twins t on t.code = b.code
where b.sku like 'SF-%'
order by b.code;

-- ── Step 2: cleanup ─────────────────────────────────────────────────────────
begin;

create temp table stale_barcode_rows on commit drop as
with book as (
  select id, sku, regexp_replace(coalesce(barcode_upc, ''), '\D', '', 'g') as code
  from public.product_barcodes
),
twins as (
  select code, (array_agg(id))[1] as twin_id, count(*) as twin_count
  from book
  where sku not like 'SF-%' and code <> ''
  group by code
)
select b.id as stale_id, b.code, t.twin_id, t.twin_count
from book b
join twins t on t.code = b.code
where b.sku like 'SF-%';

-- 1. Carry correct (or blank-UPC) links over to the real-SKU row.
insert into public.product_barcode_links (barcode_id, product_id)
select s.twin_id, l.product_id
from stale_barcode_rows s
join public.product_barcode_links l on l.barcode_id = s.stale_id
join public.products p on p.id = l.product_id
where s.twin_count = 1
  and regexp_replace(coalesce(p.upc, ''), '\D', '', 'g') in (s.code, '')
on conflict (barcode_id, product_id) do nothing;

-- 2. Remove the stale rows (their links cascade).
delete from public.product_barcodes
where id in (select stale_id from stale_barcode_rows);

-- Sanity check: codes still shared by more than one SKU (should be only the
-- genuine conflicts named above).
select regexp_replace(barcode_upc, '\D', '', 'g') as code, array_agg(sku order by sku) as skus
from public.product_barcodes
where coalesce(barcode_upc, '') <> ''
group by 1
having count(distinct sku) > 1;

commit;  -- or: rollback;
