alter table public.retailers
  add column if not exists logo_url text,
  add column if not exists brand_accent_color text,
  add column if not exists lookbook_intro text;

alter table public.buyers
  add column if not exists link_validity_days integer not null default 30;

create table if not exists public.lookbook_views (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.buyers(id) on delete set null,
  retailer_id uuid references public.retailers(id) on delete set null,
  access_token text not null,
  event_type text not null,
  session_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lookbook_views_buyer on public.lookbook_views(buyer_id, created_at desc);
create index if not exists idx_lookbook_views_retailer on public.lookbook_views(retailer_id, created_at desc);
create index if not exists idx_lookbook_views_token on public.lookbook_views(access_token, created_at desc);
create index if not exists idx_lookbook_views_event on public.lookbook_views(event_type, created_at desc);

alter table public.lookbook_views enable row level security;

drop policy if exists "mvp_public_access_lookbook_views" on public.lookbook_views;
create policy "mvp_public_access_lookbook_views" on public.lookbook_views for all using (true) with check (true);
