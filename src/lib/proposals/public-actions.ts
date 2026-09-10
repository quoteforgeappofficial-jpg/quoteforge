"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canRespondToProposal, type ProposalStatus } from "@/lib/proposals/types";

export type RespondToProposalResult = { ok: true } | { ok: false; error: string };

type Decision = "accept" | "decline";

/**
 * Records a customer's Accept/Decline response to a proposal. No
 * QuoteForge account or session is involved — this is called from the
 * public /p/[token] page — so the public_token is the only thing that
 * identifies which proposal to update, and every write below happens
 * here, server-side; the public page itself never talks to Supabase
 * directly.
 *
 * `decision` is a TypeScript union of exactly two literal values (never
 * a free-form string threaded through from client input), so there is
 * no code path by which this function could be made to write any
 * status value other than "accepted" or "declined".
 *
 * Uses the admin client for the same reason src/lib/proposals/
 * public-data.ts does: an anonymous visitor has no business_id for
 * RLS to scope against. The safety boundary here is entirely in this
 * function's own logic — the exact public_token match (practically
 * unguessable, see token.ts) plus the current-status check below, which
 * together mean a guessed/wrong token can never affect a real proposal,
 * and a proposal already responded to cannot be flipped again by
 * resubmitting the form.
 */
export async function respondToProposal(
  token: string,
  decision: Decision,
): Promise<RespondToProposalResult> {
  if (!token) {
    return { ok: false, error: "This proposal link is invalid." };
  }

  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from("proposals")
    .select("id, status")
    .eq("public_token", token)
    .single<{ id: string; status: string }>();

  if (!proposal) {
    return { ok: false, error: "This proposal link is no longer valid." };
  }

  // MVP simplification: both "sent" and "draft" may transition directly
  // to accepted/declined (see canRespondToProposal in lib/proposals/
  // types.ts). Requiring a contractor to explicitly mark a proposal
  // "sent" before the public link works would just add friction to
  // testing without adding real protection — the public_token is
  // already the entire access control for this page, whatever the
  // status. Once a proposal is accepted or declined, it's final: no
  // further transition is allowed from either of those states.
  if (!canRespondToProposal(proposal.status as ProposalStatus)) {
    return {
      ok: false,
      error: "This proposal has already been responded to.",
    };
  }

  const now = new Date().toISOString();
  const update =
    decision === "accept"
      ? { status: "accepted", accepted_at: now, declined_at: null }
      : { status: "declined", declined_at: now, accepted_at: null };

  const { error } = await admin
    .from("proposals")
    .update(update)
    .eq("id", proposal.id);

  if (error) {
    console.error("Proposal response: update failed", error);
    return {
      ok: false,
      error: "Something went wrong recording your response. Please try again.",
    };
  }

  revalidatePath(`/p/${token}`);
  return { ok: true };
}
