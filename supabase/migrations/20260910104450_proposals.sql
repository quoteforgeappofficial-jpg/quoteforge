-- QuoteForge — Phase 6: customer-facing proposals with secure public links
--
-- Adds two business-scoped tables, following the same patterns as
-- 20260909112300_estimates.sql:
--
--   - public.proposals: a customer-facing snapshot created from an
--     estimate. Deliberately NOT a live view of the estimate — once
--     created, a proposal's title/description/final_selling_price/line
--     items never change just because the source estimate is later
--     edited. Only customer-safe fields are ever snapshotted; internal
--     cost/markup/profit fields never appear on this table at all.
--   - public.proposal_line_items: the snapshotted line items shown to
--     the customer — description + optional quantity only. No unit_cost
--     column exists here, at all, on this table — there is nothing for
--     any code path to leak a cost through, even by accident.
--
-- Public access model (see docs/PROPOSALS_PUBLIC_ACCESS.md for the full
-- writeup): these tables keep the same authenticated, business-scoped
-- RLS as every other table in this app — RLS is NOT weakened or opened
-- up for public/anon access. The public /p/[token] route instead reads
-- through the server-only service-role client (already established by
-- src/lib/supabase/admin.ts in the auth-foundation migration) inside a
-- narrowly-scoped server module that selects an explicit, hard-coded
-- column allowlist — never `select("*")` — and maps the result through
-- an explicit DTO before it ever reaches a page. The public token itself
-- (192 bits of randomness, generated server-side in application code)
-- is the only thing that ever identifies a proposal to an anonymous
-- visitor; the row's own UUID is never sent to the browser.
--
-- Hardening pass (this revision, migration still unapplied): mutation
-- of both tables now happens ONLY through two SECURITY DEFINER RPCs
-- (create_proposal_from_estimate, mark_proposal_as_sent) plus the
-- public accept/decline path's single atomic UPDATE via the admin
-- client (src/lib/proposals/public-actions.ts) — never through
-- unrestricted table INSERT/UPDATE/DELETE from `authenticated`. See the
-- "Table privileges" section near the bottom for the exact model and
-- reasoning.
--
-- Nothing in the existing auth/customers/estimates foundation is
-- changed by this migration.

-- ---------------------------------------------------------------------
-- Table: proposals
-- ---------------------------------------------------------------------

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses (id) on delete cascade,

  -- One proposal per estimate for this phase — `unique` enforces that at
  -- the database level, not just in application logic. Composite FK
  -- (rather than a plain estimate_id -> estimates(id) FK) so a
  -- proposal's business_id is forced to match its source estimate's
  -- business_id, the same technique estimate_line_items already uses
  -- against estimates.
  estimate_id uuid not null unique,
  customer_id uuid references public.customers (id) on delete set null,

  -- Not a default/random-looking sequential value — always generated
  -- server-side by src/lib/proposals/token.ts before insert. `unique`
  -- is the DB-level backstop against a (astronomically unlikely, given
  -- 192 bits of entropy) collision. The check constraint mirrors
  -- src/lib/proposals/token.ts's isValidPublicToken() exactly (32
  -- base64url characters) — defense in depth in case application code
  -- ever generates a token some other way.
  public_token text not null unique
    check (public_token ~ '^[A-Za-z0-9_-]{32}$'),

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined')),

  -- Snapshotted from the estimate at creation time — see
  -- create_proposal_from_estimate() below. Deliberately no foreign key
  -- to estimates for these values themselves (they're a point-in-time
  -- copy, not a live reference).
  title text not null check (btrim(title) <> ''),
  description text,
  final_selling_price numeric(12, 2) not null check (final_selling_price >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,

  -- Referenced by proposal_line_items' composite foreign key below, for
  -- the same reason estimates carries the equivalent constraint: id
  -- alone is already unique (primary key), this exists only so Postgres
  -- will accept (id, business_id) as an FK target.
  constraint proposals_id_business_id_key unique (id, business_id),

  constraint proposals_estimate_business_fkey
    foreign key (estimate_id, business_id)
    references public.estimates (id, business_id)
    on delete cascade
);

comment on table public.proposals is
  'Customer-facing proposal snapshots created from an estimate. Contains no internal cost/markup/profit data — only final_selling_price and customer-safe fields. Publicly readable by public_token only, through the server-only admin client — never through RLS. Mutated only through create_proposal_from_estimate()/mark_proposal_as_sent() (contractor) or a single atomic UPDATE via the admin client (public accept/decline) — see "Table privileges" below.';

create index if not exists proposals_business_id_created_at_idx
  on public.proposals (business_id, created_at desc);

create index if not exists proposals_customer_id_idx
  on public.proposals (customer_id)
  where customer_id is not null;

-- public_token is looked up on every /p/[token] request, by definition
-- without a business_id to scope by (the visitor isn't authenticated) —
-- this is the one lookup path on this table that isn't business_id-first.
create index if not exists proposals_public_token_idx
  on public.proposals (public_token);

-- customers has no (id, business_id) unique constraint to hang a
-- composite FK off (unlike estimates), so — same rationale and pattern
-- as check_estimate_customer_business in the estimates migration — a
-- trigger enforces that a linked customer_id belongs to the same
-- business. Runs with the caller's own privileges (no security
-- definer), so the lookup is itself subject to customers' RLS.
--
-- This still fires correctly for inserts made from inside
-- create_proposal_from_estimate() below, even though that function is
-- SECURITY DEFINER (which bypasses RLS for statements it runs): the
-- trigger's own query has an explicit `and business_id = new.business_id`
-- condition, so its correctness never depended on RLS filtering rows —
-- only on RLS *not blocking* the query outright, which SECURITY DEFINER
-- guarantees rather than threatens. create_proposal_from_estimate()
-- additionally re-checks this itself before inserting, so the two are
-- redundant by design rather than the trigger being the only guard.

create or replace function public.check_proposal_customer_business()
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

drop trigger if exists proposals_check_customer_business on public.proposals;
create trigger proposals_check_customer_business
  before insert or update on public.proposals
  for each row execute function public.check_proposal_customer_business();

-- ---------------------------------------------------------------------
-- Table: proposal_line_items
-- ---------------------------------------------------------------------
--
-- Deliberately minimal: description + optional quantity only. No
-- unit_cost column, no category, no updated_at (these rows are written
-- once, inside create_proposal_from_estimate() below, and never edited
-- afterward — so there is nothing to keep in sync).

create table if not exists public.proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  business_id uuid not null default public.current_business_id(),

  description text not null check (btrim(description) <> ''),
  quantity numeric(12, 2),
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  -- Same composite-FK technique as estimate_line_items -> estimates:
  -- forces business_id to match this row's own proposal, not merely to
  -- be some valid business. proposals.business_id already cascades from
  -- businesses, so cascading here off proposals is sufficient to reach
  -- a deleted business transitively — no separate FK to businesses
  -- needed on this table.
  constraint proposal_line_items_proposal_business_fkey
    foreign key (proposal_id, business_id)
    references public.proposals (id, business_id)
    on delete cascade
);

comment on table public.proposal_line_items is
  'Snapshotted customer-facing line items for a proposal: description + optional quantity only. No unit_cost column exists on this table at all. Immutable after creation — written only by create_proposal_from_estimate().';

create index if not exists proposal_line_items_proposal_id_idx
  on public.proposal_line_items (proposal_id, sort_order);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
-- Reuses public.set_updated_at(), defined in the auth foundation
-- migration. proposal_line_items has no updated_at column (see above),
-- so it gets no trigger.

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- create_proposal_from_estimate: atomic, authenticated proposal creation
-- ---------------------------------------------------------------------
--
-- Replaces the previous two-step "insert proposal, then insert
-- proposal_line_items, then best-effort cleanup on failure" application
-- logic with one database transaction — a single RPC call is atomic by
-- construction (plpgsql functions cannot partially commit).
--
-- SECURITY DEFINER, matching save_estimate_line_items()'s established
-- pattern (Phase 4): runs with the function owner's privileges, so it
-- can insert into proposals/proposal_line_items even though
-- `authenticated` itself holds no direct INSERT privilege on either
-- table (see "Table privileges" below). Because that bypasses RLS, this
-- function is the actual authorization boundary, which is why it:
--   - resolves the caller's own business via public.current_business_id()
--     (which itself reads auth.uid() — unaffected by SECURITY DEFINER
--     nesting, since auth.uid() comes from session-level JWT claims, not
--     Postgres role privileges) rather than trusting any caller-supplied
--     business id,
--   - reads the estimate by id only, then explicitly checks its
--     business_id against the caller's — never relies on RLS to filter
--     it out for a cross-business id,
--   - reads only the five estimate columns it might snapshot
--     (business_id for the check, customer_id, title, description,
--     final_selling_price) into named variables — there is no `record`
--     or `select *` here holding unit_cost/subtotals/markup/
--     minimum_job_price/internal_notes even transiently,
--   - requires final_selling_price to be non-null before doing anything
--     else,
--   - re-checks customer/business consistency explicitly (redundant
--     with, but independent of, the trigger above),
--   - copies only description/quantity from each estimate line item.
--
-- One-proposal-per-estimate race: `insert ... on conflict (estimate_id)
-- do nothing returning id` is itself atomic — Postgres blocks a
-- conflicting concurrent INSERT until the other transaction commits or
-- rolls back before resolving the conflict, so by the time this
-- function's own insert decides "do nothing", the winning transaction's
-- row is guaranteed visible to the follow-up `select`. Both concurrent
-- callers therefore return the same proposal id; the estimate_id unique
-- constraint is never weakened, and no caller ever sees a raw
-- constraint-violation error for this case.
--
-- p_public_token is generated in application code
-- (src/lib/proposals/token.ts, the single token generator) and passed
-- in rather than generated in SQL, per that module's own reasoning.

create or replace function public.create_proposal_from_estimate(
  p_estimate_id uuid,
  p_public_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_business_id uuid;
  v_estimate_business_id uuid;
  v_customer_id uuid;
  v_title text;
  v_description text;
  v_final_selling_price numeric(12, 2);
  v_proposal_id uuid;
begin
  v_caller_business_id := public.current_business_id();

  if v_caller_business_id is null then
    raise exception 'Not authorized.';
  end if;

  select business_id, customer_id, title, description, final_selling_price
    into v_estimate_business_id, v_customer_id, v_title, v_description, v_final_selling_price
  from public.estimates
  where id = p_estimate_id;

  -- Combines "no such estimate" and "not yours" into one message,
  -- deliberately not distinguishing them — the same posture the
  -- application layer already used before this hardening pass.
  if v_estimate_business_id is null or v_estimate_business_id <> v_caller_business_id then
    raise exception 'Estimate not found or not accessible.';
  end if;

  if v_final_selling_price is null then
    raise exception 'Set a final selling price before creating a proposal.';
  end if;

  if v_customer_id is not null and not exists (
    select 1 from public.customers
    where id = v_customer_id and business_id = v_caller_business_id
  ) then
    raise exception 'Estimate data is inconsistent — customer does not belong to this business.';
  end if;

  insert into public.proposals (
    business_id, estimate_id, customer_id, public_token,
    title, description, final_selling_price
  )
  values (
    v_caller_business_id, p_estimate_id, v_customer_id, p_public_token,
    v_title, v_description, v_final_selling_price
  )
  on conflict (estimate_id) do nothing
  returning id into v_proposal_id;

  if v_proposal_id is null then
    -- Another concurrent call already created the proposal for this
    -- estimate (see race-handling note above) — return its id rather
    -- than erroring or creating a second one. p_public_token generated
    -- for this call is simply discarded; it was never persisted.
    select id into v_proposal_id
    from public.proposals
    where estimate_id = p_estimate_id;

    return v_proposal_id;
  end if;

  insert into public.proposal_line_items (
    proposal_id, business_id, description, quantity, sort_order
  )
  select v_proposal_id, v_caller_business_id, eli.description, eli.quantity, eli.sort_order
  from public.estimate_line_items eli
  where eli.estimate_id = p_estimate_id
  order by eli.sort_order;

  return v_proposal_id;
end;
$$;

revoke execute on function public.create_proposal_from_estimate(uuid, text) from public;
grant execute on function public.create_proposal_from_estimate(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- mark_proposal_as_sent: atomic draft -> sent transition
-- ---------------------------------------------------------------------
--
-- SECURITY DEFINER for the same reason as above: `authenticated` holds
-- no direct UPDATE privilege on proposals (see "Table privileges"
-- below), so this narrowly-scoped function is the only path to this one
-- transition. A single UPDATE ... WHERE ... RETURNING is atomic on its
-- own — the `status = 'draft'` condition in the WHERE clause and the
-- write happen as one statement, so there is no separate "check status,
-- then write" race window. Returns whether a row actually transitioned;
-- callers (src/lib/proposals/actions.ts) must not report success when
-- this returns false.

create or replace function public.mark_proposal_as_sent(p_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_business_id uuid;
  v_updated_id uuid;
begin
  v_caller_business_id := public.current_business_id();

  if v_caller_business_id is null then
    raise exception 'Not authorized.';
  end if;

  update public.proposals
  set status = 'sent', sent_at = now()
  where id = p_proposal_id
    and business_id = v_caller_business_id
    and status = 'draft'
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke execute on function public.mark_proposal_as_sent(uuid) from public;
grant execute on function public.mark_proposal_as_sent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
--
-- Authenticated, business-scoped SELECT only — see "Table privileges"
-- immediately below for why this is `for select`, not `for all`, as of
-- this hardening pass. There is no anon/public policy on either table:
-- the public /p/[token] page never queries through RLS at all, it goes
-- through the server-only admin client instead (see the top-of-file
-- note and docs/PROPOSALS_PUBLIC_ACCESS.md).

alter table public.proposals enable row level security;
alter table public.proposal_line_items enable row level security;

drop policy if exists "Members can access their business's proposals"
  on public.proposals;
drop policy if exists "Members can view their business's proposals"
  on public.proposals;

create policy "Members can view their business's proposals"
  on public.proposals for select
  using (business_id = public.current_business_id());

drop policy if exists "Members can access their business's proposal line items"
  on public.proposal_line_items;
drop policy if exists "Members can view their business's proposal line items"
  on public.proposal_line_items;

create policy "Members can view their business's proposal line items"
  on public.proposal_line_items for select
  using (business_id = public.current_business_id());

-- ---------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------
--
-- Explicit GRANT/REVOKE rather than relying on whatever Supabase's
-- default privileges already applied when these tables were created —
-- the same hardening already applied to estimates'/estimate_line_items'
-- subtotal-drift fix.
--
-- `anon`: no privileges at all, on either table — revoked explicitly
-- rather than left to default privileges (or to the absence of an anon
-- RLS policy alone). The public /p/[token] page never queries through
-- the anon role in the first place — it reads via the service-role
-- admin client (src/lib/proposals/public-data.ts,
-- src/lib/proposals/public-actions.ts), which is a separate Postgres
-- role (service_role) entirely unaffected by anything revoked here —
-- but a stray anon-authenticated request against these tables should
-- fail on privileges, not merely happen to match zero RLS rows.
--
-- `authenticated`: SELECT only, on both tables. What that does and
-- doesn't allow, and why:
--
--   - SELECT: yes, on both tables — the dashboard list/detail pages
--     (src/app/dashboard/proposals/...) read directly through the
--     regular RLS-scoped client.
--   - INSERT: no, on either table. Creation only happens through
--     create_proposal_from_estimate() above, which runs as its own
--     (privileged) owner and so is unaffected by this revoke.
--   - UPDATE: no, on either table. This is the core of this hardening
--     pass: without it, `authenticated` cannot set public_token,
--     estimate_id, business_id, customer_id, title, description, or
--     final_selling_price after creation (the snapshot stays
--     immutable, as intended for this phase), cannot set status to
--     'sent' except through mark_proposal_as_sent() above, and cannot
--     set status to 'accepted'/'declined' at all as an authenticated
--     user — that transition only ever happens through the public
--     accept/decline path (src/lib/proposals/public-actions.ts), which
--     uses the admin/service-role client and so is likewise unaffected
--     by this revoke.
--   - DELETE: no, on either table. No delete-proposal feature exists in
--     this phase; nothing needs it.
--
-- `service_role` (the admin client): untouched by any of the statements
-- below — Supabase grants it broad privileges independent of anon/
-- authenticated, which is exactly what src/lib/supabase/admin.ts
-- already relies on.
--
-- The RLS policies above (select-only) already reflect the
-- `authenticated` posture, but the privileges here are the actual
-- enforcement — RLS only ever narrows what a query can see/touch among
-- rows a role already has the underlying table privilege to
-- select/insert/update/delete at all.

revoke all on public.proposals from anon;
revoke all on public.proposals from authenticated;
grant select on public.proposals to authenticated;

revoke all on public.proposal_line_items from anon;
revoke all on public.proposal_line_items from authenticated;
grant select on public.proposal_line_items to authenticated;
