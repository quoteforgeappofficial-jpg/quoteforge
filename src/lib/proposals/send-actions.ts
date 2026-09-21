"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmailProvider, EmailDeliveryError } from "@/lib/email/provider";
import { siteUrl } from "@/lib/site-url";

const LIST_PATH = "/dashboard/proposals";

const emailSchema = z.string().email();

type SendProposalRow = {
  id: string;
  status: string;
  title: string;
  public_token: string;
  business: { name: string } | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
};

/**
 * Sends a Draft proposal to its customer by email and, only on
 * confirmed delivery, transitions it to Sent. This is the Phase 7
 * replacement for the Draft proposal page's primary action (previously
 * markProposalAsSent, which just flipped status with no email — see
 * that function's own comments in src/lib/proposals/actions.ts, still
 * present and unchanged, just no longer the button this page calls).
 *
 * Uses the regular RLS-scoped client throughout — never the admin/
 * service-role client. The contractor already has a session; RLS
 * (business_id = current_business_id()) is what makes step 2 below
 * return nothing for a proposal that isn't this business's, exactly
 * like every other authenticated read in this app. No client-supplied
 * proposal id is ever trusted beyond "which row to look up" — the
 * four Phase 7 RPCs below independently re-derive the caller's
 * business and re-check ownership themselves regardless.
 *
 * Sequence (see supabase/migrations/20260918090000_
 * proposal_email_send_claims.sql for the full design rationale):
 *   1. auth check
 *   2. RLS-scoped read (proposal + business name + customer name/email)
 *   3. draft-status validation
 *   4. customer email validation
 *   5. provider configuration check
 *   6. (all of the above can fail with zero DB claim ever taken)
 *   7. begin_proposal_email_send — acquire the claim
 *   8. call the email provider
 *   9. record_proposal_email_provider_id
 *  10. finalize_proposal_email_send
 *
 * A provider failure (step 8 throws) releases the claim and leaves the
 * proposal in Draft — it is never marked Sent on a failed send. A
 * failure recording the provider id or finalizing (steps 9/10, after
 * the email has already been dispatched) deliberately does NOT release
 * the claim and does NOT retry automatically — see the inline comments
 * at each step for why, and the migration's own comments for the full
 * crash/duplicate-delivery analysis.
 */
export async function sendProposalEmail(proposalId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const proposalPath = `${LIST_PATH}/${proposalId}`;

  const fail = (message: string): never => {
    redirect(`${proposalPath}?error=${encodeURIComponent(message)}`);
  };

  // Step 2: RLS-scoped read. A cross-business or nonexistent id simply
  // returns no row here — indistinguishable, same as every other
  // proposal read in this app.
  const { data: proposal } = await supabase
    .from("proposals")
    .select(
      "id, status, title, public_token, business:businesses(name), customer:customers(first_name, last_name, email)",
    )
    .eq("id", proposalId)
    .single<SendProposalRow>();

  if (!proposal) {
    return fail("Proposal not found.");
  }

  // Step 3.
  if (proposal.status !== "draft") {
    return fail("This proposal is no longer in draft status.");
  }

  // Step 4. customers.email has no DB-level format constraint (see
  // the Phase 3 migration) — this is the app-level gate before any
  // claim/provider call happens.
  const emailResult = emailSchema.safeParse(proposal.customer?.email ?? "");
  if (!emailResult.success) {
    return fail(
      "This customer doesn't have a usable email address. Add one on the customer's page first.",
    );
  }
  const customerEmail = emailResult.data;

  // Step 5. Checked before acquiring any claim — no point locking the
  // proposal for a send that can't happen anyway.
  const provider = getEmailProvider();
  if (!provider) {
    console.error(
      "Proposal email: sendProposalEmail called but no provider is configured (RESEND_API_KEY/PROPOSAL_EMAIL_FROM unset).",
    );
    return fail("Email delivery isn't available right now. Please try again later.");
  }

  const businessName = proposal.business?.name ?? "Your contractor";
  const customerName = proposal.customer
    ? `${proposal.customer.first_name} ${proposal.customer.last_name}`.trim()
    : "";
  const proposalUrl = `${siteUrl()}/p/${proposal.public_token}`;
  // Stable and proposal-scoped, NOT the database claim token — see
  // src/lib/email/resend-provider.ts's send call and the migration's
  // top comment. A proposal's content never changes after creation
  // (Phase 6 snapshot model), so the same key correctly identifies
  // "the one email for this proposal" across every retry, however
  // many times the DB claim itself is reclaimed with a fresh token in
  // between.
  const idempotencyKey = `proposal-send:${proposal.id}`;

  // Step 7: acquire the claim. Everything above this line can fail
  // without ever taking a claim on the row.
  const { data: claimRows, error: claimError } = await supabase.rpc(
    "begin_proposal_email_send",
    { p_proposal_id: proposalId },
  );

  if (claimError) {
    console.error("Proposal email: begin_proposal_email_send failed", claimError.message);
    return fail("Something went wrong starting the send. Please try again.");
  }

  const claim = claimRows?.[0];

  if (!claim || !claim.claimed || !claim.claim_token) {
    if (claim?.reconciliation_required) {
      return fail(
        "This proposal may already have been sent — please check its status before sending again.",
      );
    }
    return fail("A send is already in progress for this proposal. Please try again shortly.");
  }

  const claimToken = claim.claim_token;

  // Step 8: call the provider. Failure here releases the claim — the
  // proposal stays Draft, matching the requirement that a provider
  // failure must never mark a proposal Sent.
  let providerMessageId: string;
  try {
    const result = await provider.sendProposalEmail({
      businessName,
      customerName,
      customerEmail,
      proposalTitle: proposal.title,
      proposalUrl,
      idempotencyKey,
    });
    providerMessageId = result.providerMessageId;
  } catch (error) {
    const message =
      error instanceof EmailDeliveryError
        ? error.message
        : "Something went wrong sending this proposal. Please try again.";

    if (!(error instanceof EmailDeliveryError)) {
      console.error("Proposal email: unexpected error calling provider", error);
    }

    await supabase.rpc("release_proposal_email_send", {
      p_proposal_id: proposalId,
      p_claim_token: claimToken,
      p_error: message,
    });

    return fail(message);
  }

  // Step 9: durably record the provider's message id BEFORE finalizing
  // — this is the anchor that lets a later begin_proposal_email_send()
  // call recognize "a send already happened here" if the process dies
  // between this step and the next one, rather than risking an
  // automatic duplicate send. If this call itself fails, do NOT
  // release the claim (a real email was just sent) and do NOT retry
  // automatically — log for investigation and surface a generic error.
  // The claim will eventually go stale; because a provider message id
  // was never durably recorded in this specific failure branch, a
  // later begin_proposal_email_send() call will still treat it as an
  // ordinary (non-reconciliation) stale claim — this narrow gap is the
  // one crash window no database-only design can close, per the
  // migration's own comments.
  const { data: recorded, error: recordError } = await supabase.rpc(
    "record_proposal_email_provider_id",
    {
      p_proposal_id: proposalId,
      p_claim_token: claimToken,
      p_provider_message_id: providerMessageId,
    },
  );

  if (recordError || !recorded) {
    // proposalId only — never the claim token, never customer data, and
    // recordError.message is Resend/Postgres-generated text we don't
    // control, so it's deliberately not logged either.
    console.error(
      "Proposal email: record_proposal_email_provider_id did not confirm — investigate proposal",
      proposalId,
    );
    return fail(
      "Your proposal may have been sent, but we couldn't confirm it. Please check the proposal status before sending again.",
    );
  }

  // Step 10: finalize. Same non-release, non-retry posture as step 9
  // on failure — the provider id is now durably recorded, so a later
  // begin_proposal_email_send() call will correctly refuse to
  // auto-reclaim and resend; this needs manual/reconciliation
  // attention, not a silent retry.
  const { data: finalized, error: finalizeError } = await supabase.rpc(
    "finalize_proposal_email_send",
    { p_proposal_id: proposalId, p_claim_token: claimToken },
  );

  if (finalizeError || !finalized) {
    // Same logging posture as above — proposalId only.
    console.error(
      "Proposal email: finalize_proposal_email_send did not confirm — investigate proposal",
      proposalId,
    );
    return fail(
      "Your proposal was sent, but we couldn't update its status. Please check the proposal status before sending again.",
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(proposalPath);
  redirect(proposalPath);
}
