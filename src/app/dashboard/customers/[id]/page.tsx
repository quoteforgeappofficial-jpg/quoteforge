import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteCustomer } from "@/lib/customers/actions";
import { customerDisplayName, type Customer } from "@/lib/customers/types";
import { DeleteCustomerButton } from "@/components/customers/delete-customer-button";
import { FormMessage } from "@/components/ui/form-message";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-950 dark:text-zinc-50">
        {value || <span className="text-zinc-400 dark:text-zinc-600">—</span>}
      </dd>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single<Customer>();

  // RLS means a customer belonging to another business simply doesn't come
  // back here — indistinguishable from a nonexistent id, which is the
  // correct behavior: this page never reveals that a row exists elsewhere.
  if (!customer) {
    notFound();
  }

  const name = customerDisplayName(customer);
  const serviceAddressLines = [
    customer.service_address,
    [customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/customers"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Customers
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {name}
          </h1>
          {customer.company_name && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {customer.company_name}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/dashboard/customers/${customer.id}/edit`}
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Edit
          </Link>
          <form action={deleteCustomer.bind(null, customer.id)}>
            <DeleteCustomerButton customerName={name} />
          </form>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <dl className="mt-8 grid gap-6 sm:grid-cols-2">
        <DetailRow label="Email" value={customer.email} />
        <DetailRow label="Phone" value={customer.phone} />

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Service address
          </dt>
          <dd className="mt-1 text-sm text-zinc-950 dark:text-zinc-50">
            {serviceAddressLines.length > 0 ? (
              serviceAddressLines.map((line) => <p key={line}>{line}</p>)
            ) : (
              <span className="text-zinc-400 dark:text-zinc-600">—</span>
            )}
          </dd>
        </div>

        {customer.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
              Notes
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-zinc-950 dark:text-zinc-50">
              {customer.notes}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
