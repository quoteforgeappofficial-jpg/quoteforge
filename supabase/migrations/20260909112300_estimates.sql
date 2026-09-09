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
--     Its business_id is enforced, at the database level, to match its
--     own estimate's business_id — via a composite foreign key
--     (estimate_id, business_id) -> estimates (id, business_id), not
--     merely RLS or application code. This is why estimates carries a
--     unique (id, business_id) constraint below.
--
-- Subtotal-drift prevention: estimates.<category>_subtotal is only ever
-- correct if it's kept in sync with the line items behind it, so two
-- separate database-level restrictions back that up rather than relying
-- on application discipline alone:
--   - estimate_line_items' RLS grants authenticated users SELECT only —
--     there is no insert/update/delete policy for that role, so those
--     commands are rejected outright regardless of what the client
--     sends. save_estimate_line_items() is SECURITY DEFINER, so it (and
--     only it) can still write these rows, bypassing RLS as the
--     function's owner — with its own explicit business_id check taking
--     over the authorization job RLS would otherwise have done.
--   - estimates' column-level privileges restrict authenticated INSERT/
--     UPDATE to the non-subtotal columns only, so even a direct,
--     hand-crafted request against estimates itself cannot set or
--     change labor_subtotal/materials_subtotal/equipment_subtotal/
--     other_expenses_subtotal — only save_estimate_line_items() (via
--     SECURITY DEFINER) can.
--
-- Both tables get the same single-policy RLS pattern as customers for
-- read access: business_id = current_business_id(). There is no public/
-- anon access anywhere in this migration — estimates (including their
-- cost/markup/pricing fields) are only ever reachable through an
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
  updated_at timestamptz not null default now(),

  -- Referenced by estimate_line_items' composite foreign key below, so
  -- a line item's business_id can be enforced against its *specific*
  -- estimate's business_id at the database level, not just against
  -- businesses in general. id alone is already unique (it's the primary
  -- key); this composite constraint exists purely so Postgres will
  -- accept (id, business_id) as an FK target.
  constraint estimates_id_business_id_key unique (id, business_id)
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
  estimate_id uuid not null,
  business_id uuid not null default public.current_business_id(),

  category text not null check (category in ('labor', 'materials', 'equipment', 'other')),
  description text not null check (btrim(description) <> ''),
  quantity numeric(12, 2) not null default 1 check (quantity >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite FK instead of two separate single-column ones: this is
  -- what forces business_id to match *this row's own estimate*, not
  -- merely to be some valid business — a plain FK on business_id alone
  -- can't express that. estimates.business_id already cascades from
  -- businesses, so cascading here off estimates is sufficient to reach
  -- a deleted business transitively; no separate FK to businesses is
  -- needed on this table.
  constraint estimate_line_items_estimate_business_fkey
    foreign key (estimate_id, business_id)
    references public.estimates (id, business_id)
    on delete cascade
);

comment on table public.estimate_line_items is
  'Normalized labor/materials/equipment/other line items behind an estimate''s subtotal columns. Written only via public.save_estimate_line_items(). business_id is enforced to match the parent estimate''s business_id via a composite foreign key, not RLS/application code alone.';

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
-- SECURITY DEFINER: this is deliberate, and is what makes it possible
-- for estimate_line_items' own RLS (below) to grant authenticated users
-- SELECT only — this function is the *only* path left that can write
-- those rows, since it runs as the function's owner and so bypasses RLS
-- on both tables it touches, regardless of what policies exist for
-- authenticated.
--
-- That bypass means, unlike a security-invoker function, the initial
-- "does this estimate exist" lookup can no longer double as an
-- authorization check on its own — under RLS bypass it would happily
-- return an estimate belonging to a different business entirely. The
-- explicit v_caller_business_id comparison below is what restores that
-- check: it calls public.current_business_id(), which independently
-- resolves the caller's own business from auth.uid() via profiles, and
-- rejects the call unless it matches the target estimate's business_id.
-- p_estimate_id is the only input identifying which estimate to touch —
-- there is no p_business_id parameter, so a caller can never supply
-- (and this function never trusts) its own claim of which business it
-- belongs to.
--
-- search_path is locked to empty and every reference is schema-
-- qualified, the same hardening already used by handle_new_user() and
-- current_business_id(), for the same reason: a SECURITY DEFINER
-- function must not let search_path substitute a different object than
-- the one it was written against.
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
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_caller_business_id uuid;
begin
  select business_id into v_business_id
  from public.estimates
  where id = p_estimate_id;

  if v_business_id is null then
    raise exception 'estimate % not found', p_estimate_id;
  end if;

  v_caller_business_id := public.current_business_id();

  if v_caller_business_id is null or v_caller_business_id <> v_business_id then
    raise exception 'not authorized to modify estimate %', p_estimate_id;
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
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    with ordinality as items(item, ordinality);

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

-- Column-level write restriction on estimates: RLS above only checks
-- *which row* is being touched (business_id = current_business_id()),
-- not *which columns* — an authenticated update against the caller's
-- own estimate would otherwise be free to also set labor_subtotal,
-- materials_subtotal, equipment_subtotal, or other_expenses_subtotal to
-- anything at all, drifting them out of sync with the line items behind
-- them. Revoking the table-wide insert/update privilege and re-granting
-- it only for the columns the app actually writes closes that off: an
-- insert/update naming a subtotal column now fails at the privilege
-- check, before RLS is even evaluated. (Postgres note: a column-level
-- REVOKE alone would have no effect while a table-wide grant still
-- covers that column, so the table-wide privilege must be revoked
-- first.) Only save_estimate_line_items() — via SECURITY DEFINER — can
-- still set these four columns.
revoke insert, update on public.estimates from authenticated;
grant insert (
  customer_id, title, status, description, internal_notes,
  markup_type, markup_value, minimum_job_price, final_selling_price
) on public.estimates to authenticated;
grant update (
  customer_id, title, status, description, internal_notes,
  markup_type, markup_value, minimum_job_price, final_selling_price
) on public.estimates to authenticated;

-- estimate_line_items: SELECT only for authenticated. There is
-- deliberately no insert/update/delete policy for that role — under
-- RLS, a command with no matching policy is denied outright, so direct
-- writes against this table are rejected regardless of business_id.
-- save_estimate_line_items() (SECURITY DEFINER, above) is the only
-- remaining write path, which is what actually guarantees the
-- estimates subtotal columns stay in sync with these rows.

drop policy if exists "Members can access their business's estimate line items"
  on public.estimate_line_items;

drop policy if exists "Members can view their business's estimate line items"
  on public.estimate_line_items;

create policy "Members can view their business's estimate line items"
  on public.estimate_line_items for select
  using (business_id = public.current_business_id());
