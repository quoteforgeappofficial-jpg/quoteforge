import { type InputHTMLAttributes, type ReactNode } from "react";

export function TextField({
  label,
  id,
  action,
  ...props
}: {
  label: string;
  id: string;
  action?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {label}
        </label>
        {action}
      </div>
      <input
        id={id}
        name={id}
        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        {...props}
      />
    </div>
  );
}
