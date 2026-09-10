export type ProposalStatus = "draft" | "sent" | "accepted" | "declined";

export const PROPOSAL_STATUSES: ProposalStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

/**
 * The full internal proposal row — contractor-side only. Never send this
 * type (or a row shaped like it) to the public /p/[token] page; use
 * PublicProposal from public-dto.ts there instead.
 */
export type Proposal = {
  id: string;
  business_id: string;
  estimate_id: string;
  customer_id: string | null;
  public_token: string;
  status: ProposalStatus;
  title: string;
  description: string | null;
  final_selling_price: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
};

export type ProposalLineItem = {
  id: string;
  proposal_id: string;
  business_id: string;
  description: string;
  quantity: number | null;
  sort_order: number;
  created_at: string;
};

/**
 * Whether a proposal currently in `status` may still be accepted or
 * declined by the customer. Used by the public page to decide whether
 * to show the Accept/Decline controls at all.
 *
 * Lifecycle: draft -> sent -> accepted OR declined. Only "sent" is
 * respondable — a "draft" proposal hasn't been shared yet, and
 * "accepted"/"declined" are terminal. The actual write path
 * (respondToProposal in public-actions.ts) enforces this same rule
 * directly in its database query (`.eq("status", "sent")`) rather than
 * calling this function, since that write needs to be one atomic
 * statement — see that file's own comments. This function exists so
 * the *display* logic doesn't have to duplicate the lifecycle rule.
 */
export function canRespondToProposal(status: ProposalStatus): boolean {
  return status === "sent";
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}
