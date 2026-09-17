-- QuoteForge — Phase 7: proposal email send claim (database-backed)
--
-- Adds a per-attempt-identified send claim to public.proposals, plus
-- four narrowly-scoped SECURITY DEFINER RPCs that are the only way to
-- acquire, progress, release, or finalize that claim. Does NOT touch
-- 20260910104450_proposals.sql, does NOT redefine that file's
-- mark_proposal_as_sent(), and does NOT add any value to
-- proposals.status — the customer-facing lifecycle stays exactly
-- draft -> sent -> accepted/declined.
--
-- Why a claim TOKEN, not just a status+timestamp: a bare status+
-- timestamp claim has no way to tell "the process that originally
-- acquired this claim" apart from "a later process that reclaimed it
-- after the first one stalled past its TTL." Without a token, a
-- stalled worker that eventually resumes could mutate a claim it no
-- longer actually owns — e.g. record a provider id, release, or
-- finalize on top of a different, newer attempt. Every mutation to an
-- in-flight claim below requires BOTH the proposal id AND the exact
-- current email_send_claim_token; a stale worker holding an old token
-- can never affect a claim it no longer holds — its calls simply match
-- zero rows and return false/no-row, harmlessly.
--
-- This still does not, and cannot, provide exactly-once email delivery
-- across a crash between a successful Resend call and this database
-- recording that success — no design can, without Resend itself being
-- transactionally joined to this database. What it does provide: a
-- provider failure can never mark a proposal 'sent'; two concurrent
-- ordinary attempts can never both hold the claim; a stale claim with
-- no evidence a send happened is safely auto-recoverable; a stale claim
-- WITH evidence a send may have happened is never auto-retried — it is
-- surfaced as a distinct outcome requiring reconciliation, not treated
-- the same as an ordinary stale claim. The application-side idempotency
-- key passed to Resend (src/lib/email/*, Phase 7 application code) is
-- what bounds the remaining duplicate-delivery risk in that gap — see
-- that code's own comments for why the claim token is deliberately NOT
-- reused as the provider idempotency key.

-- ---------------------------------------------------------------------
-- Columns: the send claim
-- ---------------------------------------------------------------------

alter table public.proposals
  add column if not exists email_send_status text not null default 'idle'
    check (email_send_status in ('idle', 'sending'));

alter table public.proposals
  add column if not exists email_send_claimed_at timestamptz;

alter table public.proposals
  add column if not exists email_send_claim_token uuid;

alter table public.proposals
  add column if not exists email_provider_message_id text;

alter table public.proposals
  add column if not exists email_send_last_error text;

-- Invariant: claimed_at and claim_token are both set exactly when a
-- send is in flight, both null otherwise. Note this says nothing about
-- email_provider_message_id, which is deliberately allowed to remain
-- set after a claim returns to idle via finalize_proposal_email_send()
-- below — it is kept as a permanent record of which Resend message
-- this proposal was actually delivered as, not part of the in-flight-
-- claim state machine.
do $$
begin
  alter table public.proposals
    add constraint proposals_email_send_claim_consistency_check
    check (
      (email_send_status = 'idle'
        and email_send_claimed_at is null
        and email_send_claim_token is null)
      or
      (email_send_status = 'sending'
        and email_send_claimed_at is not null
        and email_send_claim_token is not null)
    );
exception
  when duplicate_object then null;
end;
$$;

comment on column public.proposals.email_send_claim_token is
  'Unguessable per-attempt identity for the current email-send claim, minted server-side (gen_random_uuid()) only inside begin_proposal_email_send(). Every subsequent mutation belonging to that attempt (record_proposal_email_provider_id, release_proposal_email_send, finalize_proposal_email_send) requires this exact token, so a stalled worker that resumes after its claim was reclaimed by a newer attempt can never mutate that newer attempt''s state — its calls simply match zero rows.';

comment on column public.proposals.email_send_status is
  'idle | sending. Mutated only by begin_proposal_email_send()/release_proposal_email_send()/finalize_proposal_email_send() below — authenticated has no direct UPDATE on this table (see 20260910104450_proposals.sql''s "Table privileges" section, unchanged by this migration).';

comment on column public.proposals.email_provider_message_id is
  'Resend''s own id for the dispatched email, written by record_proposal_email_provider_id() immediately after Resend accepts the request. Persists after finalize_proposal_email_send() succeeds — kept permanently as delivery history, not cleared as part of the claim state machine. A stale claim (status=''sending'' past the 120s TTL) that already has this set is NOT auto-reclaimed by begin_proposal_email_send() — see that function''s comment.';

comment on column public.proposals.email_send_last_error is
  'Last send failure''s safe, app-generated message only (src/lib/email/*, Phase 7) — application code must never write a raw provider exception, stack trace, or credential here. Truncated to 500 chars by release_proposal_email_send() as defense in depth.';

create index if not exists proposals_stale_email_sends_idx
  on public.proposals (email_send_claimed_at)
  where email_send_status = 'sending';

-- ---------------------------------------------------------------------
-- begin_proposal_email_send: atomic claim acquisition
-- ---------------------------------------------------------------------
--
-- Returns exactly one row, always (never zero rows, never an error for
-- an ordinary "can't claim right now" outcome — only raises on an
-- authorization problem). Three possible outcomes:
--
--   (true,  <new token>, false) — claim acquired. Proceed to call the
--     email provider using this token.
--   (false, null,        false) — not claimable: either not a draft
--     proposal you own, or another attempt currently holds a
--     non-stale claim. Ordinary "try again shortly" outcome.
--   (false, null,        true)  — a stale claim exists AND it already
--     has an email_provider_message_id recorded — i.e. a previous
--     attempt's Resend call very likely succeeded before that attempt
--     stalled or crashed. Deliberately NOT auto-reclaimed: doing so
--     would let this call itself send a second, possibly-duplicate
--     email. The caller must surface this as "may already be sent —
--     needs manual check" rather than silently retrying.
--
-- The claim TTL (120 seconds) is a fixed constant, not a caller-
-- supplied parameter — nothing in Phase 7 needs it configurable per
-- call, and hardcoding it removes one piece of otherwise-pointless
-- caller-controllable surface.
--
-- SELECT ... FOR UPDATE locks the row for the remainder of this
-- function's single transaction (PostgREST runs each RPC call as one
-- transaction), so the staleness/reconciliation decision and the
-- follow-up UPDATE are consistent under concurrency: a second, truly-
-- concurrent begin_proposal_email_send() call for the same proposal
-- blocks on this lock until the first call's transaction commits, then
-- reads the freshly-committed row — never a stale snapshot. Reclaiming
-- a stale claim (the safe branch) always mints a brand-new token and
-- clears email_provider_message_id/email_send_last_error for the new
-- attempt, so a fresh attempt starts with a clean slate.

create or replace function public.begin_proposal_email_send(
  p_proposal_id uuid
)
returns table (
  claimed boolean,
  claim_token uuid,
  reconciliation_required boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_business_id uuid;
  v_new_token uuid;
  v_row record;
  c_claim_ttl_seconds constant integer := 120;
begin
  v_caller_business_id := public.current_business_id();

  if v_caller_business_id is null then
    raise exception 'Not authorized.';
  end if;

  select p.email_send_status, p.email_send_claimed_at, p.email_provider_message_id, p.status
    into v_row
  from public.proposals p
  where p.id = p_proposal_id
    and p.business_id = v_caller_business_id
  for update;

  if not found or v_row.status <> 'draft' then
    return query select false, null::uuid, false;
    return;
  end if;

  if v_row.email_send_status = 'sending' then
    if v_row.email_send_claimed_at >= now() - make_interval(secs => c_claim_ttl_seconds) then
      -- Actively held by a non-stale attempt.
      return query select false, null::uuid, false;
      return;
    end if;

    if v_row.email_provider_message_id is not null then
      -- Stale, but a send may already have happened. Refuse automatic
      -- reclamation — see function comment above.
      return query select false, null::uuid, true;
      return;
    end if;
    -- else: stale, no evidence a send happened — safe to reclaim below.
  end if;

  v_new_token := gen_random_uuid();

  update public.proposals
  set email_send_status = 'sending',
      email_send_claimed_at = now(),
      email_send_claim_token = v_new_token,
      email_provider_message_id = null,
      email_send_last_error = null
  where id = p_proposal_id
    and business_id = v_caller_business_id;

  return query select true, v_new_token, false;
end;
$$;

revoke execute on function public.begin_proposal_email_send(uuid) from public;
grant execute on function public.begin_proposal_email_send(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- record_proposal_email_provider_id: durable proof a send was accepted
-- ---------------------------------------------------------------------
--
-- Requires the exact current claim token. A stale worker holding an
-- old token (because its claim was reclaimed while it was stalled)
-- matches zero rows here and gets false, not a mutation of the newer
-- attempt's state.

create or replace function public.record_proposal_email_provider_id(
  p_proposal_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
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

  if p_claim_token is null then
    raise exception 'A claim token is required.';
  end if;

  if p_provider_message_id is null or btrim(p_provider_message_id) = '' then
    raise exception 'A provider message id is required.';
  end if;

  update public.proposals
  set email_provider_message_id = p_provider_message_id
  where id = p_proposal_id
    and business_id = v_caller_business_id
    and status = 'draft'
    and email_send_status = 'sending'
    and email_send_claim_token = p_claim_token
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke execute on function public.record_proposal_email_provider_id(uuid, uuid, text) from public;
grant execute on function public.record_proposal_email_provider_id(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- release_proposal_email_send: release a claim after a failed attempt
-- ---------------------------------------------------------------------
--
-- Same token requirement as above. Additionally refuses to release a
-- claim that already has an email_provider_message_id recorded — a
-- correctly-written caller never calls this after
-- record_proposal_email_provider_id() has succeeded for the same
-- attempt (it calls finalize_proposal_email_send() instead), so this
-- is defense in depth against an application bug, not a primary signal
-- path.

create or replace function public.release_proposal_email_send(
  p_proposal_id uuid,
  p_claim_token uuid,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_business_id uuid;
  v_released_id uuid;
begin
  v_caller_business_id := public.current_business_id();

  if v_caller_business_id is null then
    raise exception 'Not authorized.';
  end if;

  if p_claim_token is null then
    raise exception 'A claim token is required.';
  end if;

  update public.proposals
  set email_send_status = 'idle',
      email_send_claimed_at = null,
      email_send_claim_token = null,
      email_send_last_error = left(p_error, 500)
  where id = p_proposal_id
    and business_id = v_caller_business_id
    and status = 'draft'
    and email_send_status = 'sending'
    and email_send_claim_token = p_claim_token
    and email_provider_message_id is null
  returning id into v_released_id;

  return v_released_id is not null;
end;
$$;

revoke execute on function public.release_proposal_email_send(uuid, uuid, text) from public;
grant execute on function public.release_proposal_email_send(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- finalize_proposal_email_send: Phase 7's own atomic commit step
-- ---------------------------------------------------------------------
--
-- A dedicated Phase 7 RPC, deliberately separate from Phase 6's
-- mark_proposal_as_sent() — that function is left completely unchanged
-- by this migration (not redefined, not referenced). This is the only
-- place a proposal transitions to 'sent' as a result of the email
-- flow, and it requires every one of: business ownership, status =
-- 'draft', a currently-held claim matching the given token, AND a
-- recorded provider message id — so it can never finalize a claim that
-- never actually got a provider success recorded.

create or replace function public.finalize_proposal_email_send(
  p_proposal_id uuid,
  p_claim_token uuid
)
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

  if p_claim_token is null then
    raise exception 'A claim token is required.';
  end if;

  update public.proposals
  set status = 'sent',
      sent_at = now(),
      email_send_status = 'idle',
      email_send_claimed_at = null,
      email_send_claim_token = null
  where id = p_proposal_id
    and business_id = v_caller_business_id
    and status = 'draft'
    and email_send_status = 'sending'
    and email_send_claim_token = p_claim_token
    and email_provider_message_id is not null
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

revoke execute on function public.finalize_proposal_email_send(uuid, uuid) from public;
grant execute on function public.finalize_proposal_email_send(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Table privileges: no changes needed, stated for the record
-- ---------------------------------------------------------------------
--
-- 20260910104450_proposals.sql already revokes all privileges on
-- public.proposals from anon and authenticated, then grants
-- authenticated select only, table-level — which automatically covers
-- every column added above, including email_send_claim_token.
-- authenticated can SELECT its own business's claim state (business-
-- scoped by existing RLS, unchanged) and cannot UPDATE/INSERT/DELETE it
-- directly — only through the four SECURITY DEFINER functions above,
-- all of which independently re-verify business_id ownership and, for
-- the three claim-mutating ones, the exact current token.
