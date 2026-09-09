"use client";

import { useRef, useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  LineItemsAndPricingFields,
  type LineItemsAndPricingFieldsHandle,
} from "@/components/estimates/line-items-and-pricing-fields";
import { createEstimate } from "@/lib/estimates/actions";
import { generateEstimateDraft } from "@/lib/estimates/ai-actions";
import { aiLineItemsToDraftRows } from "@/lib/estimates/ai-line-item-transform";
import { MAX_JOB_DESCRIPTION_LENGTH, type AiEstimateDraft } from "@/lib/ai/schema";
import { ESTIMATE_STATUSES, STATUS_LABELS } from "@/lib/estimates/types";

type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
};

/**
 * The New Estimate form, with AI-assisted drafting at the top.
 *
 * Kept as its own component (not a variant of the shared EstimateForm)
 * specifically so the Edit flow — EstimateForm, used unchanged — can
 * never be affected by anything here: no shared props, no shared state,
 * no risk to a flow that's already been manually tested.
 */
export function NewEstimateForm({ customers }: { customers: CustomerOption[] }) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const scopeDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const lineItemsRef = useRef<LineItemsAndPricingFieldsHandle>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  const [jobDescription, setJobDescription] = useState("");
  const [generationState, setGenerationState] = useState<"idle" | "loading">(
    "idle",
  );
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<AiEstimateDraft | null>(
    null,
  );
  const [draftNotes, setDraftNotes] = useState<{
    assumptions: string[];
    questions: string[];
  } | null>(null);

  function applyDraft(draft: AiEstimateDraft) {
    if (titleInputRef.current) {
      titleInputRef.current.value = draft.title;
    }
    if (scopeDescriptionRef.current) {
      scopeDescriptionRef.current.value = draft.description;
    }
    lineItemsRef.current?.replaceAllItems(
      aiLineItemsToDraftRows(draft.lineItems),
    );
    setDraftNotes({
      assumptions: draft.assumptions,
      questions: draft.questions,
    });
  }

  async function handleGenerate() {
    if (generationState === "loading") return; // guards against duplicate requests

    setGenerationState("loading");
    setGenerationError(null);

    const result = await generateEstimateDraft(jobDescription);

    setGenerationState("idle");

    if (!result.ok) {
      // Existing form data (title, description, line items, everything
      // else) is left exactly as it was — nothing here writes to any
      // field until a draft has actually been produced.
      setGenerationError(result.error);
      return;
    }

    const hasExistingContent =
      Boolean(titleInputRef.current?.value.trim()) ||
      Boolean(scopeDescriptionRef.current?.value.trim()) ||
      Boolean(lineItemsRef.current?.hasAnyItems());

    if (hasExistingContent) {
      setPendingDraft(result.draft);
      confirmDialogRef.current?.showModal();
    } else {
      applyDraft(result.draft);
    }
  }

  function handleConfirmReplace() {
    if (pendingDraft) {
      applyDraft(pendingDraft);
    }
    setPendingDraft(null);
    confirmDialogRef.current?.close();
  }

  function handleCancelReplace() {
    setPendingDraft(null);
    confirmDialogRef.current?.close();
  }

  return (
    <form action={createEstimate} className="mt-6 space-y-8">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Describe the job
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          AI suggests a title, scope, and line items from your description —
          it never sets costs, markup, or your selling price. Review and
          edit everything below before saving.
        </p>

        <textarea
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          maxLength={MAX_JOB_DESCRIPTION_LENGTH}
          rows={4}
          placeholder="e.g. Clean up an overgrown backyard, two workers for about six hours, haul away debris, probably need 30 bags and rent a trailer."
          className="mt-3 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {jobDescription.length}/{MAX_JOB_DESCRIPTION_LENGTH}
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              generationState === "loading" ||
              jobDescription.trim().length === 0
            }
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {generationState === "loading"
              ? "Generating…"
              : "Generate estimate draft"}
          </button>
        </div>

        {generationError && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300"
          >
            {generationError}
          </p>
        )}

        {draftNotes &&
          (draftNotes.assumptions.length > 0 ||
            draftNotes.questions.length > 0) && (
            <div className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
              <p className="font-medium text-amber-900 dark:text-amber-300">
                AI notes — for you only, not saved with the estimate
              </p>
              {draftNotes.assumptions.length > 0 && (
                <div>
                  <p className="text-xs font-medium tracking-wide text-amber-800 uppercase dark:text-amber-400">
                    Assumptions
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-900 dark:text-amber-300">
                    {draftNotes.assumptions.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {draftNotes.questions.length > 0 && (
                <div>
                  <p className="text-xs font-medium tracking-wide text-amber-800 uppercase dark:text-amber-400">
                    Questions to confirm
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-900 dark:text-amber-300">
                    {draftNotes.questions.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        <dialog
          ref={confirmDialogRef}
          className="rounded-lg border border-zinc-200 p-6 text-left shadow-lg backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="text-sm text-zinc-950 dark:text-zinc-50">
            Replace your current draft?
          </p>
          <p className="mt-2 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
            This will overwrite the title, scope, and line items you&apos;ve
            already entered. Status, customer, internal notes, and pricing
            are never touched.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelReplace}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmReplace}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Replace
            </button>
          </div>
        </dialog>
      </div>

      <div className="space-y-4">
        <TextField
          ref={titleInputRef}
          id="title"
          label="Title"
          type="text"
          placeholder="e.g. Backyard fence replacement"
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="status" label="Status" defaultValue="draft">
            {ESTIMATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>

          <SelectField id="customerId" label="Customer (optional)" defaultValue="">
            <option value="">No customer selected</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.first_name} {customer.last_name}
                {customer.company_name ? ` — ${customer.company_name}` : ""}
              </option>
            ))}
          </SelectField>
        </div>

        <TextareaField
          ref={scopeDescriptionRef}
          id="description"
          label="Scope / description (customer-facing)"
          placeholder="What the job includes…"
        />

        <TextareaField
          id="internalNotes"
          label="Internal notes (never shown to the customer)"
          placeholder="Access notes, supplier, anything just for you…"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Line items &amp; pricing
        </h2>
        <LineItemsAndPricingFields
          ref={lineItemsRef}
          initialItems={[]}
          initialMarkupType="percent"
          initialMarkupValue={0}
          initialMinimumJobPrice={null}
          initialFinalSellingPrice={null}
        />
      </div>

      <SubmitButton>Create estimate</SubmitButton>
    </form>
  );
}
