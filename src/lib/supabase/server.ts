import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and
 * Route Handlers. Reads/writes the user's session via cookies.
 *
 * Uses the public URL and anon key — RLS still applies to every query
 * made with this client, scoped to the signed-in user via their session.
 *
 * Server Components cannot write cookies, so `setAll` is wrapped in a
 * try/catch there; the proxy/middleware (see `src/proxy.ts`) is
 * responsible for keeping the session cookie refreshed in that case.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore because
            // the middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}
