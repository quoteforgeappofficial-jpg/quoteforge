import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/estimates/status-badge";
import { formatCurrency, type EstimateStatus } from "@/lib/estimates/types";

type EstimateListRow = {
  id: string;
  title: string;
  status: EstimateStatus;
  final_selling_price: number | null;
  created_at: string;
  customer: { first_name: string; last_name: string } | null;
};

export default async function EstimatesPage() {
  const supabase = await createClient();
  const { data: estimates, error } = await supabase
    .from("estimates")
    .select(
      "id, title, status, final_selling_price, created_at, customer:customers(first_name, last_name)",
    )
    .order("created_at", { ascending: false })
    .returns<EstimateListRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Estimates
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Draft and manage cost estimates for customers.
          </p>
        </div>
        <Link
          href="/dashboard/estimates/new"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          + New estimate
        </Link>
      </div>

      <div className="mt-8">
        {estimates.length === 0 ? (
          <EmptyState
            title="No estimates yet"
            description="Create your first estimate to start pricing out a job."
            action={{ href: "/dashboard/estimates/new", label: "New estimate" }}
          />
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {estimates.map((estimate) => (
              <li key={estimate.id}>
                <Link
                  href={`/dashboard/estimates/${estimate.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {estimate.title}
                      </p>
                      <StatusBadge status={estimate.status} />
                    </div>
                    {estimate.customer && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">
                        {estimate.customer.first_name} {estimate.customer.last_name}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    {estimate.final_selling_price != null
                      ? formatCurrency(estimate.final_selling_price)
                      : "No price set"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
