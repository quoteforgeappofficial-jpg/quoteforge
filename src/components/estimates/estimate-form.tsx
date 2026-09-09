import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { LineItemsAndPricingFields } from "@/components/estimates/line-items-and-pricing-fields";
import {
  ESTIMATE_STATUSES,
  STATUS_LABELS,
  type Estimate,
  type LineItemCategory,
} from "@/lib/estimates/types";

type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
};

export function EstimateForm({
  action,
  defaultValues,
  initialLineItems,
  customers,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: Partial<Estimate>;
  initialLineItems: {
    category: LineItemCategory;
    description: string;
    quantity: number;
    unit_cost: number;
  }[];
  customers: CustomerOption[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-6 space-y-8">
      <div className="space-y-4">
        <TextField
          id="title"
          label="Title"
          type="text"
          placeholder="e.g. Backyard fence replacement"
          defaultValue={defaultValues?.title}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="status"
            label="Status"
            defaultValue={defaultValues?.status ?? "draft"}
          >
            {ESTIMATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="customerId"
            label="Customer (optional)"
            defaultValue={defaultValues?.customer_id ?? ""}
          >
            <option value="">No customer selected</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.first_name} {customer.last_name}
                {customer.company_name ? ` — ${customer.company_name}` : ""}
              </option>
            ))}
          </SelectField>
        </div>

        <TextareaField
          id="description"
          label="Scope / description (customer-facing)"
          placeholder="What the job includes…"
          defaultValue={defaultValues?.description ?? undefined}
        />

        <TextareaField
          id="internalNotes"
          label="Internal notes (never shown to the customer)"
          placeholder="Access notes, supplier, anything just for you…"
          defaultValue={defaultValues?.internal_notes ?? undefined}
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Line items &amp; pricing
        </h2>
        <LineItemsAndPricingFields
          initialItems={initialLineItems}
          initialMarkupType={defaultValues?.markup_type ?? "percent"}
          initialMarkupValue={defaultValues?.markup_value ?? 0}
          initialMinimumJobPrice={defaultValues?.minimum_job_price ?? null}
          initialFinalSellingPrice={defaultValues?.final_selling_price ?? null}
        />
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
