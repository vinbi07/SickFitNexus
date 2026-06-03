-- Migration 023: Supabase Storage bucket + policies for manufacturer mockup/artwork files
-- Run in Supabase SQL Editor.
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING, CREATE POLICY IF NOT EXISTS not supported
-- so policies are guarded by a DO block that checks pg_policies.

-- ─────────────────────────────────────────────
-- Create the bucket (public so URLs are shareable without auth)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manufacturer-files',
  'manufacturer-files',
  true,
  20971520,  -- 20 MB per file
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/postscript',   -- .ai / .eps
    'image/svg+xml'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────
-- Storage RLS policies
-- ─────────────────────────────────────────────
do $$
begin

  -- SELECT (public reads — anyone with the URL can view)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'manufacturer-files: public read'
  ) then
    execute $policy$
      create policy "manufacturer-files: public read"
        on storage.objects for select
        to anon, authenticated
        using (bucket_id = 'manufacturer-files')
    $policy$;
  end if;

  -- INSERT (anon + authenticated can upload)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'manufacturer-files: allow upload'
  ) then
    execute $policy$
      create policy "manufacturer-files: allow upload"
        on storage.objects for insert
        to anon, authenticated
        with check (bucket_id = 'manufacturer-files')
    $policy$;
  end if;

  -- UPDATE (allow overwrite of existing files)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'manufacturer-files: allow update'
  ) then
    execute $policy$
      create policy "manufacturer-files: allow update"
        on storage.objects for update
        to anon, authenticated
        using (bucket_id = 'manufacturer-files')
    $policy$;
  end if;

  -- DELETE (allow cleanup)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'manufacturer-files: allow delete'
  ) then
    execute $policy$
      create policy "manufacturer-files: allow delete"
        on storage.objects for update
        to anon, authenticated
        using (bucket_id = 'manufacturer-files')
    $policy$;
  end if;

end $$;
