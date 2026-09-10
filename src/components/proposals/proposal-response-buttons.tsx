"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { respondToProposal } from "@/lib/proposals/public-actions";

/**
 * Accept/Decline controls for the public proposal page. Each has its own
 * non-blocking <dialog> confirmation (same pattern used throughout the
 * dashboard for destructive/final actions) so an accidental tap can't
 * immediately commit a response. Calls respondToProposal directly
 * (rather than via a <form action>) so the result — success or a plain-
 * language error — can be shown inline without leaving the page; on
 * success, router.refresh() re-fetches the page so the status badge
 * above updates to reflect the new state.
 */
export function ProposalResponseButtons({ token }: { token: string }) {
  const router = useRouter();
  const acceptDialogRef = useRef<HTMLDialogElement>(null);
  const declineDialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: "accept" | "decline") {
    if (pending) return; // guards against duplicate taps
    setPending(true);
    setError(null);

    const result = await respondToProposal(token, decision);

    setPending(false);
    acceptDialogRef.current?.close();
    declineDialogRef.current?.close();

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => declineDialogRef.current?.showModal()}
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => acceptDialogRef.current?.showModal()}
          disabled={pending}
          className="rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Accept
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <dialog
        ref={acceptDialogRef}
        className="rounded-lg border border-zinc-200 p-6 text-left shadow-lg backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="text-sm text-zinc-950 dark:text-zinc-50">
          Accept this proposal?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => acceptDialogRef.current?.close()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit("accept")}
            disabled={pending}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {pending ? "Please wait…" : "Yes, accept"}
          </button>
        </div>
      </dialog>

      <dialog
        ref={declineDialogRef}
        className="rounded-lg border border-zinc-200 p-6 text-left shadow-lg backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="text-sm text-zinc-950 dark:text-zinc-50">
          Decline this proposal?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => declineDialogRef.current?.close()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit("decline")}
            disabled={pending}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {pending ? "Please wait…" : "Yes, decline"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
