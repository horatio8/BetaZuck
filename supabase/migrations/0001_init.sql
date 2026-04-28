-- BetaZuck schema
-- Run this in Supabase SQL Editor (or via supabase CLI: `supabase db push`).

create extension if not exists pgcrypto;

-- ── signatures ─────────────────────────────────────────────────
create table if not exists public.signatures (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null check (length(first_name) between 1 and 80),
  email         text not null check (length(email) between 3 and 200),
  zip           text check (zip is null or length(zip) <= 16),
  updates_opt_in boolean not null default true,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists signatures_created_at_idx
  on public.signatures (created_at desc);

create index if not exists signatures_email_idx
  on public.signatures (lower(email));

-- ── donations (populated by Stripe webhook) ────────────────────
create table if not exists public.donations (
  id                uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  amount_cents      integer not null check (amount_cents > 0),
  currency          text not null default 'usd',
  monthly           boolean not null default false,
  email             text,
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

create index if not exists donations_created_at_idx
  on public.donations (created_at desc);

-- ── public count function (PII-safe) ───────────────────────────
-- Anon key can call this RPC; cannot read the underlying table.
create or replace function public.signatures_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.signatures;
$$;

revoke all on function public.signatures_count() from public;
grant execute on function public.signatures_count() to anon, authenticated;

-- ── RLS: deny anon direct access to tables ─────────────────────
alter table public.signatures enable row level security;
alter table public.donations  enable row level security;

-- No policies are added: only the service_role key (used server-side
-- in Vercel functions) can read/write. The public count() RPC above
-- bypasses RLS via security definer.
