do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_vendor_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_location_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_location_id_fkey
      foreign key (location_id) references public.locations(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'po_line_items_purchase_order_id_fkey'
      and conrelid = 'public.po_line_items'::regclass
  ) then
    alter table public.po_line_items
      add constraint po_line_items_purchase_order_id_fkey
      foreign key (purchase_order_id) references public.purchase_orders(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'po_line_items_product_id_fkey'
      and conrelid = 'public.po_line_items'::regclass
  ) then
    alter table public.po_line_items
      add constraint po_line_items_product_id_fkey
      foreign key (product_id) references public.products(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_events_product_id_fkey'
      and conrelid = 'public.inventory_events'::regclass
  ) then
    alter table public.inventory_events
      add constraint inventory_events_product_id_fkey
      foreign key (product_id) references public.products(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_events_location_id_fkey'
      and conrelid = 'public.inventory_events'::regclass
  ) then
    alter table public.inventory_events
      add constraint inventory_events_location_id_fkey
      foreign key (location_id) references public.locations(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_events_related_po_id_fkey'
      and conrelid = 'public.inventory_events'::regclass
  ) then
    alter table public.inventory_events
      add constraint inventory_events_related_po_id_fkey
      foreign key (related_po_id) references public.purchase_orders(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_vendor_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_product_id_fkey'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_location_id_fkey'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_location_id_fkey
      foreign key (location_id) references public.locations(id) on delete cascade;
  end if;
end
$$;

alter table public.inventory_items enable row level security;

drop policy if exists "mvp_public_access_inventory_items" on public.inventory_items;
create policy "mvp_public_access_inventory_items"
on public.inventory_items
for all
using (true)
with check (true);
