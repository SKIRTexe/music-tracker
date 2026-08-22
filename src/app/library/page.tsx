import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/LibraryView";
import { SpotifyExport } from "@/components/SpotifyExport";
import { RankingToggle } from "@/components/RankingToggle";
import { RANKING_MIN_RATED } from "@/lib/ranking";
import { spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

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
      select: { playlistSyncFailedAt: true, rankingEnabled: true },
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

        <SpotifyExport
          connected={!!spotifyAccount}
          configured={spotifyConfigured()}
          wantCount={wantCount}
          notice={notice}
          syncFailed={!!userRow?.playlistSyncFailedAt}
        />
      </div>

      <div className="mb-5">
        <RankingToggle
          enabled={!!userRow?.rankingEnabled}
          ratedAlbums={entries.filter((e) => e.itemType === "ALBUM" && e.rating != null).length}
          minRated={RANKING_MIN_RATED}
        />
      </div>

      <LibraryView entries={entries} />
    </div>
  );
}
