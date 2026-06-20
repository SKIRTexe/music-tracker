"use client";

import { useTransition } from "react";
import { toggleFavoriteGenre } from "@/app/actions";

export function FavoriteGenreButton({
  tag,
  isFavorite,
}: {
  tag: string;
  isFavorite: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(() => toggleFavoriteGenre(tag));
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title={isFavorite ? "Unpin genre" : "Pin genre to top"}
      className={`ml-2 text-sm leading-none transition-colors disabled:opacity-40 ${
        isFavorite
          ? "text-zinc-300 hover:text-zinc-500"
          : "text-zinc-700 hover:text-zinc-400"
      }`}
    >
      ★
    </button>
  );
}
