alter table public.buyers
  add column if not exists lookbook_status text not null default 'draft';
