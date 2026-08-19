import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/LibraryView";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const entries = await prisma.albumLog.findMany({
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
  });

  const rated = entries.filter((e) => e.rating != null);
  const average =
    rated.length > 0
      ? (rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;

  return (
    <div>
      <div className="flex items-baseline gap-4 mb-8">
        <h1 className="text-lg font-medium text-zinc-200">My Library</h1>
        <p className="text-xs text-zinc-600">
          {entries.length} item{entries.length === 1 ? "" : "s"}
          {average && <> · {average} average rating</>}
        </p>
      </div>
      <LibraryView entries={entries} />
    </div>
  );
}
