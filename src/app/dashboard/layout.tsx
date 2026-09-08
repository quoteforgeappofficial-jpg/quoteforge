import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/estimates", label: "Estimates" },
  { href: "/dashboard/proposals", label: "Proposals" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already redirects unauthenticated requests away from
  // /dashboard, but every server-rendered page also checks for itself —
  // defense in depth, not a substitute for the middleware.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col border-b border-zinc-200 md:w-56 md:shrink-0 md:border-b-0 md:border-r dark:border-zinc-800">
        <div className="px-6 py-5">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            QuoteForge
          </Link>
        </div>
        <nav className="flex flex-1 gap-1 overflow-x-auto px-3 pb-4 md:flex-col md:overflow-visible md:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
          <p className="truncate px-3 pb-2 text-xs text-zinc-500 dark:text-zinc-500">
            {user.email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
