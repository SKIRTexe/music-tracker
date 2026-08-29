"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setNewPassword } from "@/app/auth-actions";

const MESSAGES: Record<string, string> = {
  invalid: "This link is no longer valid. It may already have been used.",
  expired: "This link has expired. Reset links last an hour.",
  weak: "Passwords need at least 8 characters.",
  rate_limited: "Too many attempts. Try again in a few minutes.",
};

export function ResetForm({ userId, token }: { userId: string; token: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="space-y-4">
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-300">
          Your password has been changed, and every other session has been signed out.
        </p>
        <Link
          href="/login"
          className="block rounded bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-500"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const outcome = await setNewPassword(userId, token, password);
          if (outcome === "ok") setDone(true);
          else setError(MESSAGES[outcome] ?? "Something went wrong.");
        });
      }}
      className="space-y-3"
    >
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        autoComplete="new-password"
        className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none sm:text-sm"
      />

      {error && (
        <p className="text-xs text-red-400">
          {error}{" "}
          <Link href="/forgot" className="underline underline-offset-2">
            Ask for a new link
          </Link>
        </p>
      )}

      <button
        type="submit"
        disabled={pending || password.length < 8}
        className="w-full rounded bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
