-- Quotauna — Phase 9: business profile fields
--
-- Adds nullable contact/address columns to public.businesses so a
-- contractor can fill in their business's email, phone, and address for
-- use on customer-facing surfaces (proposal emails, the public proposal
-- page, etc.) in a later Phase 9 step. This migration is schema only —
-- no UI, no RPC, no change to proposal rendering or email sending reads
-- any of these columns yet.
--
-- Deliberately minimal and additive:
--   - id, name, created_at, updated_at are untouched.
--   - No RLS policy changes — the existing "Members can view their
--     business" (select) and "Owners can update their business"
--     (update) policies from 20260908120000_init_auth_foundation.sql
--     already cover these new columns automatically (RLS scopes rows,
--     not individual columns), so an owner-role profile can already
--     read/write them through the normal RLS-scoped client once a form
--     exists to do so.
--   - No new RPC — same reasoning: unlike proposals (locked down to
--     SECURITY DEFINER-only mutation in Phase 6/7), businesses was
--     never restricted that way, so no new privileged function is
--     needed just to add columns here.
--   - No logo/file field — logo storage is a distinct concern (Supabase
--     Storage bucket + policy, not a plain column) and explicitly out
--     of scope for this migration.
--
-- All eight columns are plain nullable text, matching the no-format-
-- CHECK style public.customers already uses for its own email/phone/
-- address columns (20260909100000_customers.sql) — format validation,
-- if any, belongs at the application layer, not a DB constraint here.

alter table public.businesses
  add column if not exists email text;

alter table public.businesses
  add column if not exists phone text;

alter table public.businesses
  add column if not exists address_line1 text;

alter table public.businesses
  add column if not exists address_line2 text;

alter table public.businesses
  add column if not exists city text;

alter table public.businesses
  add column if not exists state text;

alter table public.businesses
  add column if not exists zip text;

alter table public.businesses
  add column if not exists website text;

comment on column public.businesses.email is
  'Contractor-entered business contact email, optional. Not yet read by any application code as of this migration (Phase 9 schema step only) — no UI, proposal rendering, or email-sending logic references it yet.';

comment on column public.businesses.phone is
  'Contractor-entered business contact phone, optional. Not yet read by any application code as of this migration.';

comment on column public.businesses.address_line1 is
  'Contractor-entered business address, optional. Not yet read by any application code as of this migration.';

comment on column public.businesses.address_line2 is
  'Contractor-entered business address (suite/unit/etc.), optional. Not yet read by any application code as of this migration.';

comment on column public.businesses.city is
  'Contractor-entered business address city, optional. Not yet read by any application code as of this migration.';

comment on column public.businesses.state is
  'Contractor-entered business address state/province, optional. Not yet read by any application code as of this migration.';

comment on column public.businesses.zip is
  'Contractor-entered business address postal code, optional. Not yet read by any application code as of this migration.';

comment on column public.businesses.website is
  'Contractor-entered business website URL, optional. Not yet read by any application code as of this migration.';

-- No trigger changes: businesses_set_updated_at (defined in
-- 20260908120000_init_auth_foundation.sql, firing public.set_updated_at()
-- before update on public.businesses) already fires on any UPDATE to
-- this table, these new columns included — nothing to redefine here.
