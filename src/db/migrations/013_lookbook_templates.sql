create table if not exists public.lookbook_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lookbook_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.lookbook_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  unique(template_id, product_id)
);

alter table public.buyers
  add column if not exists lookbook_template_id uuid references public.lookbook_templates(id) on delete set null;

create index if not exists idx_lookbook_templates_active on public.lookbook_templates(is_active, name);
create index if not exists idx_lookbook_template_items_template on public.lookbook_template_items(template_id, sort_order);
create index if not exists idx_buyers_lookbook_template on public.buyers(lookbook_template_id);

drop trigger if exists set_lookbook_templates_updated_at on public.lookbook_templates;
create trigger set_lookbook_templates_updated_at
before update on public.lookbook_templates
for each row execute function public.set_updated_at();

alter table public.lookbook_templates enable row level security;
alter table public.lookbook_template_items enable row level security;

drop policy if exists "mvp_public_access_lookbook_templates" on public.lookbook_templates;
create policy "mvp_public_access_lookbook_templates" on public.lookbook_templates for all using (true) with check (true);

drop policy if exists "mvp_public_access_lookbook_template_items" on public.lookbook_template_items;
create policy "mvp_public_access_lookbook_template_items" on public.lookbook_template_items for all using (true) with check (true);
