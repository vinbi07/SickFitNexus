create table if not exists public.product_barcode_links (
  id uuid primary key default gen_random_uuid(),
  barcode_id uuid not null references public.product_barcodes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(barcode_id, product_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_barcodes'
      and column_name = 'product_id'
  ) then
    execute $migrate$
      insert into public.product_barcode_links (barcode_id, product_id)
      select id, product_id
      from public.product_barcodes
      where product_id is not null
      on conflict (barcode_id, product_id) do nothing
    $migrate$;
  end if;
end $$;

drop index if exists idx_product_barcodes_product;
alter table public.product_barcodes drop column if exists product_id;

create index if not exists idx_product_barcode_links_barcode on public.product_barcode_links(barcode_id);
create index if not exists idx_product_barcode_links_product on public.product_barcode_links(product_id);

alter table public.product_barcode_links enable row level security;

drop policy if exists "mvp_public_access_product_barcode_links" on public.product_barcode_links;
create policy "mvp_public_access_product_barcode_links" on public.product_barcode_links for all using (true) with check (true);
