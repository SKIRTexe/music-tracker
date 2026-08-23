import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/LibraryView";
import { SpotifyExport } from "@/components/SpotifyExport";
import { spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

/** Result of the Spotify OAuth round trip, surfaced on return to this page. */
const NOTICE_TEXT: Record<string, string> = {
  linked: "Spotify connected.",
  denied: "Spotify connection cancelled.",
  badstate: "Connection failed a security check — please try again.",
  failed: "Could not connect to Spotify. Please try again.",
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ spotify?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { spotify: notice } = await searchParams;

  const [entries, spotifyAccount, userRow] = await Promise.all([
    prisma.albumLog.findMany({
      where: { userId: session.user.id },
      orderBy: { addedAt: "desc" },
      select: {
        id: true,
        mbid: true,
        itemType: true,
        albumTitle: true,
        artistName: true,
        parentAlbum: true,
        releaseYear: true,
        status: true,
        rating: true,
        coverUrl: true,
        addedAt: true,
      },
    }),
    prisma.account.findFirst({
      where: { userId: session.user.id, provider: "spotify" },
      select: { providerAccountId: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { playlistSyncFailedAt: true },
    }),
  ]);

  const rated = entries.filter((e) => e.rating != null);
  const average =
    rated.length > 0
      ? (rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;
  const wantCount = entries.filter((e) => e.status === "WANT").length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-lg font-medium text-zinc-200">My Library</h1>
          <p className="text-xs text-zinc-600 mt-0.5">
            {entries.length} item{entries.length === 1 ? "" : "s"}
            {average && <> · {average} average rating</>}
          </p>
        </div>

        {/* The sync *control* lives in the Want to Listen tab, since that is all
            it syncs. These two stay here: the notice greets you on the default tab
            when you land back from Spotify, and a stale-playlist warning you would
            only see after clicking the right tab is not a warning. */}
        <div className="text-right">
          {notice && NOTICE_TEXT[notice] && (
            <p className="text-[11px] text-zinc-500">{NOTICE_TEXT[notice]}</p>
          )}
          {spotifyAccount && userRow?.playlistSyncFailedAt && (
            <p className="text-[11px] text-amber-500/90">
              Playlist may be out of date — a background sync failed. Sync it from Want
              to Listen to fix it.
            </p>
          )}
        </div>
      </div>

      <LibraryView
        entries={entries}
        syncControl={
          <SpotifyExport
            connected={!!spotifyAccount}
            configured={spotifyConfigured()}
            wantCount={wantCount}
          />
        }
      />
    </div>
  );
}
