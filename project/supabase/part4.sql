-- supabase/part4.sql
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- NOTE: this file assumed schema.sql (Part 2) wasn't available yet. Now that
-- schema.sql exists, its own handle_new_user() + on_auth_user_created trigger
-- already provisions `public.credits` (and `public.users`) on signup, so
-- Part 4's original version of that function/trigger has been REMOVED here —
-- keeping it would have run `create or replace function public.handle_new_user()`
-- and silently overwritten schema.sql's version with one that never inserts
-- into `public.users`. Since `generations.user_id` has a foreign key to
-- `public.users`, that would break generation for any user who signs up after
-- this script runs. Make sure schema.sql runs BEFORE this file.

/* ------------------------------------------------------------------------ */
/* 1. Backfill anyone who signed up before schema.sql's trigger existed       */
/* ------------------------------------------------------------------------ */
insert into public.credits (user_id, credits_left, is_pro)
select u.id, 5, false
from auth.users u
where not exists (select 1 from public.credits c where c.user_id = u.id);

/* ------------------------------------------------------------------------ */
/* 2. Payments + plan changes (called only by the server, via service_role)   */
/* ------------------------------------------------------------------------ */

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  provider            text not null,             -- 'mock' | 'razorpay' | 'stripe'
  provider_payment_id text not null,
  amount              integer not null,          -- paise / cents
  currency            text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)         -- makes webhook retries harmless
);

-- RLS on with NO policies: clients can't read or write it; service_role can.
alter table public.payments enable row level security;

-- Records the payment, flips is_pro, adds credits. One transaction.
-- Returns false if this payment was already processed.
create or replace function public.activate_pro(
  p_user_id    uuid,
  p_provider   text,
  p_payment_id text,
  p_amount     integer,
  p_currency   text,
  p_credits    integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.payments (user_id, provider, provider_payment_id, amount, currency)
  values (p_user_id, p_provider, p_payment_id, p_amount, p_currency)
  on conflict (provider, provider_payment_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;                                -- duplicate delivery
  end if;

  update public.credits
     set is_pro       = true,
         credits_left = credits_left + p_credits
   where user_id = p_user_id;

  if not found then
    raise exception 'no_credits_row';            -- rolls the payment insert back too
  end if;
  return true;
end;
$$;

create or replace function public.deactivate_pro(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.credits set is_pro = false where user_id = p_user_id;
$$;

-- SECURITY DEFINER functions in `public` are callable through the API by
-- default. Lock them to the server, or anyone could upgrade themselves.
revoke all on function public.activate_pro(uuid, text, text, integer, text, integer)
  from public, anon, authenticated;
revoke all on function public.deactivate_pro(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_pro(uuid, text, text, integer, text, integer)
  to service_role;
grant execute on function public.deactivate_pro(uuid) to service_role;

/* ------------------------------------------------------------------------ */
/* 3. Private bucket for the logo-free masters of Free users' files           */
/* ------------------------------------------------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generations-clean',
  'generations-clean',
  false,                                -- NOT public: no URL works without a signature
  104857600,
  array['video/mp4', 'image/jpeg']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- No storage policies on purpose: only the service-role key can read/write it.

/* ------------------------------------------------------------------------ */
/* 4. CHECK (read-only): clients must NOT be able to change their own plan     */
/* ------------------------------------------------------------------------ */
-- Expect only SELECT policies (cmd = 'SELECT') on credits and generations, and
-- none on payments. Any INSERT/UPDATE/ALL policy on credits lets a user set
-- is_pro = true with their own login.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('credits', 'generations', 'payments');
