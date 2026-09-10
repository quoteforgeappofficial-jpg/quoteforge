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
-- (128+ bits of randomness, generated server-side in application code)
-- is the only thing that ever identifies a proposal to an anonymous
-- visitor; the row's own UUID is never sent to the browser.
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
  -- 128+ bits of entropy) collision.
  public_token text not null unique,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined')),

  -- Snapshotted from the estimate at creation time — see the trigger-free
  -- application logic in src/lib/proposals/actions.ts. Deliberately no
  -- foreign key to estimates for these values themselves (they're a
  -- point-in-time copy, not a live reference).
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
  'Customer-facing proposal snapshots created from an estimate. Contains no internal cost/markup/profit data — only final_selling_price and customer-safe fields. Publicly readable by public_token only, through the server-only admin client — never through RLS.';

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
-- once at proposal-creation time and never edited afterward — see
-- src/lib/proposals/actions.ts — so there is nothing to keep in sync).

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
  'Snapshotted customer-facing line items for a proposal: description + optional quantity only. No unit_cost column exists on this table at all.';

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
-- Row Level Security
-- ---------------------------------------------------------------------
--
-- Authenticated, business-scoped access only — identical single-policy
-- pattern to customers/estimates. There is no anon/public policy on
-- either table: the public /p/[token] page never queries through RLS at
-- all, it goes through the server-only admin client instead (see the
-- top-of-file note and docs/PROPOSALS_PUBLIC_ACCESS.md). That keeps
-- "authenticated contractor access" and "anonymous customer access" on
-- two completely separate code paths, rather than trying to express the
-- public case as a permissive RLS policy that could be broadened by
-- accident later.

alter table public.proposals enable row level security;
alter table public.proposal_line_items enable row level security;

drop policy if exists "Members can access their business's proposals"
  on public.proposals;

create policy "Members can access their business's proposals"
  on public.proposals for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "Members can access their business's proposal line items"
  on public.proposal_line_items;

create policy "Members can access their business's proposal line items"
  on public.proposal_line_items for all
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
