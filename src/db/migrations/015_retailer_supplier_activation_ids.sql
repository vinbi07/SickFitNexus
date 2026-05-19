alter table public.retailers
  add column if not exists supplier_id text,
  add column if not exists activation_id text;
