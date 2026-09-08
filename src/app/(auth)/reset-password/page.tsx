import Link from "next/link";
import { updatePassword } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { TextField } from "@/components/ui/text-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A valid recovery session is required to reach this form. Without one,
  // the user followed an expired/invalid link or navigated here directly.
  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Link expired
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This password reset link is invalid or has expired. Request a new
          one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm font-medium text-zinc-950 dark:text-zinc-50"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Choose a new password
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Set a new password for {user.email}.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} />
      </div>

      <form action={updatePassword} className="mt-6 space-y-4">
        <TextField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Must be at least 8 characters.
        </p>
        <SubmitButton>Update password</SubmitButton>
      </form>
    </div>
  );
}
