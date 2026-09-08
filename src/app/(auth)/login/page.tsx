import Link from "next/link";
import { signIn } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/text-field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    message?: string;
    redirectTo?: string;
  }>;
}) {
  const { error, message, redirectTo } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Log in
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Welcome back. Enter your details to continue.
      </p>

      <div className="mt-4 space-y-2">
        <FormMessage error={error} message={message} />
      </div>

      <form action={signIn} className="mt-6 space-y-4">
        {redirectTo && (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        )}
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
          autoComplete="current-password"
          required
          action={
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Forgot password?
            </Link>
          }
        />
        <SubmitButton>Log in</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-zinc-950 dark:text-zinc-50"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
