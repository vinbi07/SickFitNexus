alter table public.app_settings
  add column if not exists prior_ytd_revenue numeric(12, 2) not null default 0;
