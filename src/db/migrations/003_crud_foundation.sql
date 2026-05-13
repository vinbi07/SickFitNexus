alter table public.vendors
  add column if not exists lead_time_days integer default 0;

alter table public.products
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists description text,
  add column if not exists unit_price numeric default 0;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  quantity_on_hand integer not null default 0,
  reorder_point integer not null default 0,
  target_stock integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, location_id)
);

create index if not exists idx_inventory_items_product_location
  on public.inventory_items(product_id, location_id);

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();
