-- supabase/storage.sql
-- Run in: Supabase Dashboard → SQL Editor.
--
-- Creates the bucket used by /api/generate. It is public-read, so video and
-- thumbnail URLs work in <video>/<img> tags. No INSERT/UPDATE/DELETE policies
-- exist, so only the server (service_role key) can write to it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generations',
  'generations',
  true,
  104857600,                          -- 100 MB per file
  array['video/mp4', 'image/jpeg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
