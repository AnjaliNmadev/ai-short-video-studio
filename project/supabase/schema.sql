-- =====================================================================
-- AI Short Video & Content Studio — Supabase schema (Part 1)
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------- Helper: auto-update updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 1. USERS  (public profile mirror of auth.users)
-- =====================================================================
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 2. CREDITS
-- =====================================================================
create table if not exists public.credits (
  user_id       uuid primary key references public.users (id) on delete cascade,
  credits_left  integer not null default 5 check (credits_left >= 0),
  is_pro        boolean not null default false,
  updated_at    timestamptz not null default now()
);

drop trigger if exists credits_set_updated_at on public.credits;
create trigger credits_set_updated_at
  before update on public.credits
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. GENERATIONS
-- =====================================================================
create table if not exists public.generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  topic          text not null check (char_length(topic) between 1 and 500),
  video_url      text,
  thumbnail_url  text,
  metadata_json  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- Fast "my latest videos" queries
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);

-- =====================================================================
-- 4. AUTO-PROVISION: new signup → users row + credits row (5 free credits)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.credits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 5. ROW LEVEL SECURITY
-- Clients (anon/authenticated) can only READ their own data.
-- All writes to credits/generations go through your server using the
-- service_role key, which bypasses RLS. This prevents users from
-- granting themselves credits or Pro status from the browser.
-- =====================================================================
alter table public.users        enable row level security;
alter table public.credits      enable row level security;
alter table public.generations  enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "credits_select_own" on public.credits;
create policy "credits_select_own"
  on public.credits for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "generations_select_own" on public.generations;
create policy "generations_select_own"
  on public.generations for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "generations_delete_own" on public.generations;
create policy "generations_delete_own"
  on public.generations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- =====================================================================
-- 6. ATOMIC CREDIT DEDUCTION (call from server with service_role)
-- Usage:  select public.consume_credits('<user-uuid>', 1);
-- Raises 'insufficient_credits' if the balance is too low.
-- Race-condition safe: single UPDATE with a guard clause.
-- =====================================================================
create or replace function public.consume_credits(p_user_id uuid, p_amount integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left integer;
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  update public.credits
     set credits_left = credits_left - p_amount
   where user_id = p_user_id
     and credits_left >= p_amount
  returning credits_left into v_left;

  if v_left is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  return v_left;
end;
$$;

revoke all on function public.consume_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, integer) to service_role;

-- Refund helper (e.g., when a generation job fails)
create or replace function public.refund_credits(p_user_id uuid, p_amount integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left integer;
begin
  update public.credits
     set credits_left = credits_left + p_amount
   where user_id = p_user_id
  returning credits_left into v_left;

  return v_left;
end;
$$;

revoke all on function public.refund_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, integer) to service_role;

-- =====================================================================
-- 7. BACKFILL (only needed if users already existed before this script)
-- =====================================================================
insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.credits (user_id)
select id from public.users
on conflict (user_id) do nothing;
