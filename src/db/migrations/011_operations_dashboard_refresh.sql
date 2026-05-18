alter table public.products
  add column if not exists image_url text,
  add column if not exists no_bundles boolean not null default false;

alter table public.retailers
  add column if not exists secondary_contacts text,
  add column if not exists account_number text,
  add column if not exists shipping_requirements text,
  add column if not exists sop_notes text,
  add column if not exists parent_retailer_id uuid references public.retailers(id) on delete set null,
  add column if not exists retailer_group text;

alter table public.purchase_orders
  add column if not exists ship_date date,
  add column if not exists eta_date date,
  add column if not exists invoice_status text,
  add column if not exists shipment_status text;

create table if not exists public.record_audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action_type text not null,
  actor_label text,
  change_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_no_bundles on public.products(no_bundles);
create index if not exists idx_retailers_parent on public.retailers(parent_retailer_id, retailer_group);
create index if not exists idx_purchase_orders_invoice_status on public.purchase_orders(invoice_status, ship_date, eta_date);
create index if not exists idx_record_audit_logs_entity on public.record_audit_logs(entity_type, entity_id, created_at desc);

alter table public.record_audit_logs enable row level security;

drop policy if exists "mvp_public_access_record_audit_logs" on public.record_audit_logs;
create policy "mvp_public_access_record_audit_logs" on public.record_audit_logs for all using (true) with check (true);
