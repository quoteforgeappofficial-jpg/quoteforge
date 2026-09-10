import { notFound } from "next/navigation";
import { getPublicProposalByToken } from "@/lib/proposals/public-data";
import { ProposalResponseButtons } from "@/components/proposals/proposal-response-buttons";
import { canRespondToProposal, formatCurrency } from "@/lib/proposals/types";

/**
 * The public, no-login proposal page. Everything rendered here comes
 * from getPublicProposalByToken()'s PublicProposal DTO — never a raw
 * database row — so there is no field available to this page that isn't
 * already customer-safe. No dashboard layout, nav, or internal controls
 * are reachable from this route.
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const proposal = await getPublicProposalByToken(token);

  // Invalid or unknown token: a plain not-found page, identical to any
  // other bad URL — never reveals whether a business/customer exists.
  if (!proposal) {
    notFound();
  }

  const canRespond = canRespondToProposal(proposal.status);

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6">
      <div className="w-full max-w-lg">
        <p className="text-center text-sm font-medium text-zinc-500 dark:text-zinc-500">
          {proposal.businessName}
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {proposal.title}
            </h1>
            <ProposalStatusPill status={proposal.status} />
          </div>

          {proposal.customerDisplayName && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Prepared for {proposal.customerDisplayName}
            </p>
          )}

          {proposal.description && (
            <div className="mt-6">
              <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                Scope of work
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-950 dark:text-zinc-50">
                {proposal.description}
              </p>
            </div>
          )}

          {proposal.lineItems.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                What&apos;s included
              </h2>
              <ul className="mt-2 space-y-2">
                {proposal.lineItems.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start justify-between gap-4 text-sm"
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
            </div>
          )}

          <div className="mt-8 rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
              Total price
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {formatCurrency(proposal.finalSellingPrice)}
            </p>
          </div>

          <div className="mt-8">
            {proposal.status === "accepted" ? (
              <p className="rounded-md bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                You&apos;ve accepted this proposal. Thank you!
              </p>
            ) : proposal.status === "declined" ? (
              <p className="rounded-md bg-zinc-100 px-4 py-3 text-center text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                You&apos;ve declined this proposal.
              </p>
            ) : canRespond ? (
              <ProposalResponseButtons token={token} />
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Sent via QuoteForge
        </p>
      </div>
    </div>
  );
}

function ProposalStatusPill({
  status,
}: {
  status: "draft" | "sent" | "accepted" | "declined";
}) {
  const labels: Record<typeof status, string> = {
    draft: "Draft",
    sent: "Awaiting response",
    accepted: "Accepted",
    declined: "Declined",
  };
  const classes: Record<typeof status, string> = {
    draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    sent: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    accepted:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    declined: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes[status]}`}
    >
      {labels[status]}
    </span>
  );
}
