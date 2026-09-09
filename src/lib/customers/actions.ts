"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const LIST_PATH = "/dashboard/customers";

type CustomerFields = {
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  service_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
};

/** Trims a form field, converting blank input to null for optional columns. */
function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function readCustomerFields(formData: FormData): CustomerFields {
  return {
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim(),
    company_name: optionalString(formData, "companyName"),
    email: optionalString(formData, "email"),
    phone: optionalString(formData, "phone"),
    service_address: optionalString(formData, "serviceAddress"),
    city: optionalString(formData, "city"),
    state: optionalString(formData, "state"),
    zip: optionalString(formData, "zip"),
    notes: optionalString(formData, "notes"),
  };
}

/** Returns an error message if the required fields are missing, else null. */
function validateCustomerFields(fields: CustomerFields): string | null {
  if (!fields.first_name || !fields.last_name) {
    return "First and last name are required.";
  }
  return null;
}

export async function createCustomer(formData: FormData) {
  const fields = readCustomerFields(formData);
  const validationError = validateCustomerFields(fields);

  if (validationError) {
    redirect(
      `${LIST_PATH}/new?error=${encodeURIComponent(validationError)}`,
    );
  }

  const supabase = await createClient();

  // business_id is not set here — it defaults to the caller's own
  // business (see the customers migration), and RLS's with-check
  // rejects the insert outright if that were ever not the case.
  const { data, error } = await supabase
    .from("customers")
    .insert(fields)
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `${LIST_PATH}/new?error=${encodeURIComponent(
        error?.message ?? "Could not create customer.",
      )}`,
    );
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${data.id}`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const fields = readCustomerFields(formData);
  const validationError = validateCustomerFields(fields);
  const editPath = `${LIST_PATH}/${customerId}/edit`;

  if (validationError) {
    redirect(`${editPath}?error=${encodeURIComponent(validationError)}`);
  }

  const supabase = await createClient();

  // RLS scopes this update to rows in the caller's own business — a
  // customerId belonging to another business simply matches zero rows.
  const { error } = await supabase
    .from("customers")
    .update(fields)
    .eq("id", customerId);

  if (error) {
    redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${customerId}`);
  redirect(`${LIST_PATH}/${customerId}`);
}

export async function deleteCustomer(customerId: string) {
  const supabase = await createClient();

  // Same RLS scoping as above — this can only ever delete a row that
  // belongs to the caller's own business.
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId);

  if (error) {
    redirect(
      `${LIST_PATH}/${customerId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
