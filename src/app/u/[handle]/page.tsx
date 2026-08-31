import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileByHandle, canViewLibrary, friendState } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { FriendButton } from "@/components/FriendButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await profileByHandle(handle);
  return { title: profile ? `${profile.name ?? profile.handle} — Recordcrate` : "Not found" };
}

/**
 * Someone's profile: who they are, and what they have rated.
 *
 * Ordered by rating rather than by date, because that is the question a profile
 * answers — "what does this person rate highly" — and a reverse-chronological
 * list answers "what have they been doing lately", which is the library's job.
 *
 * Visibility is decided by `canViewLibrary` and nothing else. The profile header
 * is shown either way: knowing someone exists is not the disclosure being
 * protected, and a page that 404s for a private user makes handles guessable by
 * their absence.
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await profileByHandle(handle);
  if (!profile) notFound();

  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const [visible, state] = await Promise.all([
    canViewLibrary(viewerId, profile.id),
    viewerId ? friendState(viewerId, profile.id) : Promise.resolve("none" as const),
  ]);

  const rated = visible
    ? await prisma.albumLog.findMany({
        where: { userId: profile.id, rating: { not: null } },
        orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
        take: 60,
        select: {
          id: true, mbid: true, itemType: true, albumTitle: true,
          artistName: true, coverUrl: true, rating: true,
        },
      })
    : [];

  const counts = visible
    ? await prisma.albumLog.groupBy({
        by: ["status"],
        where: { userId: profile.id },
        _count: { _all: true },
      })
    : [];
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex items-start gap-4">
        <Avatar {...profile} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-medium text-zinc-100">
            {profile.name ?? profile.handle}
          </h1>
          <p className="text-xs text-zinc-600">@{profile.handle}</p>
          {profile.bio && (
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{profile.bio}</p>
          )}
          {visible && (
            <p className="mt-2 text-[11px] text-zinc-600 tabular-nums">
              {total} saved · {rated.length} rated
            </p>
          )}
        </div>
        {viewerId && state !== "self" && (
          <FriendButton personId={profile.id} state={state} />
        )}
      </header>

      {!visible ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-xs leading-relaxed text-zinc-400">
            This profile is private.{" "}
            {viewerId
              ? state === "request_sent"
                ? "Your friend request is waiting to be accepted."
                : "Send a friend request to see what they have rated."
              : (
                <>
                  <Link href="/login" className="text-brand-500 underline underline-offset-2">
                    Sign in
                  </Link>{" "}
                  to send a friend request.
                </>
              )}
          </p>
        </div>
      ) : rated.length === 0 ? (
        <p className="text-xs text-zinc-600">Nothing rated yet.</p>
      ) : (
        <section>
          <h2 className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
            Highest rated
          </h2>
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
            {rated.map((item) => (
              <div key={item.id}>
                <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-800">
                  {item.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverUrl}
                      alt={item.albumTitle}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-2">
                      <span className="line-clamp-3 text-center text-[10px] leading-snug text-zinc-500">
                        {item.albumTitle}
                      </span>
                    </div>
                  )}
                  <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-full bg-brand-500/60 px-2 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-md [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]">
                    {item.rating!.toFixed(1)}
                  </span>
                </div>
                {item.itemType === "ALBUM" ? (
                  <Link
                    href={`/album/${item.mbid}`}
                    className="mt-2 block truncate text-xs text-zinc-200 hover:text-white"
                  >
                    {item.albumTitle}
                  </Link>
                ) : (
                  <p className="mt-2 truncate text-xs text-zinc-200">{item.albumTitle}</p>
                )}
                <p className="truncate text-xs text-zinc-500">{item.artistName}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
