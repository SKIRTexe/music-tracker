"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/app/auth-actions";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      // Worded so it is true whether or not the address had an account. Saying
      // "we've sent you an email" to someone who typed a stranger's address
      // would confirm that the stranger has one.
      <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-300">
        If <span className="text-zinc-100">{email}</span> has an account, a reset
        link is on its way. Check spam if it doesn&rsquo;t arrive in a minute or two.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await requestPasswordReset(email);
          setSent(true);
        });
      }}
      className="space-y-3"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none sm:text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
