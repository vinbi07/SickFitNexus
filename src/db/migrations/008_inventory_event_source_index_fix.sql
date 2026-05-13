drop index if exists public.idx_inventory_events_source_reference;

create index if not exists idx_inventory_events_source_reference
  on public.inventory_events(source_system, source_reference);
