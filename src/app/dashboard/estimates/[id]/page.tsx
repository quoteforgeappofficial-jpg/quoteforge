import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteEstimate } from "@/lib/estimates/actions";
import { createProposalFromEstimate } from "@/lib/proposals/actions";
import { DeleteEstimateButton } from "@/components/estimates/delete-estimate-button";
import { StatusBadge } from "@/components/estimates/status-badge";
import { FormMessage } from "@/components/ui/form-message";
import {
  LINE_ITEM_CATEGORIES,
  LINE_ITEM_CATEGORY_LABELS,
  estimateCostSubtotal,
  estimateMarkupAmount,
  estimateSuggestedPrice,
  formatCurrency,
  type Estimate,
  type EstimateLineItem,
} from "@/lib/estimates/types";

type EstimateWithCustomer = Estimate & {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    company_name: string | null;
  } | null;
};

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  const [{ data: estimate }, { data: lineItems }, { data: existingProposal }] =
    await Promise.all([
      supabase
        .from("estimates")
        .select("*, customer:customers(id, first_name, last_name, company_name)")
        .eq("id", id)
        .single<EstimateWithCustomer>(),
      supabase
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", id)
        .order("sort_order", { ascending: true })
        .returns<EstimateLineItem[]>(),
      supabase
        .from("proposals")
        .select("id")
        .eq("estimate_id", id)
        .maybeSingle<{ id: string }>(),
    ]);

  // RLS means an estimate belonging to another business simply doesn't
  // come back here — indistinguishable from a nonexistent id.
  if (!estimate) {
    notFound();
  }

  const itemsByCategory = LINE_ITEM_CATEGORIES.map((category) => ({
    category,
    items: (lineItems ?? []).filter((item) => item.category === category),
  }));

  const costSubtotal = estimateCostSubtotal(estimate);
  const markupAmount = estimateMarkupAmount(estimate, costSubtotal);
  const suggestedPrice = estimateSuggestedPrice(estimate);
  const belowMinimum =
    estimate.minimum_job_price != null &&
    estimate.final_selling_price != null &&
    estimate.final_selling_price < estimate.minimum_job_price;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/estimates"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Estimates
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {estimate.title}
            </h1>
            <StatusBadge status={estimate.status} />
          </div>
          {estimate.customer && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              For{" "}
              <Link
                href={`/dashboard/customers/${estimate.customer.id}`}
                className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950 dark:decoration-zinc-700 dark:hover:decoration-zinc-50"
              >
                {estimate.customer.first_name} {estimate.customer.last_name}
              </Link>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {existingProposal ? (
            <Link
              href={`/dashboard/proposals/${existingProposal.id}`}
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              View proposal
            </Link>
          ) : (
            <form action={createProposalFromEstimate.bind(null, estimate.id)}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                Create proposal
              </button>
            </form>
          )}
          <Link
            href={`/dashboard/estimates/${estimate.id}/edit`}
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Edit
          </Link>
          <form action={deleteEstimate.bind(null, estimate.id)}>
            <DeleteEstimateButton estimateTitle={estimate.title} />
          </form>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      {estimate.description && (
        <div className="mt-8">
          <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Scope / description
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-950 dark:text-zinc-50">
            {estimate.description}
          </p>
        </div>
      )}

      {estimate.internal_notes && (
        <div className="mt-6">
          <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Internal notes
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-950 dark:text-zinc-50">
            {estimate.internal_notes}
          </p>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {itemsByCategory.map(({ category, items }) => (
          <div key={category}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {LINE_ITEM_CATEGORY_LABELS[category]}
              </h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-500">
                {formatCurrency(
                  items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0),
                )}
              </span>
            </div>
            {items.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-600">
                No {LINE_ITEM_CATEGORY_LABELS[category].toLowerCase()} items.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 px-3 py-2"
                  >
                    <span className="text-zinc-950 dark:text-zinc-50">
                      {item.description}
                    </span>
                    <span className="shrink-0 text-zinc-500 dark:text-zinc-500">
                      {item.quantity} × {formatCurrency(item.unit_cost)} ={" "}
                      {formatCurrency(item.quantity * item.unit_cost)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">Cost subtotal</span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {formatCurrency(costSubtotal)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">
            Markup ({estimate.markup_type === "percent"
              ? `${estimate.markup_value}%`
              : formatCurrency(estimate.markup_value)}
            )
          </span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {formatCurrency(markupAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between font-medium">
          <span className="text-zinc-950 dark:text-zinc-50">Suggested price</span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {formatCurrency(suggestedPrice)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-2 dark:border-zinc-800">
          <span className="text-zinc-600 dark:text-zinc-400">Minimum job price</span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {estimate.minimum_job_price != null
              ? formatCurrency(estimate.minimum_job_price)
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-base font-semibold">
          <span className="text-zinc-950 dark:text-zinc-50">Final selling price</span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {estimate.final_selling_price != null
              ? formatCurrency(estimate.final_selling_price)
              : "—"}
          </span>
        </div>
        {belowMinimum && (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            Final selling price is below the minimum job price.
          </p>
        )}
      </div>
    </div>
  );
}
