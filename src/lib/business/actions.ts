"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const SETTINGS_PATH = "/dashboard/settings";

type BusinessProfileFields = {
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
};

const emailSchema = z.string().email();
const urlSchema = z.string().url();

/** Trims a form field, converting blank input to null for optional columns. */
function optionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

/**
 * A website is stored with an explicit scheme so it's always a usable
 * link. Someone typing "example.com" (no scheme) is far more likely than
 * someone typing a non-https protocol on purpose, so bare input is
 * assumed to be missing "https://" rather than rejected outright.
 */
function normalizeWebsite(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function readBusinessProfileFields(formData: FormData): BusinessProfileFields {
  const website = optionalString(formData, "website");

  return {
    name: String(formData.get("name") ?? "").trim(),
    email: optionalString(formData, "email"),
    phone: optionalString(formData, "phone"),
    address_line1: optionalString(formData, "addressLine1"),
    address_line2: optionalString(formData, "addressLine2"),
    city: optionalString(formData, "city"),
    state: optionalString(formData, "state"),
    zip: optionalString(formData, "zip"),
    website: website ? normalizeWebsite(website) : null,
  };
}

/**
 * Returns an error message if any field is invalid, else null. No DB
 * CHECK constraint backs any of this (see the Phase 9 migration) —
 * format validation for the optional fields lives here, at the
 * application layer, matching the same posture already used for
 * customers.email (src/lib/customers/actions.ts has no format
 * validation at all for that field; this goes slightly further per
 * Phase 9's explicit requirement, without adding a DB constraint).
 */
function validateBusinessProfileFields(
  fields: BusinessProfileFields,
): string | null {
  if (!fields.name) {
    return "Business name is required.";
  }

  if (fields.email && !emailSchema.safeParse(fields.email).success) {
    return "Enter a valid business email address.";
  }

  if (fields.website && !urlSchema.safeParse(fields.website).success) {
    return "Enter a valid website address.";
  }

  return null;
}

/**
 * Updates the caller's own business profile — the single row created
 * automatically at signup (handle_new_user() in the auth foundation
 * migration). No business id is ever read from form input, a route
 * param, or bound into this action from the page — there is nothing
 * here for a tampered/forged client value to target in the first place.
 * businessId below comes only from the caller's own profiles row,
 * itself resolved with no client-supplied filter (RLS on profiles is
 * "auth.uid() = id", so .single() with no .eq() can only ever return
 * the caller's own row).
 *
 * The explicit .eq("id", businessId) below is belt-and-suspenders, not
 * the actual authorization boundary: "Owners can update their
 * business" in 20260908120000_init_auth_foundation.sql, unmodified by
 * Phase 9, still independently restricts the set of rows this
 * statement can touch to at most the one row where
 * id = current_business_id() AND the caller's own profile has role =
 * 'owner'. Even if businessId were somehow wrong, RLS's "using" clause
 * would still refuse to update a different business's row — the
 * explicit filter just makes the intent unambiguous in the query
 * itself and gives update-vs-not-found a clearer signal than an
 * unfiltered statement would.
 *
 * A signed-in 'member' (non-owner) profile can still reach this action
 * (the settings page still renders read-only for them — see
 * src/components/business/business-profile-form.tsx), but RLS's
 * "using" clause then matches zero rows for the UPDATE — no error,
 * just an empty result — which is detected below and reported as a
 * permission error rather than a false success.
 */
export async function updateBusinessProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fields = readBusinessProfileFields(formData);
  const validationError = validateBusinessProfileFields(fields);

  if (validationError) {
    redirect(`${SETTINGS_PATH}?error=${encodeURIComponent(validationError)}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("business_id")
    .single<{ business_id: string | null }>();

  const businessId = profile?.business_id;

  if (profileError || !businessId) {
    console.error(
      "updateBusinessProfile: could not resolve caller's business_id",
      profileError?.message,
    );
    redirect(
      `${SETTINGS_PATH}?error=${encodeURIComponent(
        "Unable to update the business profile. Please try again.",
      )}`,
    );
  }

  const { data, error } = await supabase
    .from("businesses")
    .update(fields)
    .eq("id", businessId)
    .select("id");

  if (error) {
    console.error("updateBusinessProfile: update failed", error.message);
    redirect(
      `${SETTINGS_PATH}?error=${encodeURIComponent(
        "Unable to update the business profile. Please try again.",
      )}`,
    );
  }

  if (!data || data.length === 0) {
    redirect(
      `${SETTINGS_PATH}?error=${encodeURIComponent(
        "Only the business owner can update this information.",
      )}`,
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirect(
    `${SETTINGS_PATH}?message=${encodeURIComponent("Business profile updated.")}`,
  );
}
