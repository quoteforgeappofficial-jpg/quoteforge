import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateCustomer } from "@/lib/customers/actions";
import { customerDisplayName, type Customer } from "@/lib/customers/types";
import { CustomerForm } from "@/components/customers/customer-form";
import { FormMessage } from "@/components/ui/form-message";

export default async function EditCustomerPage({
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

  if (!customer) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/dashboard/customers/${customer.id}`}
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← {customerDisplayName(customer)}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Edit customer
      </h1>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <CustomerForm
        action={updateCustomer.bind(null, customer.id)}
        defaultValues={customer}
        submitLabel="Save changes"
      />
    </div>
  );
}
