"use client";

import { BandMembers } from "@/components/BandMembers";
import type { MBArtistRelation } from "@/lib/musicbrainz";

export function ArtistPageHeader({
  children,
  members,
}: {
  children: React.ReactNode;
  members: MBArtistRelation[];
}) {
  return (
    <div className="flex gap-10 mb-10">
      <div className="flex-1 min-w-0">
        {children}
      </div>
      {members.length > 0 && (
        <aside className="w-56 shrink-0">
          <BandMembers members={members} />
        </aside>
      )}
    </div>
  );
}
