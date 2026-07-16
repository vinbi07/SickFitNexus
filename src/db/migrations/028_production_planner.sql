-- Production Planner & Simulator: plans, plan items, templates, template items,
-- simulation runs, and Manufacturer PO lineage columns.
-- Non-destructive: no existing table is altered except to add nullable lineage
-- columns to purchase_orders, and no existing row/behavior changes.

create table if not exists public.production_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null default 'restock',
  status text not null default 'Draft',
  vendor_id uuid references public.vendors(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  horizon_start date not null,
  horizon_end date not null,
  planned_order_date date,
  target_arrival_date date,
  production_lane text,
  production_week date,
  demand_method text not null default 'avg_daily_usage',
  coverage_target_days integer not null default 30,
  safety_stock_override integer,
  include_allocated boolean not null default true,
  include_existing_incoming boolean not null default true,
  source_type text not null default 'blank',
  source_template_id uuid,
  source_plan_id uuid references public.production_plans(id) on delete set null,
  active_simulation_run_id uuid,
  approved_at timestamptz,
  approved_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_plans_goal_check check (goal in ('restock', 'retailer_launch', 'seasonal_build', 'emergency_recovery', 'custom')),
  constraint production_plans_status_check check (status in ('Draft', 'Simulated', 'Needs Review', 'Approved', 'Converted', 'Cancelled', 'Archived')),
  constraint production_plans_source_type_check check (source_type in ('blank', 'template', 'reorder_queue', 'duplicate')),
  constraint production_plans_demand_method_check check (demand_method in ('avg_daily_usage', 'trailing_30d', 'trailing_90d', 'manual_override')),
  constraint production_plans_horizon_check check (horizon_end >= horizon_start)
);

create table if not exists public.production_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.production_plans(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  planned_quantity integer not null default 0,
  moq integer,
  order_increment integer,
  unit_cost numeric,
  manual_daily_demand numeric,
  design_id uuid references public.order_designs(id) on delete set null,
  spec_snapshot jsonb not null default '{}'::jsonb,
  sock_card_id text references public.sock_cards(id) on delete set null,
  pack_pairs integer not null default 1,
  sock_size text,
  construction text,
  cards_used integer not null default 0,
  box_no text,
  pantone text,
  barcode_required boolean not null default false,
  art_status text,
  art_note text,
  mockup_file_ref text,
  artwork_file_ref text,
  rib_lr boolean not null default true,
  toe boolean not null default true,
  pattern boolean not null default false,
  signature boolean not null default false,
  foot_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, product_id),
  constraint production_plan_items_quantity_check check (planned_quantity >= 0)
);

create table if not exists public.production_plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  default_vendor_id uuid references public.vendors(id) on delete set null,
  default_horizon_days integer not null default 60,
  default_lead_time_buffer_days integer not null default 7,
  default_coverage_target_days integer not null default 30,
  arrival_logic text,
  cost_assumptions jsonb not null default '{}'::jsonb,
  milestones jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Forward reference from production_plans to production_plan_templates is declared
-- above; this FK is added now that production_plan_templates exists.
alter table public.production_plans
  drop constraint if exists production_plans_source_template_id_fkey;
alter table public.production_plans
  add constraint production_plans_source_template_id_fkey
  foreign key (source_template_id) references public.production_plan_templates(id) on delete set null;

create table if not exists public.production_plan_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.production_plan_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  mix_mode text not null default 'fixed',
  fixed_quantity integer,
  percent_of_mix numeric,
  min_quantity integer,
  max_quantity integer,
  moq integer,
  order_increment integer,
  unit_cost numeric,
  spec_snapshot jsonb not null default '{}'::jsonb,
  pack_pairs integer not null default 1,
  sock_size text,
  construction text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(template_id, product_id),
  constraint production_plan_template_items_mix_mode_check check (mix_mode in ('fixed', 'percent'))
);

create table if not exists public.production_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.production_plans(id) on delete cascade,
  scenario_name text not null default 'Scenario 1',
  simulation_version integer not null default 1,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  recommendations jsonb not null default '[]'::jsonb,
  is_stale boolean not null default false,
  created_at timestamptz not null default now(),
  unique(plan_id, simulation_version)
);

alter table public.production_plans
  drop constraint if exists production_plans_active_simulation_run_id_fkey;
alter table public.production_plans
  add constraint production_plans_active_simulation_run_id_fkey
  foreign key (active_simulation_run_id) references public.production_simulation_runs(id) on delete set null;

-- Manufacturer PO lineage back to the plan/simulation that produced it.
-- Nullable, additive only — existing purchase_orders rows and behavior unaffected.
alter table public.purchase_orders
  add column if not exists source_production_plan_id uuid references public.production_plans(id) on delete set null,
  add column if not exists source_simulation_run_id uuid references public.production_simulation_runs(id) on delete set null;

create index if not exists idx_production_plans_status on public.production_plans(status, updated_at desc);
create index if not exists idx_production_plans_vendor on public.production_plans(vendor_id);
create index if not exists idx_production_plans_source_template on public.production_plans(source_template_id);
create index if not exists idx_production_plans_source_plan on public.production_plans(source_plan_id);
create index if not exists idx_production_plan_items_plan on public.production_plan_items(plan_id, sort_order);
create index if not exists idx_production_plan_items_product on public.production_plan_items(product_id);
create index if not exists idx_production_plan_templates_active on public.production_plan_templates(is_active, name);
create index if not exists idx_production_plan_template_items_template on public.production_plan_template_items(template_id, sort_order);
create index if not exists idx_production_simulation_runs_plan on public.production_simulation_runs(plan_id, simulation_version desc);
create index if not exists idx_purchase_orders_source_plan on public.purchase_orders(source_production_plan_id);
create index if not exists idx_purchase_orders_source_simulation_run on public.purchase_orders(source_simulation_run_id);

drop trigger if exists set_production_plans_updated_at on public.production_plans;
create trigger set_production_plans_updated_at
before update on public.production_plans
for each row execute function public.set_updated_at();

drop trigger if exists set_production_plan_items_updated_at on public.production_plan_items;
create trigger set_production_plan_items_updated_at
before update on public.production_plan_items
for each row execute function public.set_updated_at();

drop trigger if exists set_production_plan_templates_updated_at on public.production_plan_templates;
create trigger set_production_plan_templates_updated_at
before update on public.production_plan_templates
for each row execute function public.set_updated_at();

alter table public.production_plans enable row level security;
alter table public.production_plan_items enable row level security;
alter table public.production_plan_templates enable row level security;
alter table public.production_plan_template_items enable row level security;
alter table public.production_simulation_runs enable row level security;

drop policy if exists "mvp_public_access_production_plans" on public.production_plans;
create policy "mvp_public_access_production_plans" on public.production_plans for all using (true) with check (true);

drop policy if exists "mvp_public_access_production_plan_items" on public.production_plan_items;
create policy "mvp_public_access_production_plan_items" on public.production_plan_items for all using (true) with check (true);

drop policy if exists "mvp_public_access_production_plan_templates" on public.production_plan_templates;
create policy "mvp_public_access_production_plan_templates" on public.production_plan_templates for all using (true) with check (true);

drop policy if exists "mvp_public_access_production_plan_template_items" on public.production_plan_template_items;
create policy "mvp_public_access_production_plan_template_items" on public.production_plan_template_items for all using (true) with check (true);

drop policy if exists "mvp_public_access_production_simulation_runs" on public.production_simulation_runs;
create policy "mvp_public_access_production_simulation_runs" on public.production_simulation_runs for all using (true) with check (true);
