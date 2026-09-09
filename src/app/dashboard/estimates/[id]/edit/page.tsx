import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateEstimate } from "@/lib/estimates/actions";
import { EstimateForm } from "@/components/estimates/estimate-form";
import { FormMessage } from "@/components/ui/form-message";
import type { Estimate, EstimateLineItem } from "@/lib/estimates/types";

export default async function EditEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  const [{ data: estimate }, { data: lineItems }, { data: customers }] =
    await Promise.all([
      supabase.from("estimates").select("*").eq("id", id).single<Estimate>(),
      supabase
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", id)
        .order("sort_order", { ascending: true })
        .returns<EstimateLineItem[]>(),
      supabase
        .from("customers")
        .select("id, first_name, last_name, company_name")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
    ]);

  if (!estimate) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/dashboard/estimates/${estimate.id}`}
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← {estimate.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Edit estimate
      </h1>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <EstimateForm
        action={updateEstimate.bind(null, estimate.id)}
        defaultValues={estimate}
        initialLineItems={(lineItems ?? []).map((item) => ({
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
        }))}
        customers={customers ?? []}
        submitLabel="Save changes"
      />
    </div>
  );
}
