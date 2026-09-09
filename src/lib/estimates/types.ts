export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";
export type LineItemCategory = "labor" | "materials" | "equipment" | "other";
export type MarkupType = "percent" | "amount";

export const ESTIMATE_STATUSES: EstimateStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
];

export const LINE_ITEM_CATEGORIES: LineItemCategory[] = [
  "labor",
  "materials",
  "equipment",
  "other",
];

export const LINE_ITEM_CATEGORY_LABELS: Record<LineItemCategory, string> = {
  labor: "Labor",
  materials: "Materials",
  equipment: "Equipment",
  other: "Other expenses",
};

export type Estimate = {
  id: string;
  business_id: string;
  customer_id: string | null;
  title: string;
  status: EstimateStatus;
  description: string | null;
  internal_notes: string | null;
  labor_subtotal: number;
  materials_subtotal: number;
  equipment_subtotal: number;
  other_expenses_subtotal: number;
  markup_type: MarkupType;
  markup_value: number;
  minimum_job_price: number | null;
  final_selling_price: number | null;
  created_at: string;
  updated_at: string;
};

export type EstimateLineItem = {
  id: string;
  estimate_id: string;
  business_id: string;
  category: LineItemCategory;
  description: string;
  quantity: number;
  unit_cost: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SubtotalFields = Pick<
  Estimate,
  | "labor_subtotal"
  | "materials_subtotal"
  | "equipment_subtotal"
  | "other_expenses_subtotal"
>;

/** Sum of the four category subtotals — the estimate's total cost, before markup. */
export function estimateCostSubtotal(estimate: SubtotalFields): number {
  return (
    estimate.labor_subtotal +
    estimate.materials_subtotal +
    estimate.equipment_subtotal +
    estimate.other_expenses_subtotal
  );
}

/** The markup as a dollar amount, given the pre-markup cost subtotal. */
export function estimateMarkupAmount(
  estimate: Pick<Estimate, "markup_type" | "markup_value">,
  costSubtotal: number,
): number {
  return estimate.markup_type === "percent"
    ? costSubtotal * (estimate.markup_value / 100)
    : estimate.markup_value;
}

/** Cost subtotal + markup — the system's suggested selling price. */
export function estimateSuggestedPrice(
  estimate: SubtotalFields & Pick<Estimate, "markup_type" | "markup_value">,
): number {
  const costSubtotal = estimateCostSubtotal(estimate);
  return costSubtotal + estimateMarkupAmount(estimate, costSubtotal);
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};
