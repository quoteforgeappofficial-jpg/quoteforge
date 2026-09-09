-- QuoteForge — Phase 3: customers
--
-- Adds public.customers, the first business-scoped feature table, following
-- the multi-tenant pattern documented at the bottom of
-- 20260908120000_init_auth_foundation.sql:
--
--   - Every row carries business_id, defaulting to the inserting user's
--     own business via public.current_business_id() so application code
--     never has to look it up or pass it explicitly.
--   - A single RLS policy scopes every command (select/insert/update/
--     delete) to rows whose business_id matches the caller's business —
--     this is what makes one business's customers invisible and
--     unreachable to every other business.
--
-- Nothing in the existing auth foundation (businesses, profiles, the
-- signup trigger, current_business_id()) is changed by this migration.

-- ---------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses (id) on delete cascade,

  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  company_name text,
  email text,
  phone text,

  service_address text,
  city text,
  state text,
  zip text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Contact and service-address details for a business''s customers. Strictly isolated per business via RLS.';

-- Every list/lookup query is scoped to the caller's business and sorted
-- by name, so index on exactly that access pattern.
create index if not exists customers_business_id_name_idx
  on public.customers (business_id, last_name, first_name);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
-- Reuses public.set_updated_at(), defined in the auth foundation
-- migration — no new trigger function needed.

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.customers enable row level security;

drop policy if exists "Members can access their business's customers"
  on public.customers;

create policy "Members can access their business's customers"
  on public.customers for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
