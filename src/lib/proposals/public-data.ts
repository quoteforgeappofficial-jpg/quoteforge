import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  toPublicProposal,
  type PublicProposal,
  type RawPublicProposalRow,
  type RawPublicProposalLineItem,
} from "@/lib/proposals/public-dto";

/**
 * Looks up a proposal by its public token for the public /p/[token]
 * page, and only that page — this is the one place in the app allowed
 * to read a proposal without an authenticated business session.
 *
 * Deliberately uses the service-role admin client (src/lib/supabase/
 * admin.ts), not the cookie-based RLS client: an anonymous visitor has
 * no session and no business_id, so proposals' normal business-scoped
 * RLS policy would simply never match for them — the admin client is
 * what makes a lookup by token possible at all. Because that bypasses
 * RLS entirely, this query is the actual security boundary, which is
 * why it:
 *   - selects an explicit, hard-coded column list — never `select("*")`
 *     — plus only the internal `id` needed server-side to look up this
 *     proposal's line items (never returned to the page: toPublicProposal
 *     below reads its input by field name, so an extra `id` property on
 *     the row object is simply never touched),
 *   - is filtered to a single row by an exact public_token match (the
 *     token itself carries 192 bits of randomness — see token.ts),
 *   - immediately maps the result through toPublicProposal(), before
 *     returning anything to the page.
 *
 * `import "server-only"` makes an accidental import of this module from
 * a Client Component fail at build time, before the service-role key
 * could ever reach the browser bundle — same guard already used by
 * admin.ts itself and by src/lib/ai/provider.ts.
 */
export async function getPublicProposalByToken(
  token: string,
): Promise<PublicProposal | null> {
  if (!token) {
    return null;
  }

  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from("proposals")
    .select(
      "id, title, description, status, final_selling_price, created_at, sent_at, business:businesses(name), customer:customers(first_name, last_name, company_name)",
    )
    .eq("public_token", token)
    .single<RawPublicProposalRow & { id: string }>();

  if (!proposal) {
    return null;
  }

  const { data: lineItems } = await admin
    .from("proposal_line_items")
    .select("description, quantity")
    .eq("proposal_id", proposal.id)
    .order("sort_order", { ascending: true })
    .returns<RawPublicProposalLineItem[]>();

  return toPublicProposal(proposal, lineItems ?? []);
}
