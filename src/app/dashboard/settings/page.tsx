import { createClient } from "@/lib/supabase/server";
import { updateBusinessProfile } from "@/lib/business/actions";
import { BusinessProfileForm } from "@/components/business/business-profile-form";
import { FormMessage } from "@/components/ui/form-message";
import type { BusinessProfile } from "@/lib/business/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  const supabase = await createClient();

  // Neither query is filtered by an id from the client — both tables
  // have exactly one row visible per signed-in caller under RLS
  // (businesses: id = current_business_id(); profiles: auth.uid() =
  // id), so .single() alone always resolves to "my own row."
  const [{ data: business }, { data: profile }] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, name, email, phone, address_line1, address_line2, city, state, zip, website, created_at, updated_at",
      )
      .single<BusinessProfile>(),
    supabase.from("profiles").select("role").single<{ role: string }>(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Settings
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Your business profile. These details may appear on proposals and
        emails sent to your customers.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} message={message} />
      </div>

      {business ? (
        <BusinessProfileForm
          action={updateBusinessProfile}
          defaultValues={business}
          canEdit={profile?.role === "owner"}
        />
      ) : (
        // Should be unreachable for a signed-in user — every account
        // gets a businesses row automatically at signup (see
        // handle_new_user() in the auth foundation migration) — but
        // fail safe rather than crash if it's somehow missing.
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          We couldn&apos;t load your business profile. Please try again, or
          contact support if this keeps happening.
        </p>
      )}
    </div>
  );
}
