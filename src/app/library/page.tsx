import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/LibraryView";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const entries = await prisma.albumLog.findMany({
    where: { userId: session.user.id },
    orderBy: { addedAt: "desc" },
    select: {
      id: true,
      mbid: true,
      albumTitle: true,
      artistName: true,
      artistMbid: true,
      releaseYear: true,
      status: true,
      rating: true,
      coverUrl: true,
      addedAt: true,
    },
  });

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-lg font-medium text-zinc-300 mb-8">My Library</h1>
      <LibraryView entries={entries} />
    </div>
  );
}
