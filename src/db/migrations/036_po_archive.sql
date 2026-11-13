-- Migration 036: Archive purchase orders
-- Archived POs drop out of the default PO list and the supply-chain map but
-- keep all their data. Clearing archived_at restores them.

alter table public.purchase_orders add column if not exists archived_at timestamptz;

create index if not exists purchase_orders_archived_at_idx
  on public.purchase_orders (archived_at)
  where archived_at is not null;
