"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generatePublicToken } from "@/lib/proposals/token";
import type { Estimate, EstimateLineItem } from "@/lib/estimates/types";

const LIST_PATH = "/dashboard/proposals";

/**
 * Creates a customer-facing proposal snapshot from an estimate.
 *
 * Everything copied here is customer-safe by construction: title,
 * description, customer_id, final_selling_price, and each line item's
 * description/quantity. unit_cost, the four cost subtotals, markup,
 * minimum_job_price, and internal_notes are never read out of the
 * estimate at all in this function — there's no variable holding them
 * to accidentally pass through, not just a field left off an object
 * literal.
 *
 * Uses the regular RLS-scoped client throughout (never the admin
 * client) — every read and write here is subject to the caller's own
 * business_id, exactly like every other authenticated Server Action in
 * this app.
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

  // RLS means an estimate belonging to another business simply isn't
  // visible here — this redirect covers both "doesn't exist" and
  // "not yours" without distinguishing between them.
  const { data: estimate } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .single<Estimate>();

  if (!estimate) {
    redirect(
      `${LIST_PATH}?error=${encodeURIComponent("Estimate not found.")}`,
    );
  }

  if (estimate.final_selling_price == null) {
    redirect(
      `${estimatePath}?error=${encodeURIComponent(
        "Set a final selling price before creating a proposal.",
      )}`,
    );
  }

  // One proposal per estimate: check first so a contractor double-
  // clicking "Create proposal" lands on the existing proposal instead
  // of hitting the unique-constraint violation this would otherwise be
  // — the constraint itself (proposals.estimate_id is unique) is the
  // real backstop, this check just makes the common case a clean
  // redirect instead of a raw database error.
  const { data: existingProposal } = await supabase
    .from("proposals")
    .select("id")
    .eq("estimate_id", estimateId)
    .maybeSingle<{ id: string }>();

  if (existingProposal) {
    redirect(`${LIST_PATH}/${existingProposal.id}`);
  }

  const { data: lineItems } = await supabase
    .from("estimate_line_items")
    .select("description, quantity")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: true })
    .returns<Pick<EstimateLineItem, "description" | "quantity">[]>();

  // business_id is not set explicitly — it defaults to the caller's own
  // business (see the proposals migration), and RLS's with-check
  // rejects the insert outright if that were ever not the case.
  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      estimate_id: estimateId,
      customer_id: estimate.customer_id,
      public_token: generatePublicToken(),
      title: estimate.title,
      description: estimate.description,
      final_selling_price: estimate.final_selling_price,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !proposal) {
    redirect(
      `${estimatePath}?error=${encodeURIComponent(
        error?.message ?? "Could not create proposal.",
      )}`,
    );
  }

  if (lineItems && lineItems.length > 0) {
    const { error: lineItemsError } = await supabase
      .from("proposal_line_items")
      .insert(
        lineItems.map((item, index) => ({
          proposal_id: proposal.id,
          description: item.description,
          quantity: item.quantity,
          sort_order: index,
        })),
      );

    if (lineItemsError) {
      // Don't leave a proposal with no line items lying around — clean
      // up and surface a clear error rather than a silently incomplete
      // proposal.
      await supabase.from("proposals").delete().eq("id", proposal.id);
      redirect(
        `${estimatePath}?error=${encodeURIComponent(
          "Could not create proposal: " + lineItemsError.message,
        )}`,
      );
    }
  }

  revalidatePath(LIST_PATH);
  revalidatePath(estimatePath);
  redirect(`${LIST_PATH}/${proposal.id}`);
}

/**
 * Marks a proposal as sent — the only status transition a contractor
 * triggers directly (the customer-facing accept/decline transitions
 * live in src/lib/proposals/public-actions.ts). No email/SMS is sent by
 * this phase; it only records that the contractor has shared the link.
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

  // RLS scopes this to the caller's own business, same as every other
  // update in this app.
  const { error } = await supabase
    .from("proposals")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "draft");

  if (error) {
    redirect(`${proposalPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(proposalPath);
  redirect(proposalPath);
}
