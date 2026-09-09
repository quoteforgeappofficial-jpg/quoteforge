import Link from "next/link";
import { createCustomer } from "@/lib/customers/actions";
import { CustomerForm } from "@/components/customers/customer-form";
import { FormMessage } from "@/components/ui/form-message";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/customers"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Customers
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Add customer
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Only the name is required — fill in what you have now and add the
        rest later.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <CustomerForm action={createCustomer} submitLabel="Add customer" />
    </div>
  );
}
