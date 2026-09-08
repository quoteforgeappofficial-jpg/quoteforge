-- QuoteForge — authentication foundation
--
-- Establishes: auth.users -> profiles -> businesses
--
--   - businesses: one row per contractor/company account (tenant).
--   - profiles:   one row per Supabase auth user, linked to a business.
--                 Multiple profiles may share a business_id, which is
--                 what lets one business have multiple users later on.
--
-- A trigger on auth.users automatically creates a business + profile
-- for every new signup, so the app never has to do that as a separate
-- client-side step. No business feature tables (customers, estimates,
-- proposals, ...) are created here — see the note at the bottom for the
-- pattern future multi-tenant tables should follow.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Business',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.businesses is
  'One row per contractor/company account. The tenant boundary for all future business data.';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per Supabase auth user. Links a user to the business they belong to.';

create index if not exists profiles_business_id_idx
  on public.profiles (business_id);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

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

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- New user provisioning: auth.users -> profiles -> businesses
-- ---------------------------------------------------------------------
--
-- security definer is required here: at the moment this runs, the new
-- user has no profile yet, so RLS on public.profiles/public.businesses
-- would otherwise block the very rows that establish their access.
-- search_path is locked to empty and every reference is schema-qualified
-- to prevent search_path hijacking of this elevated-privilege function.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
begin
  insert into public.businesses (name)
  values (coalesce(new.raw_user_meta_data ->> 'business_name', 'My Business'))
  returning id into new_business_id;

  insert into public.profiles (id, business_id, full_name, role)
  values (
    new.id,
    new_business_id,
    new.raw_user_meta_data ->> 'full_name',
    'owner'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helper: the calling user's business_id
-- ---------------------------------------------------------------------
--
-- Centralizes "which business does the current user belong to" so RLS
-- policies here and on future multi-tenant tables can reuse it instead
-- of repeating the subquery (and so profiles' own RLS policy doesn't
-- need to be re-evaluated recursively by every other table's policy).

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select business_id from public.profiles where id = auth.uid();
$$;

revoke execute on function public.current_business_id() from public;
grant execute on function public.current_business_id() to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;

-- profiles: a user can only see and update their own profile row.
-- Inserts/deletes are intentionally not exposed to clients — rows are
-- created by handle_new_user() and removed via auth.users cascade.

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- businesses: visible to any user whose profile belongs to that
-- business; only an 'owner' profile may update the business record.
-- Inserts/deletes are intentionally not exposed to clients — rows are
-- created by handle_new_user().

create policy "Members can view their business"
  on public.businesses for select
  using (id = public.current_business_id());

create policy "Owners can update their business"
  on public.businesses for update
  using (
    id = public.current_business_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner'
    )
  )
  with check (id = public.current_business_id());

-- ---------------------------------------------------------------------
-- Pattern for future multi-tenant tables (NOT created by this migration)
-- ---------------------------------------------------------------------
--
-- Tables such as customers, estimates, estimate_items, and proposals
-- should each carry a `business_id uuid not null references
-- public.businesses (id)` column and reuse this same isolation pattern:
--
--   alter table public.<table> enable row level security;
--
--   create policy "Members can access their business's <table>"
--     on public.<table> for all
--     using (business_id = public.current_business_id())
--     with check (business_id = public.current_business_id());
--
-- That single policy (or split per-command if different roles need
-- different permissions) is what keeps one business's data invisible
-- to every other business.
