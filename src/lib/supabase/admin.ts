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
 * into a module-level `const` — so every call re-reads `process.env` at
 * invocation time rather than once at module load.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin credentials: NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY must both be set to use the admin client.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
