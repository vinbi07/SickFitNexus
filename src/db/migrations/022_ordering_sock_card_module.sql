-- Phase 1: Ordering & Sock Card Inventory Module
-- Idempotent migration — safe to run multiple times.

-- ─────────────────────────────────────────────
-- 4.1  order_designs  (internal catalog)
-- ─────────────────────────────────────────────
create table if not exists public.order_designs (
  id                    uuid        primary key default gen_random_uuid(),
  name                  text        not null,
  type                  text        not null default 'standard',
  partner               text,
  colorway              text,
  hex                   text,
  pantone               text,
  construction          text,
  default_sock_card_id  text,
  barcode               text,
  barcode_required      boolean     not null default false,
  retail_price          numeric     default 0,
  exw_cost              numeric     default 1.89,
  foot_text             text,
  rib_lr                boolean     not null default true,
  toe                   boolean     not null default true,
  pattern               boolean     not null default false,
  signature             boolean     not null default false,
  art_file_ref          text,
  mockup_file_ref       text,
  art_status            text        not null default 'NEEDED',
  in_shopify            boolean     not null default false,
  shopify_product_id    text,
  product_id            uuid references public.products(id)          on delete set null,
  barcode_id            uuid references public.product_barcodes(id)  on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_order_designs_name    on public.order_designs(name);
create index if not exists idx_order_designs_partner on public.order_designs(partner);
create index if not exists idx_order_designs_barcode on public.order_designs(barcode);

-- ─────────────────────────────────────────────
-- 4.2  sock_cards  (packaging cards)
-- ─────────────────────────────────────────────
create table if not exists public.sock_cards (
  id             text        primary key,
  name           text        not null,
  pack_pairs     integer     not null,
  size           text,
  style          text,
  on_hand        integer     not null default 0,
  reorder_point  integer     not null default 2500,
  supplier       text,
  unit_cost      numeric,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 4.3  Seed sock card options
-- ─────────────────────────────────────────────
insert into public.sock_cards (id, name, pack_pairs, size, style, reorder_point)
values
  ('1p-onesize-crew',   '1 pair (one size) crew',   1, 'One size',                  'Crew',   2500),
  ('1p-small-crew',     '1 pair (small) crew',       1, 'Small (US M6 / W4-8)',      'Crew',   2500),
  ('1p-onesize-slouch', '1 pair (one size) slouch',  1, 'One size',                  'Slouch', 2500),
  ('6pk-small-ankle',   '6 pack small ankle',        6, 'Small (US M6 / W4-8)',      'Ankle',  2500),
  ('6pk-medium-ankle',  '6 pack medium ankle',       6, 'Medium (US M7-12 / W8-13)', 'Ankle',  2500),
  ('3pk-onesize',       '3 pack (one size)',          3, 'One size',                  null,     2500)
on conflict (id) do update set
  name          = excluded.name,
  pack_pairs    = excluded.pack_pairs,
  size          = excluded.size,
  style         = excluded.style,
  reorder_point = excluded.reorder_point;

-- ─────────────────────────────────────────────
-- 4.4  sock_card_txns  (inventory ledger)
-- ─────────────────────────────────────────────
create table if not exists public.sock_card_txns (
  id                  uuid        primary key default gen_random_uuid(),
  sock_card_id        text        references public.sock_cards(id) on delete restrict,
  purchase_order_id   uuid        references public.purchase_orders(id) on delete cascade,
  po_line_item_id     uuid        references public.po_line_items(id)   on delete cascade,
  quantity_change     integer     not null,
  cards_used          integer     not null,
  txn_type            text        not null default 'order_confirmed',
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sock_card_txns_card on public.sock_card_txns(sock_card_id, created_at desc);
create index if not exists idx_sock_card_txns_po   on public.sock_card_txns(purchase_order_id);

-- ─────────────────────────────────────────────
-- 4.5  Extend po_line_items with manufacturer fields
-- ─────────────────────────────────────────────
alter table public.po_line_items
  add column if not exists design_id         uuid    references public.order_designs(id) on delete set null,
  add column if not exists spec_snapshot     jsonb   default '{}'::jsonb,
  add column if not exists sock_card_id      text    references public.sock_cards(id)    on delete set null,
  add column if not exists pack_pairs        integer default 1,
  add column if not exists sock_size         text,
  add column if not exists construction      text,
  add column if not exists cards_used        integer default 0,
  add column if not exists box_no            text,
  add column if not exists pantone           text,
  add column if not exists barcode_required  boolean default false,
  add column if not exists art_status        text    default 'NEEDED',
  add column if not exists art_note          text,
  add column if not exists mockup_file_ref   text,
  add column if not exists artwork_file_ref  text,
  add column if not exists rib_lr            boolean default true,
  add column if not exists toe               boolean default true,
  add column if not exists pattern           boolean default false,
  add column if not exists signature         boolean default false,
  add column if not exists foot_text         text;
