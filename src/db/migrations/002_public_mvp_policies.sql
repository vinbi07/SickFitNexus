alter table public.vendors enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_line_items enable row level security;
alter table public.inventory_events enable row level security;
alter table public.csv_imports enable row level security;
alter table public.csv_import_errors enable row level security;
alter table public.mapping_presets enable row level security;
alter table public.alerts enable row level security;
alter table public.sops enable row level security;
alter table public.comments enable row level security;
alter table public.activity_events enable row level security;
alter table public.wins enable row level security;
alter table public.people enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_progress enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "mvp_public_access_vendors" on public.vendors;
create policy "mvp_public_access_vendors" on public.vendors for all using (true) with check (true);

drop policy if exists "mvp_public_access_locations" on public.locations;
create policy "mvp_public_access_locations" on public.locations for all using (true) with check (true);

drop policy if exists "mvp_public_access_products" on public.products;
create policy "mvp_public_access_products" on public.products for all using (true) with check (true);

drop policy if exists "mvp_public_access_purchase_orders" on public.purchase_orders;
create policy "mvp_public_access_purchase_orders" on public.purchase_orders for all using (true) with check (true);

drop policy if exists "mvp_public_access_po_line_items" on public.po_line_items;
create policy "mvp_public_access_po_line_items" on public.po_line_items for all using (true) with check (true);

drop policy if exists "mvp_public_access_inventory_events" on public.inventory_events;
create policy "mvp_public_access_inventory_events" on public.inventory_events for all using (true) with check (true);

drop policy if exists "mvp_public_access_csv_imports" on public.csv_imports;
create policy "mvp_public_access_csv_imports" on public.csv_imports for all using (true) with check (true);

drop policy if exists "mvp_public_access_csv_import_errors" on public.csv_import_errors;
create policy "mvp_public_access_csv_import_errors" on public.csv_import_errors for all using (true) with check (true);

drop policy if exists "mvp_public_access_mapping_presets" on public.mapping_presets;
create policy "mvp_public_access_mapping_presets" on public.mapping_presets for all using (true) with check (true);

drop policy if exists "mvp_public_access_alerts" on public.alerts;
create policy "mvp_public_access_alerts" on public.alerts for all using (true) with check (true);

drop policy if exists "mvp_public_access_sops" on public.sops;
create policy "mvp_public_access_sops" on public.sops for all using (true) with check (true);

drop policy if exists "mvp_public_access_comments" on public.comments;
create policy "mvp_public_access_comments" on public.comments for all using (true) with check (true);

drop policy if exists "mvp_public_access_activity_events" on public.activity_events;
create policy "mvp_public_access_activity_events" on public.activity_events for all using (true) with check (true);

drop policy if exists "mvp_public_access_wins" on public.wins;
create policy "mvp_public_access_wins" on public.wins for all using (true) with check (true);

drop policy if exists "mvp_public_access_people" on public.people;
create policy "mvp_public_access_people" on public.people for all using (true) with check (true);

drop policy if exists "mvp_public_access_training_modules" on public.training_modules;
create policy "mvp_public_access_training_modules" on public.training_modules for all using (true) with check (true);

drop policy if exists "mvp_public_access_training_progress" on public.training_progress;
create policy "mvp_public_access_training_progress" on public.training_progress for all using (true) with check (true);

drop policy if exists "mvp_public_access_app_settings" on public.app_settings;
create policy "mvp_public_access_app_settings" on public.app_settings for all using (true) with check (true);
