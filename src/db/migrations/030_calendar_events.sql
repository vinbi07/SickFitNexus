-- Migration 030: Manual calendar events / reminders
-- Only manual/user-created calendar entries live here — PO, invoice, production,
-- inventory, retailer, compliance, and lookbook events are derived at query time
-- from their existing source tables (see src/lib/calendar/calendarAdapters.ts).

create table if not exists public.calendar_events (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  event_date           date not null,
  category             text not null default 'manual',
  status               text not null default 'scheduled',
  priority             text,
  owner_label          text,
  retailer_id          uuid references public.retailers(id) on delete set null,
  vendor_id            uuid references public.vendors(id) on delete set null,
  product_id           uuid references public.products(id) on delete set null,
  related_entity_type  text,
  related_entity_id    uuid,
  created_by_user_id   uuid references public.dashboard_users(id) on delete set null,
  created_by_label     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

create index if not exists idx_calendar_events_event_date on public.calendar_events(event_date);
create index if not exists idx_calendar_events_retailer_id on public.calendar_events(retailer_id);
create index if not exists idx_calendar_events_vendor_id on public.calendar_events(vendor_id);
create index if not exists idx_calendar_events_product_id on public.calendar_events(product_id);

alter table public.calendar_events enable row level security;

drop policy if exists "mvp_public_access_calendar_events" on public.calendar_events;
create policy "mvp_public_access_calendar_events"
  on public.calendar_events for all using (true) with check (true);
