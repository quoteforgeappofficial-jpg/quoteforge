import "server-only";
import { Resend } from "resend";
import {
  type EmailProvider,
  type ProposalEmailInput,
  type ProposalEmailResult,
  EmailDeliveryError,
} from "@/lib/email/provider";
import { buildProposalEmail } from "@/lib/email/proposal-email-template";

/**
 * Resend implementation of EmailProvider — the only file in the app
 * that imports the `resend` package. Constructed only from
 * getEmailProvider() (src/lib/email/provider.ts), which is the only
 * place RESEND_API_KEY/PROPOSAL_EMAIL_FROM are read.
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async sendProposalEmail(
    input: ProposalEmailInput,
  ): Promise<ProposalEmailResult> {
    const { subject, html, text } = buildProposalEmail(input);

    let response;

    try {
      response = await this.client.emails.send(
        {
          from: this.from,
          to: input.customerEmail,
          subject,
          html,
          text,
        },
        // idempotencyKey is the SDK's own documented mechanism (sent
        // as the Idempotency-Key HTTP header) for making a retried
        // request with the same key not trigger a second real send —
        // see src/lib/proposals/send-actions.ts for why this is a
        // stable, proposal-scoped key rather than the DB claim token.
        { idempotencyKey: input.idempotencyKey },
      );
    } catch {
      // A thrown error here means the request never got a structured
      // Resend response at all (network failure, DNS, timeout) — the
      // SDK's own API-level errors come back as `response.error`
      // below, not as a throw. Never log or surface the raw `error`
      // object itself — it may embed request/response internals
      // (headers, body) that could include the recipient's email
      // address or other request content.
      console.error(
        "Proposal email: network/transport error contacting provider",
      );
      throw new EmailDeliveryError(
        "provider_error",
        "Couldn't reach the email service. Please try again.",
      );
    }

    if (response.error) {
      // Most-specific-first, mirroring src/lib/ai/provider.ts's error
      // mapping style. Only response.error.name (a small fixed enum of
      // error codes) is ever logged — never `message`, which Resend
      // may echo request content (e.g. the rejected recipient address)
      // back into, and never the raw response/error object itself.
      const { name } = response.error;

      if (
        name === "missing_api_key" ||
        name === "restricted_api_key" ||
        name === "invalid_api_key" ||
        name === "invalid_from_address"
      ) {
        console.error("Proposal email: provider configuration error", name);
        throw new EmailDeliveryError(
          "not_configured",
          "Email delivery isn't available right now.",
        );
      }

      if (name === "validation_error" || name === "invalid_parameter") {
        console.error("Proposal email: recipient/parameter rejected", name);
        throw new EmailDeliveryError(
          "invalid_recipient",
          "The customer's email address couldn't be used. Please check it and try again.",
        );
      }

      if (
        name === "rate_limit_exceeded" ||
        name === "monthly_quota_exceeded" ||
        name === "daily_quota_exceeded"
      ) {
        throw new EmailDeliveryError(
          "rate_limited",
          "Email sending is busy right now. Please try again in a moment.",
        );
      }

      console.error("Proposal email: provider error", name);
      throw new EmailDeliveryError(
        "provider_error",
        "The email service had a problem sending this proposal. Please try again.",
      );
    }

    if (!response.data) {
      throw new EmailDeliveryError(
        "unknown",
        "Something went wrong sending this proposal. Please try again.",
      );
    }

    return { providerMessageId: response.data.id };
  }
}
