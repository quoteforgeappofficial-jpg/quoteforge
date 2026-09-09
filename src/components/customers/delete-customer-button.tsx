"use client";

export function DeleteCustomerButton({
  customerName,
}: {
  customerName: string;
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete ${customerName}? This cannot be undone.`,
        );
        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
    >
      Delete customer
    </button>
  );
}
