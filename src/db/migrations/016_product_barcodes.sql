create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  handle text,
  product_name text not null,
  collection text,
  pack_quantity integer,
  pack_unit text,
  size text,
  barcode_upc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_barcodes_sku on public.product_barcodes(sku);
create index if not exists idx_product_barcodes_handle on public.product_barcodes(handle);

create table if not exists public.product_barcode_links (
  id uuid primary key default gen_random_uuid(),
  barcode_id uuid not null references public.product_barcodes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(barcode_id, product_id)
);

create index if not exists idx_product_barcode_links_barcode on public.product_barcode_links(barcode_id);
create index if not exists idx_product_barcode_links_product on public.product_barcode_links(product_id);

drop trigger if exists set_product_barcodes_updated_at on public.product_barcodes;
create trigger set_product_barcodes_updated_at
before update on public.product_barcodes
for each row execute function public.set_updated_at();

alter table public.product_barcodes enable row level security;
alter table public.product_barcode_links enable row level security;

drop policy if exists "mvp_public_access_product_barcodes" on public.product_barcodes;
create policy "mvp_public_access_product_barcodes" on public.product_barcodes for all using (true) with check (true);

drop policy if exists "mvp_public_access_product_barcode_links" on public.product_barcode_links;
create policy "mvp_public_access_product_barcode_links" on public.product_barcode_links for all using (true) with check (true);
