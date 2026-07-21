-- Avatar storage. Apply once in the Supabase SQL editor, after 0001.
-- Profile photos are files, not task data — they live in a public Storage
-- bucket, and only the resulting public URL is kept on the auth user
-- (user_metadata.avatar_url). A base64 data URL in user_metadata was tried
-- first and does not work: it bloats the access-token JWT and GoTrue rejects
-- anything past a small size ceiling. See docs/decisions.md D8.

-- 1. Bucket ------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2. Policies ----------------------------------------------------------------
-- Anyone may read (the bucket is public, so avatars render without a signed
-- URL). A user may only write within their own folder: avatars/<uid>/...,
-- enforced by matching the first path segment to auth.uid().
-- Dropped first so this whole file is safe to re-run.

drop policy if exists "avatar public read" on storage.objects;
drop policy if exists "avatar insert own" on storage.objects;
drop policy if exists "avatar update own" on storage.objects;
drop policy if exists "avatar delete own" on storage.objects;

create policy "avatar public read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatar insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
