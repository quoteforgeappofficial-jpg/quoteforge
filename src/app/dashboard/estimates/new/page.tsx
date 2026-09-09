import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewEstimateForm } from "@/components/estimates/new-estimate-form";
import { FormMessage } from "@/components/ui/form-message";

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, first_name, last_name, company_name")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/estimates"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Estimates
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        New estimate
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Only a title is required — add line items and pricing now or come
        back to it later.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <NewEstimateForm customers={customers ?? []} />
    </div>
  );
}
