"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generatePublicToken } from "@/lib/proposals/token";

const LIST_PATH = "/dashboard/proposals";

/**
 * Creates a customer-facing proposal snapshot from an estimate.
 *
 * Delegates entirely to the create_proposal_from_estimate() SECURITY
 * DEFINER RPC (see the Phase 6 migration) — this function's job is just
 * to generate the public token (Node's crypto.randomBytes, the single
 * token generator — see token.ts) and translate the RPC's outcome into
 * a redirect. All authorization, the same-business check, the
 * final_selling_price requirement, the customer/business consistency
 * check, and the atomic snapshot of proposal + line items happen inside
 * the RPC, in one transaction.
 *
 * `authenticated` has no direct INSERT privilege on proposals or
 * proposal_line_items (see the migration's "Table privileges" section)
 * — this RPC is the only way to create either, whether called from here
 * or anywhere else.
 */
export async function createProposalFromEstimate(estimateId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const estimatePath = `/dashboard/estimates/${estimateId}`;

  const { data: proposalId, error } = await supabase.rpc(
    "create_proposal_from_estimate",
    {
      p_estimate_id: estimateId,
      p_public_token: generatePublicToken(),
    },
  );

  if (error || !proposalId) {
    redirect(
      `${estimatePath}?error=${encodeURIComponent(
        error?.message ?? "Could not create proposal.",
      )}`,
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(estimatePath);
  redirect(`${LIST_PATH}/${proposalId}`);
}

/**
 * Marks a proposal as sent — the only status transition a contractor
 * triggers directly (the customer-facing accept/decline transitions
 * live in src/lib/proposals/public-actions.ts, gated to sent-only). No
 * email/SMS is sent by this phase; it only records that the contractor
 * has shared the link.
 *
 * Delegates to the mark_proposal_as_sent() SECURITY DEFINER RPC, which
 * performs the draft -> sent transition as one atomic UPDATE ... WHERE
 * status = 'draft' ... RETURNING and reports back whether a row
 * actually transitioned. `authenticated` has no direct UPDATE privilege
 * on proposals (see the migration) — this RPC is the only way to set
 * status to 'sent'. Unlike the previous version of this function, a
 * proposal that's already past "draft" now produces a visible error
 * instead of a silent no-op success.
 */
export async function markProposalAsSent(proposalId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const proposalPath = `${LIST_PATH}/${proposalId}`;

  const { data: transitioned, error } = await supabase.rpc(
    "mark_proposal_as_sent",
    { p_proposal_id: proposalId },
  );

  if (error) {
    redirect(`${proposalPath}?error=${encodeURIComponent(error.message)}`);
  }

  if (!transitioned) {
    redirect(
      `${proposalPath}?error=${encodeURIComponent(
        "This proposal is no longer in draft status.",
      )}`,
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(proposalPath);
  redirect(proposalPath);
}
