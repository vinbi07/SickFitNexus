alter table public.products
  add column if not exists parent_product_id uuid references public.products(id) on delete set null,
  add column if not exists variant_title text,
  add column if not exists variant_sort_order integer not null default 0;

create index if not exists idx_products_parent_product on public.products(parent_product_id, variant_sort_order, name);
