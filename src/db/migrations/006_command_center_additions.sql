alter table public.products
  add column if not exists shopify_product_id text,
  add column if not exists shopify_variant_id text,
  add column if not exists shopify_handle text,
  add column if not exists shopify_admin_url text,
  add column if not exists shopify_storefront_url text,
  add column if not exists is_shopify_synced boolean not null default false,
  add column if not exists last_shopify_sync_at timestamptz,
  add column if not exists ancillary_category text;

alter table public.inventory_items
  add column if not exists inventory_category text not null default 'Core';

create table if not exists public.retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'Prospect',
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  ordering_cadence_days integer,
  next_reorder_start date,
  next_reorder_end date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locations
  add column if not exists retailer_id uuid references public.retailers(id) on delete set null;

alter table public.purchase_orders
  add column if not exists retailer_id uuid references public.retailers(id) on delete set null,
  add column if not exists po_type text not null default 'Manufacturer PO',
  add column if not exists submitted_at timestamptz,
  add column if not exists invoice_paid_at date,
  add column if not exists tracking_number text,
  add column if not exists tracking_status text,
  add column if not exists generated_form_url text,
  add column if not exists source_channel text;

create table if not exists public.purchase_order_messages (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  sender_name text not null,
  sender_role text,
  channel text not null default 'Internal Note',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  document_type text not null default 'Other',
  title text not null,
  file_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.compliance_requirement_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.retailer_compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  requirement_type_id uuid not null references public.compliance_requirement_types(id) on delete cascade,
  status text not null default 'Missing',
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(retailer_id, requirement_type_id)
);

create table if not exists public.retailer_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  retailer_requirement_id uuid not null references public.retailer_compliance_requirements(id) on delete cascade,
  title text not null,
  file_url text,
  uploaded_at timestamptz not null default now(),
  expires_at date
);

create table if not exists public.capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  capacity_type text not null default 'Manufacturer',
  partner_name text not null,
  lane_name text,
  available_units integer not null default 0,
  committed_units integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_retailers_name on public.retailers(name);
create index if not exists idx_purchase_orders_retailer on public.purchase_orders(retailer_id, po_type);
create index if not exists idx_purchase_order_messages_po on public.purchase_order_messages(purchase_order_id, created_at desc);
create index if not exists idx_purchase_order_documents_po on public.purchase_order_documents(purchase_order_id, created_at desc);
create index if not exists idx_retailer_compliance_requirements_retailer
  on public.retailer_compliance_requirements(retailer_id, status);
create index if not exists idx_capacity_snapshots_type_date
  on public.capacity_snapshots(capacity_type, snapshot_date desc);

drop trigger if exists set_retailers_updated_at on public.retailers;
create trigger set_retailers_updated_at
before update on public.retailers
for each row execute function public.set_updated_at();

drop trigger if exists set_retailer_compliance_requirements_updated_at on public.retailer_compliance_requirements;
create trigger set_retailer_compliance_requirements_updated_at
before update on public.retailer_compliance_requirements
for each row execute function public.set_updated_at();

drop trigger if exists set_capacity_snapshots_updated_at on public.capacity_snapshots;
create trigger set_capacity_snapshots_updated_at
before update on public.capacity_snapshots
for each row execute function public.set_updated_at();

alter table public.retailers enable row level security;
alter table public.purchase_order_messages enable row level security;
alter table public.purchase_order_documents enable row level security;
alter table public.compliance_requirement_types enable row level security;
alter table public.retailer_compliance_requirements enable row level security;
alter table public.retailer_compliance_documents enable row level security;
alter table public.capacity_snapshots enable row level security;

drop policy if exists "mvp_public_access_retailers" on public.retailers;
create policy "mvp_public_access_retailers" on public.retailers for all using (true) with check (true);

drop policy if exists "mvp_public_access_purchase_order_messages" on public.purchase_order_messages;
create policy "mvp_public_access_purchase_order_messages" on public.purchase_order_messages for all using (true) with check (true);

drop policy if exists "mvp_public_access_purchase_order_documents" on public.purchase_order_documents;
create policy "mvp_public_access_purchase_order_documents" on public.purchase_order_documents for all using (true) with check (true);

drop policy if exists "mvp_public_access_compliance_requirement_types" on public.compliance_requirement_types;
create policy "mvp_public_access_compliance_requirement_types" on public.compliance_requirement_types for all using (true) with check (true);

drop policy if exists "mvp_public_access_retailer_compliance_requirements" on public.retailer_compliance_requirements;
create policy "mvp_public_access_retailer_compliance_requirements" on public.retailer_compliance_requirements for all using (true) with check (true);

drop policy if exists "mvp_public_access_retailer_compliance_documents" on public.retailer_compliance_documents;
create policy "mvp_public_access_retailer_compliance_documents" on public.retailer_compliance_documents for all using (true) with check (true);

drop policy if exists "mvp_public_access_capacity_snapshots" on public.capacity_snapshots;
create policy "mvp_public_access_capacity_snapshots" on public.capacity_snapshots for all using (true) with check (true);
