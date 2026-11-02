-- Migration 031: Supply chain lead times and factory shutdowns
-- Planning defaults for factory orders (production, packing, freight, port to
-- warehouse, safety buffer) plus a list of factory shutdown windows such as
-- Chinese New Year. Expected milestone dates and order-by dates are computed
-- from these at query time (see src/utils/leadTime.ts).

create table if not exists public.supply_chain_settings (
  id                     uuid primary key default gen_random_uuid(),
  prod_days              integer not null default 30,
  pack_days              integer not null default 5,
  sea_days               integer not null default 35,
  air_days               integer not null default 10,
  port_to_wh_days        integer not null default 7,
  buffer_days            integer not null default 7,
  packaging_reorder_pct  integer not null default 20,
  sea_rate_per_pair      numeric(10,4),
  air_rate_per_pair      numeric(10,4),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists set_supply_chain_settings_updated_at on public.supply_chain_settings;
create trigger set_supply_chain_settings_updated_at
  before update on public.supply_chain_settings
  for each row execute function public.set_updated_at();

insert into public.supply_chain_settings (id)
select gen_random_uuid()
where not exists (select 1 from public.supply_chain_settings);

create table if not exists public.factory_shutdowns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint factory_shutdowns_range check (end_date >= start_date)
);

drop trigger if exists set_factory_shutdowns_updated_at on public.factory_shutdowns;
create trigger set_factory_shutdowns_updated_at
  before update on public.factory_shutdowns
  for each row execute function public.set_updated_at();

create index if not exists idx_factory_shutdowns_start_date on public.factory_shutdowns(start_date);

alter table public.supply_chain_settings enable row level security;
alter table public.factory_shutdowns enable row level security;

drop policy if exists "mvp_public_access_supply_chain_settings" on public.supply_chain_settings;
create policy "mvp_public_access_supply_chain_settings"
  on public.supply_chain_settings for all using (true) with check (true);

drop policy if exists "mvp_public_access_factory_shutdowns" on public.factory_shutdowns;
create policy "mvp_public_access_factory_shutdowns"
  on public.factory_shutdowns for all using (true) with check (true);
