create table if not exists public.csv_import_entity_links (
  id uuid primary key default gen_random_uuid(),
  csv_import_id uuid not null references public.csv_imports(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action_type text not null,
  previous_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_csv_import_entity_links_import
  on public.csv_import_entity_links(csv_import_id, created_at desc);

alter table public.csv_import_entity_links enable row level security;

drop policy if exists "mvp_public_access_csv_import_entity_links" on public.csv_import_entity_links;
create policy "mvp_public_access_csv_import_entity_links"
on public.csv_import_entity_links
for all
using (true)
with check (true);
