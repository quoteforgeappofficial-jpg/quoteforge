import {
  PROPOSAL_STATUS_LABELS,
  type ProposalStatus,
} from "@/lib/proposals/types";

const STATUS_CLASSES: Record<ProposalStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  sent: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  accepted:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  declined: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {PROPOSAL_STATUS_LABELS[status]}
    </span>
  );
}
