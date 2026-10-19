-- Migration 031: PO PDF import -> Retailer POs -> invoices
-- Adds invoice dates/terms fields, retailer item numbers on lines, learned
-- retailer item -> product mappings, an import audit table, and an atomic
-- invoice number sequence that continues the QuickBooks numbering.

-- ─── Invoices ────────────────────────────────────────────────────────────────

alter table public.invoices
  add column if not exists invoice_date       date,
  add column if not exists due_date           date,
  add column if not exists customer_po_number text,
  add column if not exists stock_warnings     jsonb not null default '[]'::jsonb;

-- One invoice per source PO, so converting the same PO twice is a no-op.
create unique index if not exists uq_invoices_source_po_id
  on public.invoices(source_po_id)
  where source_po_id is not null;

alter table public.po_line_items
  add column if not exists retailer_item_number text;

alter table public.invoice_line_items
  add column if not exists retailer_item_number text;

-- ─── Invoice numbering ───────────────────────────────────────────────────────
-- Continues the QuickBooks sequence (last sample invoice was 24387). To move the
-- sequence later: select setval('public.invoice_number_seq', <last used number>);

create sequence if not exists public.invoice_number_seq;

do $$
begin
  if (select last_value from public.invoice_number_seq) < 24387 then
    perform setval('public.invoice_number_seq', 24387);
  end if;
end $$;

create or replace function public.next_invoice_number()
returns text
language sql
volatile
as $$
  select nextval('public.invoice_number_seq')::text;
$$;

grant usage on sequence public.invoice_number_seq to anon, authenticated, service_role;
grant execute on function public.next_invoice_number() to anon, authenticated, service_role;

-- ─── Learned retailer item mappings ──────────────────────────────────────────

create table if not exists public.retailer_product_aliases (
  id                   uuid primary key default gen_random_uuid(),
  retailer_id          uuid not null references public.retailers(id) on delete cascade,
  retailer_item_number text not null,
  vendor_style         text,
  upc                  text,
  product_id           uuid not null references public.products(id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (retailer_id, retailer_item_number)
);

create index if not exists idx_retailer_product_aliases_product
  on public.retailer_product_aliases(product_id);

-- ─── Import audit ────────────────────────────────────────────────────────────

create table if not exists public.po_pdf_imports (
  id                         uuid primary key default gen_random_uuid(),
  file_name                  text not null,
  status                     text not null default 'Extracted', -- Extracted | Committed | Failed
  extracted                  jsonb not null default '{}'::jsonb,
  created_purchase_order_ids uuid[] not null default '{}',
  created_invoice_ids        uuid[] not null default '{}',
  created_by_label           text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ─── RLS (mirrors mvp_public_access pattern from migration 002) ───────────────

alter table public.retailer_product_aliases enable row level security;
alter table public.po_pdf_imports           enable row level security;

drop policy if exists "mvp_public_access_retailer_product_aliases" on public.retailer_product_aliases;
create policy "mvp_public_access_retailer_product_aliases"
  on public.retailer_product_aliases for all using (true) with check (true);

drop policy if exists "mvp_public_access_po_pdf_imports" on public.po_pdf_imports;
create policy "mvp_public_access_po_pdf_imports"
  on public.po_pdf_imports for all using (true) with check (true);
