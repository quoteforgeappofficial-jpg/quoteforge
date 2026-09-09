export type Customer = {
  id: string;
  business_id: string;
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
  created_at: string;
  updated_at: string;
};

export function customerDisplayName(
  customer: Pick<Customer, "first_name" | "last_name">,
) {
  return `${customer.first_name} ${customer.last_name}`.trim();
}
