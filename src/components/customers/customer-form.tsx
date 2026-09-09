import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Customer } from "@/lib/customers/types";

export function CustomerForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: Partial<Customer>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-6 space-y-8">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Contact
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="firstName"
            label="First name"
            type="text"
            autoComplete="given-name"
            defaultValue={defaultValues?.first_name}
            required
          />
          <TextField
            id="lastName"
            label="Last name"
            type="text"
            autoComplete="family-name"
            defaultValue={defaultValues?.last_name}
            required
          />
        </div>
        <TextField
          id="companyName"
          label="Company name (optional)"
          type="text"
          autoComplete="organization"
          defaultValue={defaultValues?.company_name ?? undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            defaultValue={defaultValues?.email ?? undefined}
          />
          <TextField
            id="phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            defaultValue={defaultValues?.phone ?? undefined}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Service address
        </h2>
        <TextField
          id="serviceAddress"
          label="Street address"
          type="text"
          autoComplete="street-address"
          defaultValue={defaultValues?.service_address ?? undefined}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="city"
            label="City"
            type="text"
            autoComplete="address-level2"
            defaultValue={defaultValues?.city ?? undefined}
          />
          <TextField
            id="state"
            label="State"
            type="text"
            autoComplete="address-level1"
            defaultValue={defaultValues?.state ?? undefined}
          />
          <TextField
            id="zip"
            label="ZIP"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={defaultValues?.zip ?? undefined}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Notes
        </h2>
        <TextareaField
          id="notes"
          label="Notes (optional)"
          placeholder="Gate code, preferred contact times, pets, access notes…"
          defaultValue={defaultValues?.notes ?? undefined}
        />
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
