import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, company_name, email, phone, city, state")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Customers
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Contact and service address details for the people you work with.
          </p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          + Add customer
        </Link>
      </div>

      <div className="mt-8">
        {customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to start building estimates and proposals for them."
            action={{
              href: "/dashboard/customers/new",
              label: "Add customer",
            }}
          />
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {customers.map((customer) => {
              const contactLine = [customer.phone, customer.email]
                .filter(Boolean)
                .join(" · ");
              const locationLine = [customer.city, customer.state]
                .filter(Boolean)
                .join(", ");

              return (
                <li key={customer.id}>
                  <Link
                    href={`/dashboard/customers/${customer.id}`}
                    className="flex flex-col gap-1 px-4 py-3 transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900"
                  >
                    <div>
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {customer.first_name} {customer.last_name}
                      </p>
                      {customer.company_name && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-500">
                          {customer.company_name}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      <p>{contactLine || "No contact info"}</p>
                      {locationLine && (
                        <p className="text-zinc-500 dark:text-zinc-500">
                          {locationLine}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
