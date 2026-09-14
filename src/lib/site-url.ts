import "server-only";

/**
 * The app's own public base URL (no trailing slash), for building
 * absolute links — currently only a proposal's public /p/[token] link
 * (src/app/dashboard/proposals/[id]/page.tsx).
 *
 * This is presentation/navigation only: it decides what URL text to
 * show/copy, never what the server trusts. It never reads anything
 * client-supplied (a request header, an origin, a query param) — only
 * Vercel's own server-side deployment env vars (VERCEL_ENV, VERCEL_URL)
 * and the explicitly-configured NEXT_PUBLIC_SITE_URL, none of which an
 * end user can influence. Proposal lookup/accept/decline authorization
 * is keyed entirely on the public_token itself (see
 * src/lib/proposals/public-data.ts and public-actions.ts) and does not
 * call this function at all.
 *
 * Resolution order:
 *   1. Production (VERCEL_ENV === "production"): NEXT_PUBLIC_SITE_URL —
 *      the canonical production domain, set once in Vercel project
 *      settings — falling back to the production deployment's own
 *      VERCEL_URL if that isn't configured, so this never silently
 *      breaks even in a misconfigured project.
 *   2. Any other Vercel deployment — Preview (VERCEL_ENV === "preview")
 *      or a Vercel "development" build: VERCEL_URL, which Vercel sets
 *      per-deployment to that exact deployment's own unique host (e.g.
 *      my-app-git-branch-team.vercel.app). This is what fixes the
 *      Preview bug: NEXT_PUBLIC_SITE_URL is one fixed value across every
 *      environment (it's set once in Vercel project settings), so using
 *      it here on Preview would always point at production, whatever
 *      Preview deployment is actually running. Using VERCEL_URL instead
 *      means every Preview deployment automatically links to itself,
 *      with no manual env var change per deployment.
 *   3. Not running on Vercel at all (plain `next dev`/`next start`,
 *      local or otherwise): NEXT_PUBLIC_SITE_URL if set, else
 *      http://localhost:3000 as a reasonable local-dev fallback.
 *
 * VERCEL_URL never includes a protocol (it's a bare host) — Vercel
 * deployments are always served over https, so it's prefixed here.
 */
export function siteUrl(): string {
  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = process.env.VERCEL_URL;

  if (vercelEnv === "production") {
    return process.env.NEXT_PUBLIC_SITE_URL ?? deploymentUrl(vercelUrl) ?? "http://localhost:3000";
  }

  if (vercelEnv) {
    // Preview, or a Vercel "development" build — always prefer this
    // exact deployment's own host over the fixed NEXT_PUBLIC_SITE_URL.
    return deploymentUrl(vercelUrl) ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function deploymentUrl(vercelUrl: string | undefined): string | null {
  return vercelUrl ? `https://${vercelUrl}` : null;
}
