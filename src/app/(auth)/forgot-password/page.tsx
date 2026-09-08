import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/text-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Reset your password
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll send you a link to reset your
        password.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} message={message} />
      </div>

      <form action={requestPasswordReset} className="mt-6 space-y-4">
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
        />
        <SubmitButton>Send reset link</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Remembered it after all?{" "}
        <Link
          href="/login"
          className="font-medium text-zinc-950 dark:text-zinc-50"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
