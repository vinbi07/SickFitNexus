-- Migration 024: Invoice system
-- Creates invoices and invoice_line_items tables as a parallel structure to
-- purchase_orders / po_line_items.  source_po_id records which PO was the
-- origin when a PO is converted to an invoice.

create table if not exists public.invoices (
  id                       uuid primary key default gen_random_uuid(),
  invoice_number           text not null,
  source_po_id             uuid references public.purchase_orders(id) on delete set null,
  vendor_id                uuid references public.vendors(id)   on delete set null,
  retailer_id              uuid references public.retailers(id) on delete set null,
  buyer_id                 uuid references public.buyers(id)    on delete set null,
  location_id              uuid references public.locations(id) on delete set null,
  status                   text not null default 'Draft',  -- Draft | Sent | Paid | Void
  order_date               date,
  ship_date                date,
  start_ship_date          date,
  ship_complete_date       date,
  eta_date                 date,
  expected_delivery_date   date,
  actual_delivery_date     date,
  submitted_at             timestamptz,
  bill_to_company_name     text,
  bill_to_contact_name     text,
  bill_to_street           text,
  bill_to_city             text,
  bill_to_state            text,
  bill_to_zip              text,
  bill_to_phone            text,
  bill_to_email            text,
  ship_to_company_name     text,
  ship_to_attention        text,
  ship_to_street           text,
  ship_to_city             text,
  ship_to_state            text,
  ship_to_zip              text,
  ship_to_phone            text,
  payment_terms_snapshot   text,
  buyer_name_snapshot      text,
  approver_name_snapshot   text,
  subtotal                 numeric  not null default 0,
  total_cost               numeric  not null default 0,
  total_units              integer  not null default 0,
  total_retail             numeric  not null default 0,
  currency_code            text     not null default 'USD',
  notes                    text,
  buyer_notes              text,
  internal_notes           text,
  source_channel           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.invoice_line_items (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid    not null references public.invoices(id) on delete cascade,
  product_id           uuid    references public.products(id) on delete set null,
  sku                  text    not null,
  upc                  text,
  product_name         text    not null,
  variant_label        text,
  description          text,
  unit                 text    not null default 'EA',
  case_pack_quantity   integer not null default 1,
  case_quantity        integer not null default 0,
  unit_quantity        integer not null default 0,
  quantity_ordered     integer not null default 0,
  quantity_received    integer not null default 0,
  unit_cost            numeric not null default 0,
  unit_retail          numeric not null default 0,
  line_total           numeric not null default 0,
  extended_cost        numeric not null default 0,
  extended_retail      numeric not null default 0,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── RLS (mirrors mvp_public_access pattern from migration 002) ───────────────

alter table public.invoices           enable row level security;
alter table public.invoice_line_items enable row level security;

drop policy if exists "mvp_public_access_invoices" on public.invoices;
create policy "mvp_public_access_invoices"
  on public.invoices for all using (true) with check (true);

drop policy if exists "mvp_public_access_invoice_line_items" on public.invoice_line_items;
create policy "mvp_public_access_invoice_line_items"
  on public.invoice_line_items for all using (true) with check (true);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_invoices_source_po_id
  on public.invoices(source_po_id);

create index if not exists idx_invoice_line_items_invoice_id
  on public.invoice_line_items(invoice_id);
