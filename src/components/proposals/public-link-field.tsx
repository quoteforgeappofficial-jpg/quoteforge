"use client";

/**
 * A read-only text field showing the proposal's public URL, which
 * selects its full contents on focus/click — a small convenience so a
 * contractor can copy the link with a single click-then-Cmd/Ctrl+C
 * without dragging to select.
 *
 * This has to be a Client Component: an onFocus handler is a function,
 * and Server Components cannot pass event-handler props to *any*
 * element (including a plain native `<input>`) — the entire prop tree
 * of an element rendered from a Server Component must be serializable
 * for the RSC payload, and functions aren't. Rendering this one field
 * as its own tiny client boundary keeps the rest of the proposal detail
 * page (src/app/dashboard/proposals/[id]/page.tsx) a Server Component.
 */
export function PublicLinkField({ url }: { url: string }) {
  return (
    <input
      type="text"
      readOnly
      value={url}
      onFocus={(event) => event.target.select()}
      className="block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    />
  );
}
