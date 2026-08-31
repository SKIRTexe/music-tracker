"use client";

import { useState, useTransition } from "react";
import { sendRequest, acceptRequest, dropFriend } from "@/app/social-actions";
import type { FriendState } from "@/lib/social";

const PILL =
  "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50";

export function FriendButton({
  personId,
  state: initial,
}: {
  personId: string;
  state: FriendState;
}) {
  const [state, setState] = useState<FriendState>(initial);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<unknown>, next: FriendState) =>
    startTransition(async () => {
      await fn();
      setState(next);
    });

  if (state === "friends") {
    return (
      <button
        disabled={pending}
        onClick={() => act(() => dropFriend(personId), "none")}
        className={`${PILL} text-zinc-600 hover:text-red-400`}
      >
        Friends
      </button>
    );
  }

  if (state === "request_sent") {
    return (
      <button
        disabled={pending}
        onClick={() => act(() => dropFriend(personId), "none")}
        className={`${PILL} text-zinc-500 hover:text-zinc-300`}
      >
        Requested
      </button>
    );
  }

  if (state === "request_received") {
    return (
      <button
        disabled={pending}
        onClick={() => act(() => acceptRequest(personId), "friends")}
        className={`${PILL} bg-brand-500/15 text-brand-500 ring-1 ring-inset ring-brand-500/30 hover:bg-brand-500/25`}
      >
        Accept
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => act(() => sendRequest(personId), "request_sent")}
      className={`${PILL} bg-brand-500/15 text-brand-500 ring-1 ring-inset ring-brand-500/30 hover:bg-brand-500/25`}
    >
      Add friend
    </button>
  );
}
