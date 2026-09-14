import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for privileged, server-only operations
 * that must bypass Row Level Security (e.g. background jobs, admin
 * tooling, trusted server-to-server writes).
 *
 * The `server-only` import makes any accidental import of this module
 * from a Client Component fail at build time, before the service-role
 * key could ever reach the browser bundle.
 *
 * Used by the Phase 6 public proposal read/accept-decline paths
 * (src/lib/proposals/public-data.ts, public-actions.ts) — an anonymous
 * /p/[token] visitor has no session for RLS to key on, so those go
 * through this service-role client instead. Use the regular server
 * client (`@/lib/supabase/server`) instead whenever RLS-scoped access
 * is sufficient, which is almost always.
 *
 * Both env vars are read here, inside the function body, rather than
 * into a module-level `const` — so every call re-reads `process.env`
 * at invocation time rather than once at module load. That matters for
 * SUPABASE_SERVICE_ROLE_KEY (a plain, non-NEXT_PUBLIC_ server var,
 * genuinely resolved from process.env at runtime) but NOT for
 * NEXT_PUBLIC_SUPABASE_URL: Next.js statically replaces any literal
 * `process.env.NEXT_PUBLIC_*` reference — module scope or inside a
 * function, it makes no difference — with the value seen at BUILD time,
 * baked into the compiled output. So if a Preview deployment's build
 * ran before NEXT_PUBLIC_SUPABASE_URL was saved/scoped to Preview in
 * Vercel project settings (or from a stale build cache), that build's
 * bundle has it inlined as undefined, and no later runtime env change
 * fixes it without a new build. This is a likely explanation for
 * "missing" persisting after confirming the var exists in the
 * dashboard — see the diagnostic error below.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    // Presence-only diagnostic: reports which required var Vercel's
    // runtime actually sees as set/missing for this deployment, plus
    // which environment this is running in. Never logs or includes an
    // actual credential value, length, or prefix — only the boolean
    // outcome of `!url` / `!serviceRoleKey` and the environment name,
    // none of which is secret.
    const presence = (value: string | undefined) => (value ? "set" : "missing");
    throw new Error(
      "Missing Supabase admin credentials:\n" +
        `NEXT_PUBLIC_SUPABASE_URL=${presence(url)}\n` +
        `SUPABASE_SERVICE_ROLE_KEY=${presence(serviceRoleKey)}\n` +
        `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unknown"}`,
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
