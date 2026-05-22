-- ============================================================
-- 018_dashboard_auth.sql
-- Custom auth tables for the SickFit Nexus dashboard.
-- No public RLS policies — access only via service role key.
-- ============================================================

create table if not exists public.dashboard_users (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  password_hash text        not null,
  display_name  text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz,
  constraint dashboard_users_email_key unique (email)
);

create table if not exists public.login_attempts (
  id           uuid        primary key default gen_random_uuid(),
  ip_address   text        not null,
  attempted_at timestamptz not null default now(),
  success      boolean     not null default false
);

create index if not exists idx_dashboard_users_email
  on public.dashboard_users (email);

create index if not exists idx_login_attempts_ip_time
  on public.login_attempts (ip_address, attempted_at desc);

-- Reuse the existing set_updated_at() trigger function defined in migration 001
drop trigger if exists set_dashboard_users_updated_at on public.dashboard_users;
create trigger set_dashboard_users_updated_at
  before update on public.dashboard_users
  for each row execute function public.set_updated_at();

alter table public.dashboard_users enable row level security;
alter table public.login_attempts   enable row level security;

-- Intentionally NO public access policies on either table.
-- All access must go through the service role key in Vercel API routes.
-- The anon key used by the SPA client cannot read or write these tables.
