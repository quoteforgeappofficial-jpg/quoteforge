import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BusinessProfile } from "@/lib/business/types";

/**
 * When canEdit is false (the signed-in profile's role isn't 'owner' —
 * see the "Owners can update their business" RLS policy), every field
 * renders disabled and no submit control is shown at all, rather than
 * letting a member submit a form that RLS will silently reject. This is
 * a UX nicety only — updateBusinessProfile() (src/lib/business/
 * actions.ts) independently detects and reports the same case if this
 * component is ever bypassed, since RLS is the actual authorization
 * boundary either way.
 */
export function BusinessProfileForm({
  action,
  defaultValues,
  canEdit,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues: BusinessProfile;
  canEdit: boolean;
}) {
  return (
    <form action={canEdit ? action : undefined} className="mt-6 space-y-8">
      {!canEdit && (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          Only the business owner can edit these details.
        </p>
      )}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Business
        </h2>
        <TextField
          id="name"
          label="Business name"
          type="text"
          autoComplete="organization"
          defaultValue={defaultValues.name}
          disabled={!canEdit}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="email"
            label="Business email"
            type="email"
            autoComplete="email"
            defaultValue={defaultValues.email ?? undefined}
            disabled={!canEdit}
          />
          <TextField
            id="phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            defaultValue={defaultValues.phone ?? undefined}
            disabled={!canEdit}
          />
        </div>
        <TextField
          id="website"
          label="Website"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="example.com"
          defaultValue={defaultValues.website ?? undefined}
          disabled={!canEdit}
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Address
        </h2>
        <TextField
          id="addressLine1"
          label="Address line 1"
          type="text"
          autoComplete="address-line1"
          defaultValue={defaultValues.address_line1 ?? undefined}
          disabled={!canEdit}
        />
        <TextField
          id="addressLine2"
          label="Address line 2"
          type="text"
          autoComplete="address-line2"
          defaultValue={defaultValues.address_line2 ?? undefined}
          disabled={!canEdit}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="city"
            label="City"
            type="text"
            autoComplete="address-level2"
            defaultValue={defaultValues.city ?? undefined}
            disabled={!canEdit}
          />
          <TextField
            id="state"
            label="State"
            type="text"
            autoComplete="address-level1"
            defaultValue={defaultValues.state ?? undefined}
            disabled={!canEdit}
          />
          <TextField
            id="zip"
            label="ZIP"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={defaultValues.zip ?? undefined}
            disabled={!canEdit}
          />
        </div>
      </div>

      {canEdit && <SubmitButton>Save changes</SubmitButton>}
    </form>
  );
}
