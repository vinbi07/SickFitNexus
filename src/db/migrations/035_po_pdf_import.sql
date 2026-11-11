-- Migration 035: PO PDF import -> Retailer POs -> invoices
-- Adds invoice dates/terms fields, retailer item numbers on lines, learned
-- retailer item -> product mappings, and an import audit table. Invoice numbers
-- keep the existing INV-YYYYMMDD-NNNN format.

-- ─── Invoices ────────────────────────────────────────────────────────────────

alter table public.invoices
  add column if not exists invoice_date       date,
  add column if not exists due_date           date,
  add column if not exists customer_po_number text,
  add column if not exists stock_warnings     jsonb not null default '[]'::jsonb;

-- One invoice per source PO, so converting the same PO twice is a no-op. Skipped
-- (with a notice) if older data already has two invoices for one PO.
do $$
begin
  if exists (
    select 1 from public.invoices
    where source_po_id is not null
    group by source_po_id having count(*) > 1
  ) then
    raise notice 'uq_invoices_source_po_id not created: some POs already have more than one invoice.';
  else
    create unique index if not exists uq_invoices_source_po_id
      on public.invoices(source_po_id)
      where source_po_id is not null;
  end if;
end $$;

create index if not exists idx_purchase_orders_retailer_po_number
  on public.purchase_orders(po_number)
  where po_type = 'Retailer PO';

alter table public.po_line_items
  add column if not exists retailer_item_number text,
  -- Units actually held in products.inventory_allocated for this line. Null on older
  -- lines, which keep the old behavior of releasing/fulfilling the full quantity.
  add column if not exists allocated_units integer;

alter table public.invoice_line_items
  add column if not exists retailer_item_number text;

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
