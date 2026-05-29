alter table public.purchase_orders
  add column if not exists bill_to_company_name text,
  add column if not exists bill_to_contact_name text,
  add column if not exists bill_to_street text,
  add column if not exists bill_to_city text,
  add column if not exists bill_to_state text,
  add column if not exists bill_to_zip text,
  add column if not exists bill_to_phone text,
  add column if not exists bill_to_email text,
  add column if not exists ship_to_company_name text,
  add column if not exists ship_to_attention text,
  add column if not exists ship_to_street text,
  add column if not exists ship_to_city text,
  add column if not exists ship_to_state text,
  add column if not exists ship_to_zip text,
  add column if not exists ship_to_phone text,
  add column if not exists payment_terms_snapshot text,
  add column if not exists buyer_name_snapshot text,
  add column if not exists approver_name_snapshot text;

alter table public.po_line_items
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_po_line_items_sort_order on public.po_line_items(purchase_order_id, sort_order, created_at);
