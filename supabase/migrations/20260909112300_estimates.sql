-- QuoteForge — Phase 4: estimates (core estimating system, no AI yet)
--
-- Adds two business-scoped tables, following the same pattern as
-- 20260909100000_customers.sql:
--
--   - public.estimates: one row per estimate. business_id defaults to
--     the inserting user's own business via public.current_business_id().
--     customer_id optionally links to a customer — a trigger enforces
--     that the linked customer belongs to the *same* business, since a
--     plain foreign key alone can't express that.
--   - public.estimate_line_items: the normalized labor/materials/
--     equipment/other line items behind an estimate's four subtotal
--     columns. Rows are only ever written via
--     public.save_estimate_line_items(), which replaces an estimate's
--     items atomically and recomputes its subtotal columns in the same
--     transaction — the app never has to keep the two in sync itself.
--
-- Both tables get the same single-policy RLS pattern as customers:
-- business_id = current_business_id() on every command. There is no
-- public/anon access anywhere in this migration — estimates (including
-- their cost/markup/pricing fields) are only ever reachable through an
-- authenticated session belonging to the owning business. Customer-
-- facing proposal views, if built later, will need their own explicit,
-- narrower access path rather than inheriting this one.
--
-- Nothing in the existing auth foundation or customers migration is
-- changed by this migration.

-- ---------------------------------------------------------------------
-- Table: estimates
-- ---------------------------------------------------------------------

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,

  title text not null check (btrim(title) <> ''),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined')),

  description text,
  internal_notes text,

  -- Denormalized aggregates, kept in sync with estimate_line_items by
  -- public.save_estimate_line_items() — never written to directly by
  -- application code.
  labor_subtotal numeric(12, 2) not null default 0 check (labor_subtotal >= 0),
  materials_subtotal numeric(12, 2) not null default 0 check (materials_subtotal >= 0),
  equipment_subtotal numeric(12, 2) not null default 0 check (equipment_subtotal >= 0),
  other_expenses_subtotal numeric(12, 2) not null default 0 check (other_expenses_subtotal >= 0),

  markup_type text not null default 'percent' check (markup_type in ('percent', 'amount')),
  markup_value numeric(12, 2) not null default 0 check (markup_value >= 0),

  minimum_job_price numeric(12, 2) check (minimum_job_price >= 0),
  final_selling_price numeric(12, 2) check (final_selling_price >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.estimates is
  'Contractor-facing estimates, including internal cost/markup detail. Strictly isolated per business via RLS; never exposed to an unauthenticated or customer-facing context.';

create index if not exists estimates_business_id_created_at_idx
  on public.estimates (business_id, created_at desc);

create index if not exists estimates_customer_id_idx
  on public.estimates (customer_id)
  where customer_id is not null;

-- A customer_id must belong to the same business as the estimate. A
-- plain foreign key can't express that, so a trigger checks it instead.
-- This runs with the caller's own privileges (no security definer), so
-- the lookup below is itself subject to customers' RLS: a customer_id
-- belonging to another business is invisible here regardless, and the
-- explicit business_id comparison just makes that guarantee explicit.

create or replace function public.check_estimate_customer_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers
    where id = new.customer_id and business_id = new.business_id
  ) then
    raise exception 'customer % does not belong to business %', new.customer_id, new.business_id;
  end if;

  return new;
end;
$$;

drop trigger if exists estimates_check_customer_business on public.estimates;
create trigger estimates_check_customer_business
  before insert or update on public.estimates
  for each row execute function public.check_estimate_customer_business();

-- ---------------------------------------------------------------------
-- Table: estimate_line_items
-- ---------------------------------------------------------------------

create table if not exists public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  business_id uuid not null default public.current_business_id()
    references public.businesses (id) on delete cascade,

  category text not null check (category in ('labor', 'materials', 'equipment', 'other')),
  description text not null check (btrim(description) <> ''),
  quantity numeric(12, 2) not null default 1 check (quantity >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.estimate_line_items is
  'Normalized labor/materials/equipment/other line items behind an estimate''s subtotal columns. Written only via public.save_estimate_line_items().';

create index if not exists estimate_line_items_estimate_id_idx
  on public.estimate_line_items (estimate_id, sort_order);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
-- Reuses public.set_updated_at(), defined in the auth foundation
-- migration — no new trigger function needed.

drop trigger if exists estimates_set_updated_at on public.estimates;
create trigger estimates_set_updated_at
  before update on public.estimates
  for each row execute function public.set_updated_at();

drop trigger if exists estimate_line_items_set_updated_at on public.estimate_line_items;
create trigger estimate_line_items_set_updated_at
  before update on public.estimate_line_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Replace an estimate's line items and recompute its subtotal columns
-- ---------------------------------------------------------------------
--
-- Deliberately security invoker (the default — no "security definer"):
-- every statement below runs as the calling user, so it can only ever
-- read or write rows that user's own RLS policies already allow. The
-- initial lookup doubles as an authorization check — an estimate_id
-- that isn't visible to the caller yields no business_id, and the
-- function raises rather than silently doing nothing.
--
-- Replace-all-on-save (delete then reinsert) keeps this simple for a
-- first version: the app always submits the full current set of line
-- items, never incremental add/remove operations against this function.

create or replace function public.save_estimate_line_items(
  p_estimate_id uuid,
  p_items jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.estimates
  where id = p_estimate_id;

  if v_business_id is null then
    raise exception 'estimate % not found or not accessible', p_estimate_id;
  end if;

  delete from public.estimate_line_items where estimate_id = p_estimate_id;

  insert into public.estimate_line_items (
    estimate_id, business_id, category, description, quantity, unit_cost, sort_order
  )
  select
    p_estimate_id,
    v_business_id,
    item ->> 'category',
    item ->> 'description',
    coalesce((item ->> 'quantity')::numeric, 1),
    coalesce((item ->> 'unit_cost')::numeric, 0),
    (ordinality - 1)::int
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as item;

  update public.estimates
  set
    labor_subtotal = (
      select coalesce(sum(quantity * unit_cost), 0) from public.estimate_line_items
      where estimate_id = p_estimate_id and category = 'labor'
    ),
    materials_subtotal = (
      select coalesce(sum(quantity * unit_cost), 0) from public.estimate_line_items
      where estimate_id = p_estimate_id and category = 'materials'
    ),
    equipment_subtotal = (
      select coalesce(sum(quantity * unit_cost), 0) from public.estimate_line_items
      where estimate_id = p_estimate_id and category = 'equipment'
    ),
    other_expenses_subtotal = (
      select coalesce(sum(quantity * unit_cost), 0) from public.estimate_line_items
      where estimate_id = p_estimate_id and category = 'other'
    )
  where id = p_estimate_id;
end;
$$;

revoke execute on function public.save_estimate_line_items(uuid, jsonb) from public;
grant execute on function public.save_estimate_line_items(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.estimates enable row level security;
alter table public.estimate_line_items enable row level security;

drop policy if exists "Members can access their business's estimates"
  on public.estimates;

create policy "Members can access their business's estimates"
  on public.estimates for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "Members can access their business's estimate line items"
  on public.estimate_line_items;

create policy "Members can access their business's estimate line items"
  on public.estimate_line_items for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
