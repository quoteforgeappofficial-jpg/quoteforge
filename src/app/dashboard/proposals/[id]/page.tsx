import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markProposalAsSent } from "@/lib/proposals/actions";
import { ProposalStatusBadge } from "@/components/proposals/status-badge";
import { CopyLinkButton } from "@/components/proposals/copy-link-button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { siteUrl } from "@/lib/site-url";
import {
  formatCurrency,
  type Proposal,
  type ProposalLineItem,
} from "@/lib/proposals/types";

type ProposalWithCustomer = Proposal & {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    company_name: string | null;
  } | null;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : null;
}

export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  const [{ data: proposal }, { data: lineItems }] = await Promise.all([
    supabase
      .from("proposals")
      .select("*, customer:customers(id, first_name, last_name, company_name)")
      .eq("id", id)
      .single<ProposalWithCustomer>(),
    supabase
      .from("proposal_line_items")
      .select("*")
      .eq("proposal_id", id)
      .order("sort_order", { ascending: true })
      .returns<ProposalLineItem[]>(),
  ]);

  // RLS means a proposal belonging to another business simply doesn't
  // come back here — indistinguishable from a nonexistent id.
  if (!proposal) {
    notFound();
  }

  const publicUrl = `${siteUrl()}/p/${proposal.public_token}`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/proposals"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Proposals
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {proposal.title}
            </h1>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          {proposal.customer && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              For{" "}
              <Link
                href={`/dashboard/customers/${proposal.customer.id}`}
                className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950 dark:decoration-zinc-700 dark:hover:decoration-zinc-50"
              >
                {proposal.customer.first_name} {proposal.customer.last_name}
              </Link>
            </p>
          )}
        </div>
        {proposal.status === "draft" && (
          <form action={markProposalAsSent.bind(null, proposal.id)}>
            <SubmitButton>Mark as sent</SubmitButton>
          </form>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
          Public link
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={publicUrl}
            onFocus={(event) => event.target.select()}
            className="block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <CopyLinkButton url={publicUrl} />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Anyone with this link can view the proposal and respond — no
          QuoteForge account required. Share it directly with the customer.
        </p>
      </div>

      {proposal.description && (
        <div className="mt-8">
          <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Scope / description
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-950 dark:text-zinc-50">
            {proposal.description}
          </p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Line items
        </h2>
        {!lineItems || lineItems.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-600">
            No line items on this proposal.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {lineItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-3 py-2"
              >
                <span className="text-zinc-950 dark:text-zinc-50">
                  {item.description}
                </span>
                {item.quantity != null && (
                  <span className="shrink-0 text-zinc-500 dark:text-zinc-500">
                    Qty {item.quantity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 space-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex items-center justify-between text-base font-semibold">
          <span className="text-zinc-950 dark:text-zinc-50">Final selling price</span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {formatCurrency(proposal.final_selling_price)}
          </span>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Created
          </dt>
          <dd className="mt-1 text-zinc-950 dark:text-zinc-50">
            {formatDate(proposal.created_at)}
          </dd>
        </div>
        {proposal.sent_at && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
              Sent
            </dt>
            <dd className="mt-1 text-zinc-950 dark:text-zinc-50">
              {formatDate(proposal.sent_at)}
            </dd>
          </div>
        )}
        {proposal.accepted_at && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
              Accepted
            </dt>
            <dd className="mt-1 text-zinc-950 dark:text-zinc-50">
              {formatDate(proposal.accepted_at)}
            </dd>
          </div>
        )}
        {proposal.declined_at && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
              Declined
            </dt>
            <dd className="mt-1 text-zinc-950 dark:text-zinc-50">
              {formatDate(proposal.declined_at)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
