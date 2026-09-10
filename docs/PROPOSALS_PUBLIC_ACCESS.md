# Phase 6: proposals & the public proposal link — security model

Read this before running `supabase/migrations/20260910104450_proposals.sql`
or testing `/p/[token]`. It explains how an anonymous customer can view
and respond to a proposal without ever weakening the RLS that protects
every other authenticated table in this app.

## The core design decision

There are two ways to let an anonymous visitor read one row out of an
RLS-protected table:

1. **Add a permissive RLS policy** granting `anon` read access, scoped
   somehow to "just this one row."
2. **Don't touch RLS at all.** Keep the table fully authenticated-only,
   and read it from a narrow, server-only code path using the
   service-role key (which bypasses RLS by design), with the actual
   safety enforced in that code path instead of in a policy.

This migration uses **option 2**. Reasons:

- A `USING` clause that has to reach an unauthenticated visitor
  necessarily can't reference `auth.uid()` or `current_business_id()` —
  it has to be keyed on something the visitor presents, like the token.
  Postgres RLS policies *can* do this (`using (public_token = current_setting(...))`
  or similar), but it means the token has to flow into a Postgres session
  setting on every request, and the table's RLS now has two completely
  different trust models layered on the same policy set — one for
  `authenticated`, one for anyone holding a token. That's more moving
  parts, and more surface for a future edit to a policy to widen access
  by accident.
- With option 2, `proposals` and `proposal_line_items` keep the *exact
  same* single-policy, business-scoped RLS as every other table in this
  app (`customers`, `estimates`, `estimate_line_items`). Anyone auditing
  RLS across the schema sees one pattern, no exceptions.
- The entire public-access boundary lives in one file,
  `src/lib/proposals/public-data.ts`, which is easy to point at and
  review in full (it's ~65 lines). The public read model is: an explicit
  column allowlist in one `select(...)` call, filtered by an exact
  `public_token` match, mapped through a DTO function that reads fields
  by name.

This is the same reasoning the app already applied once before: the
service-role client (`src/lib/supabase/admin.ts`) was added in the very
first migration specifically for "future privileged operations" that
need to bypass RLS in a controlled way. This is that future use.

## What "controlled" means in practice

Three separate things all have to be true for `/p/[token]` to leak
nothing it shouldn't:

1. **The query only selects safe columns.**
   `src/lib/proposals/public-data.ts` calls:
   ```ts
   .select(
     "id, title, description, status, final_selling_price, created_at, sent_at, business:businesses(name), customer:customers(first_name, last_name, company_name)",
   )
   ```
   `id` is fetched only to look up this proposal's line items in a
   second query — it is never included in the type passed to the DTO
   mapper, never returned from `getPublicProposalByToken`, and never
   rendered. There is no `select("*")` anywhere on this path.

2. **The DTO mapper reads fields by name, never by spreading the row.**
   `src/lib/proposals/public-dto.ts`'s `toPublicProposal()` builds the
   returned object field-by-field (`businessName: row.business?.name`,
   `title: row.title`, etc.) rather than `{ ...row }`. That means even
   if a future change widened the `select(...)` above to fetch more
   columns, those columns still wouldn't reach the page — `toPublicProposal`
   would need to be edited too, on purpose, to expose them. Two
   independent places have to agree before anything new becomes public.

3. **The page only ever imports the public DTO type.**
   `src/app/p/[token]/page.tsx` imports `getPublicProposalByToken` and
   renders `PublicProposal` — it has no import path to the internal
   `Proposal` type, `Estimate`, `EstimateLineItem`, or any Supabase
   client. There's no variable in scope holding internal data that a
   typo could put in JSX.

## What is never on this path, structurally

Not "hidden from the UI" — **not present in the data at all**, at any
point between the database and the rendered page:

- `unit_cost` — no such column exists on `proposal_line_items`. It was
  never copied out of `estimate_line_items` in the first place (see
  `src/lib/proposals/actions.ts`, which reads only `description` and
  `quantity` off each estimate line item).
- The four cost subtotals, markup type/value, minimum job price, and
  profit — none are columns on `proposals`. Only `final_selling_price`
  is copied from the estimate.
- `internal_notes` — not a column on `proposals`, never copied.
- AI assumptions/questions — never persisted anywhere (Phase 5), and
  regardless, not a column on `proposals`.
- The proposal's own database `id`, its `business_id`, its `estimate_id`,
  and its `customer_id` — none of these appear in `PublicProposal`. The
  only identifier ever sent to the browser is the `public_token` already
  in the URL.
- Other businesses' proposals — the admin client bypasses RLS, but the
  query is filtered to `public_token = <exact token>`, which is a unique
  column; there is no way to enumerate or accidentally match a row
  outside the one the visitor already holds the token for.

## The token itself

`src/lib/proposals/token.ts` generates 24 bytes (192 bits) of randomness
via Node's `crypto.randomBytes`, base64url-encoded — not derived from the
proposal's id, the business name, the customer's name, or any sequential
value. `public_token` has a database `unique` constraint. 192 bits is far
beyond the 128-bit minimum requested; guessing a valid token is not
computationally feasible.

## Accept / decline writes

`src/lib/proposals/public-actions.ts`'s `respondToProposal(token, decision)`
also uses the admin client, for the same reason (no session, no
`business_id` for RLS to key on). Its own safety:

- `decision` is the TypeScript literal union `"accept" | "decline"` —
  there is no code path by which an arbitrary status string reaches the
  database.
- The proposal to update is looked up by exact `public_token` match, and
  only that row's `id` is used for the subsequent `update(...)` — a
  guessed or malformed token simply matches no row.
- A proposal already `accepted` or `declined` cannot be transitioned
  again — the function checks the current status first and refuses if
  it isn't `draft` or `sent`.
- Accepting sets `status = 'accepted'`, `accepted_at = now()`, and
  clears `declined_at`; declining does the mirror image. The database
  `check` constraint on `status` additionally rejects any value outside
  `draft`/`sent`/`accepted`/`declined` regardless of what application
  code does.

## Why `draft -> accepted/declined` is allowed (not just `sent -> ...`)

The brief allowed this as an MVP simplification, and this migration
takes it: requiring a contractor to click "Mark as sent" before the
public link works adds a step to testing without adding real protection
— the `public_token` is already the entire access control for this
page, in every status. A `draft` proposal's link is exactly as hard to
guess as a `sent` one's.

## Authenticated (contractor) side — unchanged posture

`proposals` and `proposal_line_items` carry the same RLS as every other
business-scoped table: a single `for all` policy checking
`business_id = current_business_id()`. Every contractor-facing action
(`src/lib/proposals/actions.ts`) goes through the normal cookie-based,
RLS-scoped Supabase client — the admin client is used **only** in
`public-data.ts` and `public-actions.ts`, never in any authenticated
code path.

`business_id` on both tables defaults to `current_business_id()`, and a
composite foreign key (`(estimate_id, business_id)` on `proposals`,
`(proposal_id, business_id)` on `proposal_line_items`) forces a row's
`business_id` to actually match its parent's — the same technique
`estimate_line_items` already uses against `estimates`. `customer_id` on
`proposals` is checked against the same business via a trigger, mirroring
`estimates`' `check_estimate_customer_business`.

## One proposal per estimate

`proposals.estimate_id` has a database `unique` constraint — a second
`insert` for the same estimate fails at the database level regardless of
what application code does. `createProposalFromEstimate` checks for an
existing proposal first and redirects to it, so the common case (a
contractor clicking "Create proposal" twice) is a clean redirect, not a
visible database error.
