import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiEstimateDraftSchema, type AiEstimateDraft } from "@/lib/ai/schema";

/**
 * Server-only AI provider abstraction for estimate drafting.
 *
 * The rest of the app (the Server Action in
 * src/lib/estimates/ai-actions.ts, and everything upstream of it) depends
 * only on EstimateDraftProvider — never on the Anthropic SDK directly — so
 * swapping providers later means writing a new class here and updating
 * getEstimateDraftProvider() below, with no changes anywhere else.
 *
 * The `server-only` import makes an accidental import of this module from
 * a Client Component fail at build time, before ANTHROPIC_API_KEY could
 * ever reach the browser bundle (same guard already used by
 * src/lib/supabase/admin.ts).
 */

export interface EstimateDraftProvider {
  generateDraft(input: { description: string }): Promise<AiEstimateDraft>;
}

/**
 * Safe-to-display error from the drafting flow. `message` is always
 * written to be shown to the contractor as-is — never a raw provider
 * error, stack trace, or secret. `code` lets callers branch without
 * string-matching; see src/lib/estimates/ai-actions.ts.
 */
export class AiDraftError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "rate_limited"
      | "invalid_response"
      | "provider_error"
      | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "AiDraftError";
  }
}

// Where to change the model later: this is the only place it's named.
// claude-haiku-4-5 is Anthropic's current lowest-cost model and is more
// than capable for this task — structured extraction from a short job
// description, not open-ended reasoning. Bump to a more capable model
// (e.g. "claude-sonnet-5") here alone if draft quality ever needs it.
const MODEL_ID = "claude-haiku-4-5";

const MAX_OUTPUT_TOKENS = 2048;

const SYSTEM_PROMPT = `You are assisting a home-service contractor in drafting a written estimate from their plain-English description of a job.

Extract job structure only:
- Suggest a short, professional title for the job.
- Write a concise, customer-facing scope/description of the work.
- Break the job into line items, each in exactly one category: labor, materials, equipment, or other.
- Infer a quantity for a line item only when the contractor's wording reasonably supports it. Otherwise leave quantity null and set needsContractorInput to true.
- Only include work the contractor's description reasonably implies. Do not add extra tasks, upsells, or unrelated scope.

Never do the following, under any circumstances:
- Never invent, estimate, calculate, or suggest costs, prices, wages, material prices, rental prices, markup, margin, minimum price, final price, or profit.
- Never include any monetary amount anywhere in your response.
- Never choose or imply a final selling price.

Be honest about uncertainty:
- If you are unsure about a quantity, a unit, or whether an item is really needed, leave the relevant field null, set needsContractorInput to true, and briefly say why in that item's "note".
- Use "assumptions" for reasonable guesses you made while drafting. Use "questions" for things the contractor should clarify with the customer or decide before pricing the job.

Style:
- Keep the title and description concise and professional, written as if a customer will read them.
- Keep line item descriptions short — a few words to one short phrase.

Respond only with the structured data requested — no other commentary.`;

class AnthropicEstimateDraftProvider implements EstimateDraftProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateDraft(input: {
    description: string;
  }): Promise<AiEstimateDraft> {
    let response;

    try {
      response = await this.client.messages.parse({
        model: MODEL_ID,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Haiku 4.5 still supports explicit sampling params (later Claude
        // tiers don't) — temperature 0 keeps drafts low-variance for the
        // same input, which matters for a feature contractors will use
        // repeatedly on similar jobs.
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: input.description }],
        output_config: {
          format: zodOutputFormat(aiEstimateDraftSchema),
        },
      });
    } catch (error) {
      // Most-specific-first: NotFoundError/AuthenticationError/
      // PermissionDeniedError all indicate a setup problem (bad model id,
      // bad or missing key, no access), not something the contractor can
      // fix by retrying — logged for us, shown to them as "not configured".
      if (
        error instanceof Anthropic.NotFoundError ||
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      ) {
        console.error("AI drafting: provider configuration error", error);
        throw new AiDraftError(
          "not_configured",
          "AI drafting isn't available right now. Please fill in the estimate manually.",
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new AiDraftError(
          "rate_limited",
          "AI is busy right now. Please try again in a moment.",
        );
      }
      // APIConnectionError is a subclass of APIError in this SDK, so it
      // must be checked first — otherwise it'd never be reached below.
      if (error instanceof Anthropic.APIConnectionError) {
        throw new AiDraftError(
          "provider_error",
          "Couldn't reach the AI service. Please try again.",
        );
      }
      if (error instanceof Anthropic.APIError) {
        console.error(
          "AI drafting: Anthropic API error",
          error.status,
          error.message,
        );
        throw new AiDraftError(
          "provider_error",
          "The AI service had a problem. Please try again.",
        );
      }
      console.error("AI drafting: unexpected error", error);
      throw new AiDraftError(
        "unknown",
        "Something went wrong generating the draft. Please try again.",
      );
    }

    // parsed_output is null if the SDK couldn't validate the model's
    // response against aiEstimateDraftSchema — never trust or fall back
    // to unvalidated content here.
    if (!response.parsed_output) {
      throw new AiDraftError(
        "invalid_response",
        "AI couldn't produce a usable draft. Try rephrasing, or fill in the estimate manually.",
      );
    }

    return response.parsed_output;
  }
}

/**
 * Returns the configured drafting provider, or null if AI drafting isn't
 * set up (no ANTHROPIC_API_KEY). Callers treat null as "feature
 * unavailable" — never as a reason to fall back to unauthenticated or
 * client-side calls.
 */
export function getEstimateDraftProvider(): EstimateDraftProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new AnthropicEstimateDraftProvider(apiKey);
}
