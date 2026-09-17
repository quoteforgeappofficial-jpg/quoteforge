import "server-only";
import type { ProposalEmailInput } from "@/lib/email/provider";

/**
 * Builds the subject/html/text for a proposal-delivery email. A pure
 * function — no I/O, no DB access — that only ever reads the narrow
 * ProposalEmailInput shape (business name, customer name, proposal
 * title, public URL, idempotency key). There is no proposal/estimate/
 * business row available inside this function to pull an internal
 * cost, markup, minimum price, profit figure, internal note, or AI
 * assumption/question from, even by mistake — see
 * src/lib/email/provider.ts's ProposalEmailInput comment.
 *
 * All contractor/customer-controlled strings (businessName,
 * customerName, proposalTitle) are HTML-escaped before being
 * interpolated into the HTML body — none of them are validated for
 * shape beyond what Phase 3/6 already enforce (non-empty business
 * name, non-empty proposal title), so this function must not assume
 * they're free of HTML-meaningful characters.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildProposalEmail(
  input: Pick<
    ProposalEmailInput,
    "businessName" | "customerName" | "proposalTitle" | "proposalUrl"
  >,
): { subject: string; html: string; text: string } {
  const businessName = escapeHtml(input.businessName);
  const customerName = escapeHtml(input.customerName);
  const proposalTitle = escapeHtml(input.proposalTitle);
  // input.proposalUrl is always built server-side from siteUrl() + a
  // validated public_token (see src/lib/proposals/token.ts) — never
  // client-supplied — but it's still interpolated into an href
  // attribute, so it's HTML-escaped too as defense in depth rather
  // than trusted by provenance alone.
  const proposalUrl = escapeHtml(input.proposalUrl);

  const subject = `New proposal from ${input.businessName}: ${input.proposalTitle}`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 16px 0;font-size:13px;color:#71717a;">${businessName}</p>
                <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.4;color:#09090b;">${proposalTitle}</h1>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#3f3f46;">
                  Hi ${customerName || "there"}, ${businessName} has sent you a proposal. Please review it and let them know if you'd like to accept or decline.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:#09090b;">
                      <a href="${proposalUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View proposal</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  <a href="${proposalUrl}" style="color:#71717a;word-break:break-all;">${proposalUrl}</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#a1a1aa;">Sent via QuoteForge</p>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

  const text = `${input.businessName} has sent you a proposal: ${input.proposalTitle}

View and respond to it here:
${input.proposalUrl}

Sent via QuoteForge`;

  return { subject, html, text };
}
