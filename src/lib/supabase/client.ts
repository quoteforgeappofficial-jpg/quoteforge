import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (the browser).
 *
 * Uses the public URL and anon key only — safe to expose to the browser.
 * Row Level Security policies, not this client, are what actually
 * restrict what data a signed-in user can read or write.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
