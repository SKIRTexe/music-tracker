"use client";

import { useState } from "react";

export function CoverImage({ mbid, title }: { mbid: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-full aspect-square bg-zinc-800 flex items-center justify-center p-3">
        <span className="text-zinc-500 text-xs text-center leading-snug line-clamp-3">
          {title}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://coverartarchive.org/release/${mbid}/front-250`}
      alt={title}
      onError={() => setFailed(true)}
      className="w-full aspect-square object-cover bg-zinc-800"
    />
  );
}
