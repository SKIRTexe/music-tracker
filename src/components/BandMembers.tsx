"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { MBArtistRelation } from "@/lib/musicbrainz";

async function fetchMemberImage(name: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(name);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&entity=album&attribute=artistTerm&limit=3`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const match =
      data.results?.find(
        (r: { artistName?: string }) =>
          r.artistName?.toLowerCase() === name.toLowerCase()
      ) ?? data.results?.[0];
    return (match?.artworkUrl100 as string | undefined)?.replace("100x100bb", "300x300bb") ?? null;
  } catch {
    return null;
  }
}

function MemberRow({ rel }: { rel: MBArtistRelation }) {
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMemberImage(rel.artist.name).then((url) => {
      if (!cancelled) setImg(url);
    });
    return () => { cancelled = true; };
  }, [rel.artist.name]);

  return (
    <Link
      href={`/artist/${rel.artist.id}`}
      className="flex items-center gap-3 group py-1"
    >
      <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={rel.artist.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-zinc-400 text-sm font-light">
            {rel.artist.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors truncate">
          {rel.artist.name}
        </p>
        {rel.attributes.length > 0 && (
          <p className="text-[10px] text-zinc-500 truncate capitalize">
            {rel.attributes.join(", ")}
          </p>
        )}
        {(rel.begin || rel.end) && (
          <p className="text-[10px] text-zinc-700">
            {rel.begin?.slice(0, 4)}
            {rel.end ? `–${rel.end.slice(0, 4)}` : "–present"}
          </p>
        )}
      </div>
    </Link>
  );
}

const VISIBLE_CAP = 5;

export function BandMembers({ members }: { members: MBArtistRelation[] }) {
  const [sortDesc, setSortDesc] = useState(true); // true = most recent first
  const [expanded, setExpanded] = useState(false);

  if (members.length === 0) return null;

  const sorted = [...members].sort((a, b) => {
    const ay = a.begin ? parseInt(a.begin.slice(0, 4)) : 0;
    const by = b.begin ? parseInt(b.begin.slice(0, 4)) : 0;
    return sortDesc ? by - ay : ay - by;
  });

  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_CAP);
  const overflow = sorted.length - VISIBLE_CAP;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
          Members
        </h2>
        <button
          onClick={() => setSortDesc((d) => !d)}
          title={sortDesc ? "Sorted: most recent first" : "Sorted: least recent first"}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {sortDesc ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          )}
        </button>
      </div>
      <div className="flex flex-col divide-y divide-zinc-800/60">
        {visible.map((rel) => (
          <MemberRow key={rel.artist.id} rel={rel} />
        ))}
      </div>
      {overflow > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? "Show less" : `Show ${overflow} more`}
        </button>
      )}
    </div>
  );
}
