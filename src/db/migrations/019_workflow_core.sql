alter table public.retailers
  add column if not exists default_payment_terms text,
  add column if not exists order_mode_policy text not null default 'enabled',
  add column if not exists edi_required boolean not null default false;

alter table public.purchase_orders
  add column if not exists currency_code text default 'USD',
  add column if not exists hold_reason text,
  add column if not exists counter_status text not null default 'None';

alter table public.po_line_items
  add column if not exists variant_label text,
  add column if not exists case_pack_quantity integer not null default 1;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  po_line_item_id uuid references public.po_line_items(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  reserved_units integer not null default 0,
  status text not null default 'Reserved',
  action_type text not null default 'submit',
  actor_user_id uuid references public.dashboard_users(id) on delete set null,
  actor_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_status_history (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.dashboard_users(id) on delete set null,
  actor_label text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_counter_events (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  actor_user_id uuid references public.dashboard_users(id) on delete set null,
  actor_label text,
  event_type text not null,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.compliance_holds (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  buyer_id uuid references public.buyers(id) on delete set null,
  retailer_id uuid references public.retailers(id) on delete set null,
  status text not null default 'Open',
  summary text not null,
  missing_docs text[] not null default '{}',
  notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_purchase_order_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  document_format text not null default 'html',
  title text not null,
  body_html text not null,
  created_by_user_id uuid references public.dashboard_users(id) on delete set null,
  created_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbound_intake_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null default 'order',
  source_channel text not null default 'Manual',
  status text not null default 'Pending',
  retailer_name text,
  buyer_name text,
  buyer_email text,
  subject text not null,
  notes text,
  requested_action text,
  converted_purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  converted_retailer_id uuid references public.retailers(id) on delete set null,
  created_by_user_id uuid references public.dashboard_users(id) on delete set null,
  created_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbound_intake_attachments (
  id uuid primary key default gen_random_uuid(),
  intake_request_id uuid not null references public.inbound_intake_requests(id) on delete cascade,
  title text not null,
  file_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_reservations_po on public.inventory_reservations(purchase_order_id, status);
create index if not exists idx_inventory_reservations_product on public.inventory_reservations(product_id, status);
create index if not exists idx_purchase_order_status_history_po on public.purchase_order_status_history(purchase_order_id, created_at desc);
create index if not exists idx_purchase_order_counter_events_po on public.purchase_order_counter_events(purchase_order_id, created_at desc);
create index if not exists idx_compliance_holds_status on public.compliance_holds(status, created_at desc);
create index if not exists idx_generated_purchase_order_documents_po on public.generated_purchase_order_documents(purchase_order_id, created_at desc);
create index if not exists idx_inbound_intake_requests_status on public.inbound_intake_requests(status, created_at desc);

drop trigger if exists set_inventory_reservations_updated_at on public.inventory_reservations;
create trigger set_inventory_reservations_updated_at before update on public.inventory_reservations
for each row execute function public.set_updated_at();

drop trigger if exists set_compliance_holds_updated_at on public.compliance_holds;
create trigger set_compliance_holds_updated_at before update on public.compliance_holds
for each row execute function public.set_updated_at();

drop trigger if exists set_generated_purchase_order_documents_updated_at on public.generated_purchase_order_documents;
create trigger set_generated_purchase_order_documents_updated_at before update on public.generated_purchase_order_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_inbound_intake_requests_updated_at on public.inbound_intake_requests;
create trigger set_inbound_intake_requests_updated_at before update on public.inbound_intake_requests
for each row execute function public.set_updated_at();

alter table public.inventory_reservations enable row level security;
alter table public.purchase_order_status_history enable row level security;
alter table public.purchase_order_counter_events enable row level security;
alter table public.compliance_holds enable row level security;
alter table public.generated_purchase_order_documents enable row level security;
alter table public.inbound_intake_requests enable row level security;
alter table public.inbound_intake_attachments enable row level security;

drop policy if exists "mvp_public_access_inventory_reservations" on public.inventory_reservations;
create policy "mvp_public_access_inventory_reservations" on public.inventory_reservations for all using (true) with check (true);

drop policy if exists "mvp_public_access_purchase_order_status_history" on public.purchase_order_status_history;
create policy "mvp_public_access_purchase_order_status_history" on public.purchase_order_status_history for all using (true) with check (true);

drop policy if exists "mvp_public_access_purchase_order_counter_events" on public.purchase_order_counter_events;
create policy "mvp_public_access_purchase_order_counter_events" on public.purchase_order_counter_events for all using (true) with check (true);

drop policy if exists "mvp_public_access_compliance_holds" on public.compliance_holds;
create policy "mvp_public_access_compliance_holds" on public.compliance_holds for all using (true) with check (true);

drop policy if exists "mvp_public_access_generated_purchase_order_documents" on public.generated_purchase_order_documents;
create policy "mvp_public_access_generated_purchase_order_documents" on public.generated_purchase_order_documents for all using (true) with check (true);

drop policy if exists "mvp_public_access_inbound_intake_requests" on public.inbound_intake_requests;
create policy "mvp_public_access_inbound_intake_requests" on public.inbound_intake_requests for all using (true) with check (true);

drop policy if exists "mvp_public_access_inbound_intake_attachments" on public.inbound_intake_attachments;
create policy "mvp_public_access_inbound_intake_attachments" on public.inbound_intake_attachments for all using (true) with check (true);
