import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { friendsOf, pendingRequests } from "@/lib/social";
import { PersonRow } from "@/components/PersonRow";
import { PeopleSearch } from "@/components/PeopleSearch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Friends — Recordcrate" };

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [friends, requests, me] = await Promise.all([
    friendsOf(session.user.id),
    pendingRequests(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { handle: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-lg font-medium text-zinc-200">Friends</h1>
        <p className="mt-0.5 text-xs text-zinc-600">
          See what people you know are listening to and how they rated it.
        </p>
      </header>

      {/* Without a handle nobody can find you, so this is the first thing that
          needs doing rather than a note further down the page. */}
      {!me?.handle && (
        <div className="rounded-lg border border-brand-900/60 bg-brand-900/10 p-4">
          <p className="text-xs leading-relaxed text-zinc-300">
            You need a handle before anyone can find you.{" "}
            <Link href="/settings" className="text-brand-500 underline underline-offset-2">
              Pick one in Settings
            </Link>
            .
          </p>
        </div>
      )}

      {requests.length > 0 && (
        <section>
          <h2 className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
            Requests
            <span className="ml-2 text-zinc-700 tabular-nums">{requests.length}</span>
          </h2>
          <ul className="divide-y divide-zinc-900">
            {requests.map((p) => (
              <PersonRow key={p.id} person={p} action="accept" />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Find people</h2>
        <PeopleSearch />
      </section>

      <section>
        <h2 className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
          Your friends
          {friends.length > 0 && (
            <span className="ml-2 text-zinc-700 tabular-nums">{friends.length}</span>
          )}
        </h2>
        {friends.length === 0 ? (
          <p className="py-3 text-xs text-zinc-600">
            Nobody yet. Search for a handle above.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {friends.map((p) => (
              <PersonRow key={p.id} person={p} action="remove" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
