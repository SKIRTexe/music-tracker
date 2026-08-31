"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { sendRequest, acceptRequest, dropFriend } from "@/app/social-actions";
import type { Person } from "@/lib/social";

type Action = "add" | "accept" | "remove" | "none";

/**
 * One person, with whatever the viewer can do about them.
 *
 * The action is passed in rather than derived here: the same row appears in
 * search results, in pending requests and in the friends list, and each of
 * those already knows the relationship. Re-deriving it per row would mean a
 * query per row.
 */
export function PersonRow({ person, action }: { person: Person; action: Action }) {
  const [state, setState] = useState<Action | "done">(action);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>, next: Action | "done") =>
    startTransition(async () => {
      await fn();
      setState(next);
    });

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar {...person} />
      <div className="min-w-0 flex-1">
        {person.handle ? (
          <Link
            href={`/u/${person.handle}`}
            className="block truncate text-sm text-zinc-200 hover:text-white"
          >
            {person.name || person.handle}
          </Link>
        ) : (
          <span className="block truncate text-sm text-zinc-200">{person.name}</span>
        )}
        <p className="truncate text-[11px] text-zinc-600">
          @{person.handle}
          {!person.isPublic && <span className="ml-2 text-zinc-700">private</span>}
        </p>
      </div>

      {state === "done" ? (
        <span className="text-[11px] text-zinc-600">Done</span>
      ) : state === "add" ? (
        <button
          disabled={pending}
          onClick={() => run(() => sendRequest(person.id), "done")}
          className="rounded-full bg-brand-500/15 px-3 py-1 text-[11px] font-medium text-brand-500 ring-1 ring-inset ring-brand-500/30 transition-colors hover:bg-brand-500/25 disabled:opacity-50"
        >
          {pending ? "…" : "Add"}
        </button>
      ) : state === "accept" ? (
        <div className="flex gap-1.5">
          <button
            disabled={pending}
            onClick={() => run(() => acceptRequest(person.id), "done")}
            className="rounded-full bg-brand-500/15 px-3 py-1 text-[11px] font-medium text-brand-500 ring-1 ring-inset ring-brand-500/30 hover:bg-brand-500/25 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            disabled={pending}
            onClick={() => run(() => dropFriend(person.id), "done")}
            className="rounded-full px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
          >
            Ignore
          </button>
        </div>
      ) : state === "remove" ? (
        <button
          disabled={pending}
          onClick={() => run(() => dropFriend(person.id), "done")}
          className="rounded-full px-2 py-1 text-[11px] text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
        >
          Remove
        </button>
      ) : null}
    </li>
  );
}
