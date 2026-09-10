import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ProposalStatusBadge } from "@/components/proposals/status-badge";
import { formatCurrency } from "@/lib/proposals/types";
import type { ProposalStatus } from "@/lib/proposals/types";

type ProposalListRow = {
  id: string;
  title: string;
  status: ProposalStatus;
  final_selling_price: number;
  created_at: string;
  sent_at: string | null;
  customer: { first_name: string; last_name: string } | null;
};

export default async function ProposalsPage() {
  const supabase = await createClient();
  const { data: proposals, error } = await supabase
    .from("proposals")
    .select(
      "id, title, status, final_selling_price, created_at, sent_at, customer:customers(first_name, last_name)",
    )
    .order("created_at", { ascending: false })
    .returns<ProposalListRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Proposals
        </h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
          Turn estimates into proposals and track their status. Create one
          from an estimate&apos;s detail page.
        </p>
      </div>

      <div className="mt-8">
        {proposals.length === 0 ? (
          <EmptyState
            title="No proposals yet"
            description="Open an estimate with a final selling price and select “Create proposal” to send one to a customer."
            action={{ href: "/dashboard/estimates", label: "Go to estimates" }}
          />
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {proposals.map((proposal) => (
              <li key={proposal.id}>
                <Link
                  href={`/dashboard/proposals/${proposal.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {proposal.title}
                      </p>
                      <ProposalStatusBadge status={proposal.status} />
                    </div>
                    {proposal.customer && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-500">
                        {proposal.customer.first_name} {proposal.customer.last_name}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    <p>{formatCurrency(proposal.final_selling_price)}</p>
                    <p className="text-zinc-500 dark:text-zinc-500">
                      {proposal.sent_at
                        ? `Sent ${new Date(proposal.sent_at).toLocaleDateString()}`
                        : `Created ${new Date(proposal.created_at).toLocaleDateString()}`}
                    </p>
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
