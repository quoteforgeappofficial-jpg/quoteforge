import Link from "next/link";
import { signUp } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/text-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Start managing quotes, estimates, and proposals.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} message={message} />
      </div>

      <form action={signUp} className="mt-6 space-y-4">
        <TextField
          id="fullName"
          label="Full name"
          type="text"
          autoComplete="name"
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Must be at least 8 characters.
        </p>
        <SubmitButton>Create account</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
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
