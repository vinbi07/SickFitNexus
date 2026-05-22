-- ============================================================
-- 018_dashboard_auth.sql
-- Custom auth for the SickFit Nexus dashboard.
-- Uses pgcrypto (bcrypt) and SECURITY DEFINER RPC functions.
-- No Vercel API routes needed — works with plain npm run dev.
-- ============================================================

create extension if not exists pgcrypto;

-- Admin accounts (password hashed via pgcrypto crypt/bcrypt)
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

-- Session tokens (stored in browser localStorage, validated server-side)
create table if not exists public.admin_sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.dashboard_users(id) on delete cascade,
  token        text        not null unique default encode(gen_random_bytes(32), 'hex'),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  last_used_at timestamptz not null default now()
);

-- Rate limiting (email-keyed, no IP dependency)
create table if not exists public.login_attempts (
  id           uuid        primary key default gen_random_uuid(),
  ip_address   text        not null,
  attempted_at timestamptz not null default now(),
  success      boolean     not null default false
);

create index if not exists idx_dashboard_users_email
  on public.dashboard_users (email);

create index if not exists idx_admin_sessions_token
  on public.admin_sessions (token);

create index if not exists idx_admin_sessions_expires
  on public.admin_sessions (expires_at);

create index if not exists idx_login_attempts_ip_time
  on public.login_attempts (ip_address, attempted_at desc);

drop trigger if exists set_dashboard_users_updated_at on public.dashboard_users;
create trigger set_dashboard_users_updated_at
  before update on public.dashboard_users
  for each row execute function public.set_updated_at();

alter table public.dashboard_users enable row level security;
alter table public.admin_sessions   enable row level security;
alter table public.login_attempts   enable row level security;
-- No public RLS policies — all access via SECURITY DEFINER functions below.


-- ============================================================
-- RPC: admin_login
-- Called by the login form with the anon key.
-- Returns { token, user } on success or { error } on failure.
-- ============================================================
create or replace function public.admin_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key     text := 'email:' || lower(trim(p_email));
  v_count   int;
  v_user    public.dashboard_users;
  v_session public.admin_sessions;
begin
  -- Rate limit: 5 failed attempts per email in 15 minutes
  select count(*) into v_count
  from public.login_attempts
  where ip_address = v_key
    and success = false
    and attempted_at > now() - interval '15 minutes';

  if v_count >= 5 then
    return jsonb_build_object(
      'error', 'Too many failed login attempts. Please wait 15 minutes and try again.'
    );
  end if;

  -- Look up user
  select * into v_user
  from public.dashboard_users
  where email = lower(trim(p_email));

  -- Validate password (crypt() is bcrypt-compatible)
  if v_user.id is null or v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    insert into public.login_attempts (ip_address, success) values (v_key, false);
    return jsonb_build_object('error', 'Invalid email or password.');
  end if;

  -- Create session
  insert into public.admin_sessions (user_id)
  values (v_user.id)
  returning * into v_session;

  insert into public.login_attempts (ip_address, success) values (v_key, true);
  update public.dashboard_users set last_login_at = now() where id = v_user.id;

  return jsonb_build_object(
    'token', v_session.token,
    'user',  jsonb_build_object(
      'id',           v_user.id,
      'email',        v_user.email,
      'display_name', v_user.display_name
    )
  );
end;
$$;


-- ============================================================
-- RPC: admin_check_session
-- Called on every page load to restore the session.
-- Returns { user } or { user: null } if expired/invalid.
-- ============================================================
create or replace function public.admin_check_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.admin_sessions;
  v_user    public.dashboard_users;
begin
  select * into v_session
  from public.admin_sessions
  where token = p_token
    and expires_at > now();

  if v_session.id is null then
    return jsonb_build_object('user', null);
  end if;

  select * into v_user from public.dashboard_users where id = v_session.user_id;

  update public.admin_sessions set last_used_at = now() where id = v_session.id;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id',           v_user.id,
      'email',        v_user.email,
      'display_name', v_user.display_name
    )
  );
end;
$$;


-- ============================================================
-- RPC: admin_logout
-- Deletes the session token.
-- ============================================================
create or replace function public.admin_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.admin_sessions where token = p_token;
end;
$$;


-- ============================================================
-- RPC: admin_create_user
-- Used only by the create-admin seed script (service role key).
-- Anon/authenticated roles cannot call this.
-- ============================================================
create or replace function public.admin_create_user(
  p_email        text,
  p_password     text,
  p_display_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.dashboard_users;
begin
  if length(p_password) < 12 then
    return jsonb_build_object('error', 'Password must be at least 12 characters.');
  end if;

  insert into public.dashboard_users (email, password_hash, display_name)
  values (
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf', 12)),
    coalesce(nullif(trim(p_display_name), ''), split_part(p_email, '@', 1))
  )
  returning * into v_user;

  return jsonb_build_object(
    'id',           v_user.id,
    'email',        v_user.email,
    'display_name', v_user.display_name
  );
exception
  when unique_violation then
    return jsonb_build_object('error', 'A user with that email already exists.');
end;
$$;


-- Grant anon access to the three public-facing functions.
-- admin_create_user is intentionally not granted — service role only.
grant execute on function public.admin_login(text, text)    to anon, authenticated;
grant execute on function public.admin_check_session(text)  to anon, authenticated;
grant execute on function public.admin_logout(text)         to anon, authenticated;
