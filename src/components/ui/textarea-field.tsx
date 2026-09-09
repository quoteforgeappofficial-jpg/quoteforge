import { forwardRef, type TextareaHTMLAttributes } from "react";

export const TextareaField = forwardRef<
  HTMLTextAreaElement,
  {
    label: string;
    id: string;
  } & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextareaField({ label, id, ...props }, ref) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        name={id}
        rows={4}
        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        {...props}
      />
    </div>
  );
});
