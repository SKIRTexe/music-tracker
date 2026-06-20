"use client";

import { useTransition } from "react";
import { updateStatus } from "@/app/actions";

export function StatusSelect({
  mbid,
  currentStatus,
}: {
  mbid: string;
  currentStatus: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={currentStatus}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => {
          updateStatus(mbid, next);
        });
      }}
      className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-400 focus:outline-none disabled:opacity-40"
    >
      <option value="LISTENED">Listened</option>
      <option value="LISTENING">Listening</option>
      <option value="WANT">Want</option>
    </select>
  );
}
