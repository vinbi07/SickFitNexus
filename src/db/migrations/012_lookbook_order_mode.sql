create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  company_name text not null,
  buyer_name text not null,
  buyer_email text not null,
  phone text,
  billing_address text,
  shipping_address text,
  payment_terms text,
  order_mode_enabled boolean not null default false,
  compliance_requirements text,
  assigned_sales_rep text,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  token_expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists upc text,
  add column if not exists pack_size text,
  add column if not exists case_pack_quantity integer not null default 1,
  add column if not exists wholesale_price numeric not null default 0,
  add column if not exists msrp numeric not null default 0,
  add column if not exists weight text,
  add column if not exists dimensions text,
  add column if not exists inventory_available integer not null default 0,
  add column if not exists inventory_allocated integer not null default 0,
  add column if not exists compliance_docs_required text[] not null default '{}',
  add column if not exists compliance_docs_status text;

alter table public.purchase_orders
  add column if not exists buyer_id uuid references public.buyers(id) on delete set null,
  add column if not exists approval_status text not null default 'Not Requested',
  add column if not exists allocation_status text not null default 'Not Allocated',
  add column if not exists compliance_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists buyer_notes text,
  add column if not exists internal_notes text,
  add column if not exists start_ship_date date,
  add column if not exists ship_complete_date date,
  add column if not exists subtotal numeric not null default 0,
  add column if not exists total_units integer not null default 0,
  add column if not exists total_retail numeric not null default 0,
  add column if not exists requested_action text not null default 'draft',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists queued_for_fulfillment_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.po_line_items
  add column if not exists upc text,
  add column if not exists description text,
  add column if not exists unit text not null default 'EA',
  add column if not exists case_quantity integer not null default 0,
  add column if not exists unit_quantity integer not null default 0,
  add column if not exists unit_retail numeric not null default 0,
  add column if not exists extended_cost numeric not null default 0,
  add column if not exists extended_retail numeric not null default 0;

create table if not exists public.purchase_order_notifications (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  recipient_type text not null,
  recipient_name text,
  recipient_email text,
  channel text not null default 'email_queue',
  notification_type text not null,
  status text not null default 'queued',
  subject text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_buyers_retailer on public.buyers(retailer_id, order_mode_enabled);
create index if not exists idx_buyers_access_token on public.buyers(access_token);
create index if not exists idx_products_upc on public.products(upc);
create index if not exists idx_purchase_orders_buyer on public.purchase_orders(buyer_id, requested_action);
create index if not exists idx_purchase_order_notifications_po
  on public.purchase_order_notifications(purchase_order_id, status, created_at desc);

drop trigger if exists set_buyers_updated_at on public.buyers;
create trigger set_buyers_updated_at
before update on public.buyers
for each row execute function public.set_updated_at();

drop trigger if exists set_purchase_order_notifications_updated_at on public.purchase_order_notifications;
create trigger set_purchase_order_notifications_updated_at
before update on public.purchase_order_notifications
for each row execute function public.set_updated_at();

alter table public.buyers enable row level security;
alter table public.purchase_order_notifications enable row level security;

drop policy if exists "mvp_public_access_buyers" on public.buyers;
create policy "mvp_public_access_buyers" on public.buyers for all using (true) with check (true);

drop policy if exists "mvp_public_access_purchase_order_notifications" on public.purchase_order_notifications;
create policy "mvp_public_access_purchase_order_notifications" on public.purchase_order_notifications for all using (true) with check (true);
