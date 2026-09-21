# Proposal email delivery (Phase 7)

Lets a contractor send a Draft proposal to its customer by email directly
from Quotauna. On the proposal detail page, a Draft proposal shows a
**Send Proposal** button (replacing the old, email-less "Mark as sent"
button from Phase 6); on success the proposal moves to **Sent** and
records when.

## What this does *not* do

- **It never exposes internal pricing.** The email is built from a
  narrow, explicit input shape (`ProposalEmailInput` in
  `src/lib/email/provider.ts`) — business name, customer name, proposal
  title, the public proposal URL. There is no field for unit cost,
  internal cost subtotals, markup, minimum job price, suggested price,
  profit, internal notes, or AI assumptions/questions — none of that
  data is even reachable from the function that builds the email
  (`buildProposalEmail` in `src/lib/email/proposal-email-template.ts`),
  the same "the type itself makes leaking impossible" pattern Phase 6's
  `PublicProposal` DTO already uses for the public `/p/[token]` page.
- **It doesn't guarantee exactly-once delivery.** Resend's API is
  outside any PostgreSQL transaction — a crash between "Resend accepted
  the email" and "the database recorded that" cannot be made perfectly
  atomic. See the migration
  (`supabase/migrations/20260918090000_proposal_email_send_claims.sql`)
  for the full design and its honest limits, and
  `src/lib/proposals/send-actions.ts` for how each failure mode is
  handled.
- **It doesn't implement SMS, reminders, automatic retries, payments,
  invoices, scheduling, or open tracking.** Out of scope for this
  phase, by design.
- **It doesn't touch the public accept/decline flow.** `/p/[token]` and
  `src/lib/proposals/public-data.ts`/`public-actions.ts` are unchanged.

## Architecture

- `src/lib/email/provider.ts` — the `EmailProvider` abstraction,
  `ProposalEmailInput`/`ProposalEmailResult` types, `EmailDeliveryError`,
  and `getEmailProvider()` (returns `null` if unconfigured — same
  pattern as `src/lib/ai/provider.ts`).
- `src/lib/email/resend-provider.ts` — the only file that imports the
  `resend` package.
- `src/lib/email/proposal-email-template.ts` — pure function building
  the subject/html/text; escapes every contractor/customer-controlled
  string before it enters the HTML body.
- `src/lib/proposals/send-actions.ts` — the `sendProposalEmail` Server
  Action: auth + RLS-scoped read + validation happen first, then a
  short critical section (acquire DB claim → call Resend → record its
  message id → finalize) that only ever marks the proposal Sent after
  a confirmed provider success.
- `supabase/migrations/20260918090000_proposal_email_send_claims.sql`
  — five new columns on `proposals` (an idle/sending claim with a
  per-attempt `uuid` token, a diagnostic provider message id, a
  diagnostic last-error message) and four new `SECURITY DEFINER` RPCs
  (`begin_proposal_email_send`, `record_proposal_email_provider_id`,
  `release_proposal_email_send`, `finalize_proposal_email_send`).
  Phase 6's `mark_proposal_as_sent()` and
  `20260910104450_proposals.sql` are both untouched.

Every RPC re-derives the caller's business via `current_business_id()`
and re-checks it server-side — the same posture as every Phase 6 RPC.
The three claim-mutating RPCs additionally require the exact current
`email_send_claim_token`, so a stalled attempt that resumes after its
claim was reclaimed can never mutate a newer attempt's state.

## 1. Create a Resend account and verify a sending domain

1. Sign up at [resend.com](https://resend.com).
2. Add and verify a sending domain (DNS records for SPF/DKIM) — see
   Resend's own domain-verification docs. Sandbox/unverified accounts
   can only send to the account owner's own address, which is fine for
   local testing but not for real customers.
3. Create an API key — this is your `RESEND_API_KEY`.
   ⚠️ Treat it like a password: server-side secret only, never
   `NEXT_PUBLIC_`-prefixed, never referenced from a Client Component.

## 2. Set the environment variables

Same two options as the other server-side keys in this app (local
`.env.local`, or your deployment platform's environment variable
settings):

```
RESEND_API_KEY=re_...
PROPOSAL_EMAIL_FROM=Quotauna <proposals@quotauna.com>
```

`PROPOSAL_EMAIL_FROM` must be an address on the domain you verified in
step 1. For MVP this is one fixed sender for every business on
Quotauna — the contractor's own business name appears in the email's
subject and body, not in the From address. Per-business custom sending
domains are a larger feature, not implemented here.

Without both variables set, "Send Proposal" returns a friendly "not
available" error and nothing else in the app is affected — same
graceful-degradation posture as AI drafting without
`ANTHROPIC_API_KEY`.

## 3. Manual test checklist

- [ ] Draft proposal, no `RESEND_API_KEY`/`PROPOSAL_EMAIL_FROM` set →
      friendly "not available" error, status stays Draft, no claim taken.
- [ ] Draft proposal, customer has no email → friendly error, status
      stays Draft.
- [ ] Draft proposal, customer email malformed → friendly error, status
      stays Draft.
- [ ] Draft proposal, valid email, provider configured → email
      received, content has no cost/markup/min-price/notes, correct
      public link, proposal flips to Sent with a recorded time.
- [ ] Force a provider failure (e.g. temporarily invalid API key) →
      status stays Draft, friendly error shown, claim released
      (confirm a subsequent send attempt is not blocked).
- [ ] Double-click "Send Proposal" / two tabs → only one email sent,
      only one transition to Sent, the other gets an "already in
      progress" message.
- [ ] Cross-business proposal id crafted in a request → not found, no
      email sent.
- [ ] Existing public `/p/[token]` view + Accept/Decline still work
      end-to-end, unaffected.
- [ ] A Sent proposal shows no "Send Proposal" button.
