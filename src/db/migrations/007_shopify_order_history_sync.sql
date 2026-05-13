alter table public.inventory_events
  add column if not exists source_system text,
  add column if not exists source_reference text;

create unique index if not exists idx_inventory_events_source_reference
  on public.inventory_events(source_system, source_reference)
  where source_system is not null and source_reference is not null;
