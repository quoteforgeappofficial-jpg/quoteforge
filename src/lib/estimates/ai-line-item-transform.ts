import type { AiEstimateLineItem } from "@/lib/ai/schema";
import type { LineItemCategory } from "@/lib/estimates/types";

/** A draft line item shaped exactly like the rows LineItemsAndPricingFields renders. */
export type DraftLineItemRow = {
  category: LineItemCategory;
  description: string;
  quantity: string;
  unitCost: string;
};

/**
 * Transforms one AI-suggested line item into the row shape the estimate
 * form's line-item editor uses.
 *
 * unitCost is always "0" — the AI schema (src/lib/ai/schema.ts) has no
 * unit_cost field at all, so there is nothing here for it to carry
 * through even if the model tried. That's what actually prevents AI
 * output from setting a price: there's no code path from "AI response"
 * to "unit_cost", not just a convention this function happens to follow.
 *
 * The AI schema's `unit`, `needsContractorInput`, and `note` are
 * drafting-only metadata with no column in estimate_line_items (see
 * Phase 5 migration note in docs/AI_ESTIMATE_DRAFTING.md for why no
 * migration was added). Rather than lose them, they're folded into the
 * row's description as short, visible, editable text — nothing about a
 * suggestion is hidden from the contractor, and nothing new needs to be
 * persisted or migrated to keep them.
 */
export function aiLineItemToDraftRow(
  item: AiEstimateLineItem,
): DraftLineItemRow {
  const parts = [item.description.trim()];

  const unit = item.unit?.trim();
  if (unit && !item.description.toLowerCase().includes(unit.toLowerCase())) {
    parts.push(`(${unit})`);
  }

  if (item.needsContractorInput) {
    parts.push("— confirm qty/details");
  }

  const note = item.note?.trim();
  if (note) {
    parts.push(`— ${note}`);
  }

  return {
    category: item.category,
    description: parts.join(" "),
    quantity: item.quantity != null ? String(item.quantity) : "1",
    unitCost: "0",
  };
}

export function aiLineItemsToDraftRows(
  items: AiEstimateLineItem[],
): DraftLineItemRow[] {
  return items.map(aiLineItemToDraftRow);
}
