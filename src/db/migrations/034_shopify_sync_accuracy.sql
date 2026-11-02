-- Migration 034: Shopify sync accuracy
-- * Variants deleted in Shopify were never cleaned up, so their last-known
--   stock kept counting. The sync now stamps shopify_removed_at and zeroes
--   their stock instead of deleting them (PO history still points at them).
-- * Shopify product status (active / draft / archived) is stored so archived
--   items can be hidden.
-- * Inventory keeps Shopify's three numbers separately: on hand (physically
--   there), available (sellable) and committed (in unfulfilled orders).
--   quantity_on_hand now means Shopify "on hand"; it used to hold "available".

alter table public.products
  add column if not exists shopify_status text,
  add column if not exists shopify_removed_at timestamptz;

create index if not exists idx_products_shopify_removed_at on public.products(shopify_removed_at);

alter table public.inventory_items
  add column if not exists quantity_available integer,
  add column if not exists quantity_committed integer;

-- Until the next sync fills them, available equals what was stored before.
update public.inventory_items
set quantity_available = quantity_on_hand
where quantity_available is null;
