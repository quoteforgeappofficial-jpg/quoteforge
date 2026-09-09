"use client";

import { useRef } from "react";

/**
 * Confirms a delete via a native <dialog> rather than window.confirm(),
 * which blocks the main thread until dismissed and gets misattributed as
 * slow event-handler work (see the same fix on DeleteCustomerButton).
 */
export function DeleteEstimateButton({
  estimateTitle,
}: {
  estimateTitle: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete estimate
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-lg border border-zinc-200 p-6 text-left shadow-lg backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="text-sm text-zinc-950 dark:text-zinc-50">
          Delete &ldquo;{estimateTitle}&rdquo;? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800"
          >
            Delete estimate
          </button>
        </div>
      </dialog>
    </>
  );
}
