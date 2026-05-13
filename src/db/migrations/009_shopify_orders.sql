create table if not exists public.shopify_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  order_name text not null,
  source_name text,
  currency_code text,
  order_created_at timestamptz not null,
  cancelled_at timestamptz,
  current_total_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopify_order_line_items (
  id uuid primary key default gen_random_uuid(),
  shopify_line_item_id text not null unique,
  shopify_order_record_id uuid not null references public.shopify_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text,
  title text not null,
  quantity integer not null default 0,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shopify_orders_created_at
  on public.shopify_orders(order_created_at desc);

create index if not exists idx_shopify_order_line_items_order
  on public.shopify_order_line_items(shopify_order_record_id);

create index if not exists idx_shopify_order_line_items_product
  on public.shopify_order_line_items(product_id, sku);

drop trigger if exists set_shopify_orders_updated_at on public.shopify_orders;
create trigger set_shopify_orders_updated_at
before update on public.shopify_orders
for each row execute function public.set_updated_at();

drop trigger if exists set_shopify_order_line_items_updated_at on public.shopify_order_line_items;
create trigger set_shopify_order_line_items_updated_at
before update on public.shopify_order_line_items
for each row execute function public.set_updated_at();

alter table public.shopify_orders enable row level security;
alter table public.shopify_order_line_items enable row level security;

drop policy if exists "mvp_public_access_shopify_orders" on public.shopify_orders;
create policy "mvp_public_access_shopify_orders" on public.shopify_orders for all using (true) with check (true);

drop policy if exists "mvp_public_access_shopify_order_line_items" on public.shopify_order_line_items;
create policy "mvp_public_access_shopify_order_line_items" on public.shopify_order_line_items for all using (true) with check (true);
