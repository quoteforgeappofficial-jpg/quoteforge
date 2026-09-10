"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPublicToken } from "@/lib/proposals/token";

export type RespondToProposalResult = { ok: true } | { ok: false; error: string };

type Decision = "accept" | "decline";

/**
 * One shared, generic failure message for every way this can fail:
 * malformed token, nonexistent token, or a token that exists but whose
 * proposal isn't currently in "sent" status (draft, already accepted,
 * or already declined). Deliberately not distinguished — see
 * isValidPublicToken()'s own docs on why malformed-vs-nonexistent must
 * never be told apart, and the same reasoning extends to
 * not-sent-vs-nonexistent for the same reason (both would otherwise let
 * a caller learn something about a token they don't actually hold).
 */
const UNAVAILABLE_MESSAGE =
  "This proposal is no longer available to respond to.";

function isDecision(value: unknown): value is Decision {
  return value === "accept" || value === "decline";
}

/**
 * Records a customer's Accept/Decline response to a proposal. No
 * QuoteForge account or session is involved — this is called from the
 * public /p/[token] page — so the public_token is the only thing that
 * identifies which proposal to update, and every write below happens
 * here, server-side; the public page itself never talks to Supabase
 * directly.
 *
 * Both parameters arrive through a public Server Action call, which
 * means TypeScript's parameter types (`string`, the `Decision` union)
 * provide no actual runtime guarantee — anyone can POST arbitrary JSON
 * to this action's endpoint directly, bypassing the client entirely.
 * Both are therefore validated at runtime, before touching Supabase:
 *   - `token` via isValidPublicToken() (exact shape check),
 *   - `decision` via isDecision(), rejecting anything except exactly
 *     "accept" or "decline" — there is no ternary here that would treat
 *     an unexpected value as one of the two on a false-y check.
 *
 * The actual status transition is one atomic UPDATE ... WHERE
 * public_token = ? AND status = 'sent' ... RETURNING, keyed only by the
 * token — not a separate SELECT-then-UPDATE. That closes the race where
 * two simultaneous responses (two tabs, or a resubmitted request) could
 * otherwise both read "sent" before either writes: at most one such
 * UPDATE can ever match and return a row, because the second one to
 * execute sees the first one's already-changed status in its own WHERE
 * clause. A guessed/wrong token, or a token whose proposal isn't
 * currently "sent", both simply match zero rows — same outcome, same
 * message, no way to distinguish them from the response.
 *
 * Uses the admin client for the same reason src/lib/proposals/
 * public-data.ts does: an anonymous visitor has no business_id for RLS
 * to key on. Only status and the matching timestamp field are ever
 * written; no other proposal column is reachable through this function,
 * and the proposal's internal id is never returned to the caller of
 * this action (it's used only for a rows-affected check, entirely
 * server-side).
 */
export async function respondToProposal(
  token: string,
  decision: unknown,
): Promise<RespondToProposalResult> {
  if (!isValidPublicToken(token)) {
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }

  if (!isDecision(decision)) {
    return { ok: false, error: "Invalid request." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const update =
    decision === "accept"
      ? { status: "accepted", accepted_at: now, declined_at: null }
      : { status: "declined", declined_at: now, accepted_at: null };

  const { data: updatedRows, error } = await admin
    .from("proposals")
    .update(update)
    .eq("public_token", token)
    .eq("status", "sent")
    .select("id");

  if (error) {
    console.error("Proposal response: update failed", error);
    return {
      ok: false,
      error: "Something went wrong recording your response. Please try again.",
    };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }

  revalidatePath(`/p/${token}`);
  return { ok: true };
}
