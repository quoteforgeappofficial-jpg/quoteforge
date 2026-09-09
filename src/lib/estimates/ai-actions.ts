"use server";

import { createClient } from "@/lib/supabase/server";
import { getEstimateDraftProvider, AiDraftError } from "@/lib/ai/provider";
import { MAX_JOB_DESCRIPTION_LENGTH, type AiEstimateDraft } from "@/lib/ai/schema";

export type GenerateEstimateDraftResult =
  | { ok: true; draft: AiEstimateDraft }
  | { ok: false; error: string };

/**
 * Generates a structured estimate draft from a contractor's plain-English
 * job description. Called directly (not via a <form action>) from the
 * New Estimate page's client component — it returns data to populate the
 * form, it never writes to the database itself. The contractor still has
 * to review the draft and press "Create estimate" to save anything.
 */
export async function generateEstimateDraft(
  description: string,
): Promise<GenerateEstimateDraftResult> {
  // Require an authenticated QuoteForge user, same as every other
  // Server Action in this app — this one additionally guards a paid
  // third-party API call, so there's no scenario where skipping this
  // check would be acceptable.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to use AI drafting." };
  }

  const trimmed = description.trim();

  if (!trimmed) {
    return { ok: false, error: "Describe the job before generating a draft." };
  }

  if (trimmed.length > MAX_JOB_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Description is too long (max ${MAX_JOB_DESCRIPTION_LENGTH} characters).`,
    };
  }

  const provider = getEstimateDraftProvider();

  if (!provider) {
    console.error(
      "AI drafting: generateEstimateDraft called but no provider is configured (ANTHROPIC_API_KEY unset).",
    );
    return {
      ok: false,
      error: "AI drafting isn't available right now. Please fill in the estimate manually.",
    };
  }

  // Only the job description text is sent to the AI provider — no
  // customer data, no other estimates, no business data beyond what the
  // contractor just typed into this one field.
  try {
    const draft = await provider.generateDraft({ description: trimmed });
    return { ok: true, draft };
  } catch (error) {
    if (error instanceof AiDraftError) {
      return { ok: false, error: error.message };
    }
    console.error("AI drafting: unexpected error in generateEstimateDraft", error);
    return {
      ok: false,
      error: "Something went wrong generating the draft. Please try again or fill in the estimate manually.",
    };
  }
}
