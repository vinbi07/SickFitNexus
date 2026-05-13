create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  average_delay_days numeric default 0,
  reliability_score numeric default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text,
  unit_cost numeric default 0,
  current_inventory integer default 0,
  safety_stock integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'Draft',
  order_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  total_cost numeric default 0,
  source_file_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.po_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  product_name text not null,
  quantity_ordered integer default 0,
  quantity_received integer default 0,
  unit_cost numeric default 0,
  line_total numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  related_po_id uuid references public.purchase_orders(id) on delete set null,
  event_type text not null,
  quantity_change integer not null,
  event_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  row_count integer default 0,
  successful_rows integer default 0,
  failed_rows integer default 0,
  mapping_config jsonb default '{}'::jsonb,
  import_status text default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.csv_import_errors (
  id uuid primary key default gen_random_uuid(),
  csv_import_id uuid references public.csv_imports(id) on delete cascade,
  row_number integer not null,
  error_message text not null,
  raw_row jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapping_presets (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete set null,
  name text not null,
  mapping_config jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  is_resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  description text,
  external_url text,
  file_url text,
  tags text[] default '{}',
  is_favorite boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  related_entity_type text not null,
  related_entity_id uuid not null,
  commenter_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  title text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wins (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  related_entity_type text,
  related_entity_id uuid,
  created_by text,
  reaction_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  company text,
  email text,
  phone text,
  expertise_tags text[] default '{}',
  notes text,
  calendar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  description text,
  video_url text,
  resource_links jsonb default '[]'::jsonb,
  estimated_minutes integer default 0,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_progress (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.training_modules(id) on delete cascade,
  participant_name text not null,
  is_complete boolean default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  app_name text default 'SickFit Nexus',
  organization_name text default 'SickFit',
  logo_url text,
  primary_color text default '#e72027',
  secondary_color text default '#111111',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchase_orders_po_number on public.purchase_orders(po_number);
create index if not exists idx_po_line_items_sku on public.po_line_items(sku);
create index if not exists idx_inventory_events_product on public.inventory_events(product_id, event_date desc);
create index if not exists idx_alerts_entity on public.alerts(related_entity_type, related_entity_id);
create index if not exists idx_comments_entity on public.comments(related_entity_type, related_entity_id);

drop trigger if exists set_vendors_updated_at on public.vendors;
create trigger set_vendors_updated_at before update on public.vendors for each row execute function public.set_updated_at();
drop trigger if exists set_locations_updated_at on public.locations;
create trigger set_locations_updated_at before update on public.locations for each row execute function public.set_updated_at();
drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists set_purchase_orders_updated_at on public.purchase_orders;
create trigger set_purchase_orders_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
drop trigger if exists set_po_line_items_updated_at on public.po_line_items;
create trigger set_po_line_items_updated_at before update on public.po_line_items for each row execute function public.set_updated_at();
drop trigger if exists set_mapping_presets_updated_at on public.mapping_presets;
create trigger set_mapping_presets_updated_at before update on public.mapping_presets for each row execute function public.set_updated_at();
drop trigger if exists set_sops_updated_at on public.sops;
create trigger set_sops_updated_at before update on public.sops for each row execute function public.set_updated_at();
drop trigger if exists set_wins_updated_at on public.wins;
create trigger set_wins_updated_at before update on public.wins for each row execute function public.set_updated_at();
drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at before update on public.people for each row execute function public.set_updated_at();
drop trigger if exists set_training_modules_updated_at on public.training_modules;
create trigger set_training_modules_updated_at before update on public.training_modules for each row execute function public.set_updated_at();
drop trigger if exists set_training_progress_updated_at on public.training_progress;
create trigger set_training_progress_updated_at before update on public.training_progress for each row execute function public.set_updated_at();
drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
