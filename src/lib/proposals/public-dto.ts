import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/proposals/types";

/**
 * Exactly what the public /p/[token] page is allowed to render. This is
 * the entire customer-facing surface — if a field isn't here, the public
 * page cannot show it, full stop.
 *
 * Deliberately excludes (this is not an exhaustive list, it's the whole
 * point of the type): the proposal's own id, business_id, estimate_id,
 * customer_id, public_token as an internal identifier, internal cost/
 * markup/subtotal/minimum-price/profit fields (none of which exist on
 * this table or type at all — see the Phase 6 migration), internal
 * notes, and AI assumptions/questions (also not columns on this table).
 */
export type PublicProposal = {
  businessName: string;
  title: string;
  customerDisplayName: string | null;
  description: string | null;
  lineItems: PublicProposalLineItem[];
  finalSellingPrice: number;
  status: ProposalStatus;
  createdAt: string;
  sentAt: string | null;
};

export type PublicProposalLineItem = {
  description: string;
  quantity: number | null;
};

/**
 * The exact (and only) shape read from the database for a public
 * proposal view — matches the explicit column allowlist selected in
 * src/lib/proposals/public-data.ts. Deliberately NOT `Proposal` (the
 * full internal row type) or any wider/`Partial<>` type: widening this
 * type to accept more fields would make it easier for a future edit to
 * silently pass internal data through toPublicProposal below.
 */
export type RawPublicProposalRow = {
  title: string;
  description: string | null;
  status: string;
  final_selling_price: number;
  created_at: string;
  sent_at: string | null;
  business: { name: string } | null;
  customer: {
    first_name: string;
    last_name: string;
    company_name: string | null;
  } | null;
};

export type RawPublicProposalLineItem = {
  description: string;
  quantity: number | null;
};

function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as string[]).includes(value);
}

/**
 * Maps a raw (already narrowly-selected) database row to the public
 * DTO. Every field is read individually and by name — never `{ ...row }`
 * — so widening the raw row's selected columns in the future can never,
 * by itself, leak a new field to the public page; this function would
 * also need to be edited to actually expose it.
 */
export function toPublicProposal(
  row: RawPublicProposalRow,
  lineItems: RawPublicProposalLineItem[],
): PublicProposal {
  return {
    businessName: row.business?.name ?? "This business",
    title: row.title,
    customerDisplayName: row.customer
      ? `${row.customer.first_name} ${row.customer.last_name}`.trim()
      : null,
    description: row.description,
    lineItems: lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
    })),
    finalSellingPrice: row.final_selling_price,
    // Falls back to "draft" only in the (should-be-impossible, given the
    // DB check constraint) case of an unrecognized status value —
    // never lets an unexpected raw string reach the page.
    status: isProposalStatus(row.status) ? row.status : "draft",
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}
