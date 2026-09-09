import { z } from "zod";

/**
 * The AI output contract for estimate drafting (Phase 5).
 *
 * Deliberately excludes unit_cost, markup, minimum price, final price, and
 * profit entirely — there is no field here the model could set them
 * through, even if it ignored the system prompt's instructions not to.
 * Pricing stays 100% contractor-controlled; see src/lib/ai/provider.ts and
 * src/lib/estimates/ai-line-item-transform.ts for how that's enforced on
 * the way into the estimate form.
 *
 * z.object() without .strict() "strips" unrecognized keys rather than
 * rejecting the whole response — if the model ever added an extra field
 * despite instructions, it's silently dropped, not surfaced. That's the
 * behavior we want here: we only ever read through this validated shape,
 * so a stray extra key from the model is harmless either way.
 */

const LINE_ITEM_CATEGORY_VALUES = [
  "labor",
  "materials",
  "equipment",
  "other",
] as const;

export const aiEstimateLineItemSchema = z.object({
  category: z.enum(LINE_ITEM_CATEGORY_VALUES),
  description: z.string().trim().min(1).max(200),
  quantity: z.number().finite().nonnegative().nullable(),
  unit: z.string().trim().max(40).nullable(),
  needsContractorInput: z.boolean(),
  note: z.string().trim().max(300).nullable(),
});

export const aiEstimateDraftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  lineItems: z.array(aiEstimateLineItemSchema).max(40),
  assumptions: z.array(z.string().trim().max(300)).max(20),
  questions: z.array(z.string().trim().max(300)).max(20),
});

export type AiEstimateLineItem = z.infer<typeof aiEstimateLineItemSchema>;
export type AiEstimateDraft = z.infer<typeof aiEstimateDraftSchema>;

/** Hard cap on the job description sent to the AI — bounds cost/abuse and keeps the request small. */
export const MAX_JOB_DESCRIPTION_LENGTH = 2000;
