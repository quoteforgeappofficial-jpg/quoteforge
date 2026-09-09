import Link from "next/link";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-500">
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
