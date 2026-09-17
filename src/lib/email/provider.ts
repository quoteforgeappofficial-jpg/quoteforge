import "server-only";
import { ResendEmailProvider } from "@/lib/email/resend-provider";

/**
 * Server-only email provider abstraction for proposal delivery.
 *
 * Mirrors src/lib/ai/provider.ts's shape deliberately: the rest of the
 * app (src/lib/proposals/send-actions.ts, and everything upstream of
 * it) depends only on EmailProvider — never on the Resend SDK directly
 * — so swapping providers later means writing a new class in a new
 * file and updating getEmailProvider() below, with no changes
 * anywhere else.
 *
 * The `server-only` import makes an accidental import of this module
 * from a Client Component fail at build time, before RESEND_API_KEY
 * could ever reach the browser bundle (same guard already used by
 * src/lib/supabase/admin.ts and src/lib/ai/provider.ts).
 */

/**
 * Exactly what a proposal email is allowed to be built from. This is
 * deliberately narrow and flat — no nested proposal/estimate/business
 * object is ever passed in, so there is no field here for internal
 * cost/markup/minimum-price/profit/notes/AI assumptions to ride along
 * on, even by accident. Whoever calls sendProposalEmail() is
 * responsible for having already reduced a full proposal row down to
 * exactly this shape (see src/lib/proposals/send-actions.ts).
 */
export type ProposalEmailInput = {
  businessName: string;
  customerName: string;
  customerEmail: string;
  proposalTitle: string;
  proposalUrl: string;
  /** Passed straight through to the provider as its own idempotency
   * key — see src/lib/email/resend-provider.ts and
   * src/lib/proposals/send-actions.ts for why this is a stable,
   * proposal-scoped key and deliberately NOT the database claim
   * token. */
  idempotencyKey: string;
};

export type ProposalEmailResult = {
  /** The provider's own id for the dispatched email — persisted via
   * record_proposal_email_provider_id() for diagnostics, never shown
   * to the customer, never treated as secret. */
  providerMessageId: string;
};

export interface EmailProvider {
  sendProposalEmail(input: ProposalEmailInput): Promise<ProposalEmailResult>;
}

/**
 * Safe-to-display/log error from the email-sending flow. `message` is
 * always written to be shown to the contractor as-is, or stored in
 * proposals.email_send_last_error — never a raw provider error,
 * stack trace, API key, or customer PII. `code` lets callers branch
 * without string-matching — same pattern as AiDraftError in
 * src/lib/ai/provider.ts.
 */
export class EmailDeliveryError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "invalid_recipient"
      | "rate_limited"
      | "provider_error"
      | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

/**
 * Returns the configured email provider, or null if proposal email
 * delivery isn't set up (no RESEND_API_KEY or no PROPOSAL_EMAIL_FROM).
 * Callers treat null as "feature unavailable" — never as a reason to
 * fall back to an unauthenticated or client-side call.
 */
export function getEmailProvider(): EmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PROPOSAL_EMAIL_FROM;

  if (!apiKey || !from) {
    return null;
  }

  return new ResendEmailProvider(apiKey, from);
}
