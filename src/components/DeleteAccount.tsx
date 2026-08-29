"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "@/app/account-actions";

/**
 * Deleting an account, gated behind typing the word.
 *
 * A confirm dialog is one mis-aimed tap; this is the one action in the product
 * with nothing behind it, so it asks for a deliberate act instead. The count is
 * named rather than left as "all your data", because the number is what makes
 * the decision.
 */
export function DeleteAccount({ savedItems }: { savedItems: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const armed = typed.trim().toUpperCase() === "DELETE";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-red-900/60 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-950/40"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-red-900/60 bg-red-950/20 p-4">
      <p className="text-xs leading-relaxed text-zinc-300">
        This permanently deletes your account,{" "}
        <span className="font-semibold text-zinc-100">
          {savedItems === 1 ? "1 saved item" : `${savedItems} saved items`}
        </span>{" "}
        and every rating, on the website and in the app. It cannot be undone.
      </p>

      <label className="block text-[11px] text-zinc-500">
        Type <span className="font-mono font-semibold text-zinc-300">DELETE</span> to confirm
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-red-800 focus:outline-none"
        />
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          disabled={!armed || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await deleteMyAccount();
              // Success redirects, so anything returned here is a failure.
              if (result?.error) setError(result.error);
            })
          }
          className="rounded bg-red-900 px-3 py-2 text-xs font-medium text-red-50 transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="rounded px-3 py-2 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
