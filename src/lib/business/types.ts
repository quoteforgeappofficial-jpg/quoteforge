/**
 * The full internal business row. Contractor-side only — never send this
 * type (or a row shaped like it) to a public/customer-facing page or the
 * proposal email template; those each keep their own deliberately narrow
 * shape (e.g. `business: { name: string } | null` in
 * src/lib/proposals/public-dto.ts and src/lib/proposals/send-actions.ts)
 * rather than widening to this one, so a future edit to this type can
 * never, by itself, leak a new business field to a customer.
 */
export type BusinessProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
};
