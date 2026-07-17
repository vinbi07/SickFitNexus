alter table public.products
  add column if not exists ignored boolean not null default false;

create index if not exists idx_products_ignored on public.products(ignored);
