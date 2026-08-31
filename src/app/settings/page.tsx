import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RankingToggle } from "@/components/RankingToggle";
import { StatsModulesForm } from "@/components/StatsModulesForm";
import { DeleteAccount } from "@/components/DeleteAccount";
import { ProfileForm } from "@/components/ProfileForm";
import { RANKING_MIN_RATED } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/**
 * Everything that changes how the app behaves for one account.
 *
 * Preferences live here rather than beside the thing they affect: the ranking
 * switch used to sit on `/library`, where it read as part of the library rather
 * than as a setting, and the stats switches have no single page to sit beside at
 * all.
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, ratedAlbums, savedItems] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        rankingEnabled: true, statsHidden: true,
        handle: true, name: true, bio: true, image: true, isPublic: true,
      },
    }),
    prisma.albumLog.count({
      where: { userId: session.user.id, itemType: "ALBUM", rating: { not: null } },
    }),
    prisma.albumLog.count({ where: { userId: session.user.id } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-lg font-medium text-zinc-200">Settings</h1>
        <p className="mt-0.5 text-xs text-zinc-600">Only affects your account.</p>
      </header>

      <section>
        <div className="mb-3">
          <h2 className="text-[10px] uppercase tracking-widest text-zinc-500">Profile</h2>
          <p className="mt-1 text-[11px] leading-snug text-zinc-600">
            Your handle is how friends find you. Nothing here is public unless you
            switch the profile to public below.
          </p>
        </div>
        <ProfileForm
          handle={user?.handle ?? ""}
          name={user?.name ?? ""}
          bio={user?.bio ?? ""}
          image={user?.image ?? ""}
          isPublic={user?.isPublic ?? false}
        />
      </section>

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Rating</h2>
        <RankingToggle
          enabled={!!user?.rankingEnabled}
          ratedAlbums={ratedAlbums}
          minRated={RANKING_MIN_RATED}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[10px] uppercase tracking-widest text-zinc-500">
            Stats page
          </h2>
          <Link
            href="/stats"
            className="rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-brand-500 ring-1 ring-inset ring-white/10 transition-colors hover:ring-white/20"
          >
            Open stats →
          </Link>
        </div>
        <div className="mb-3">
          <p className="mt-1 text-[11px] leading-snug text-zinc-600">
            Switch off anything you don&rsquo;t care about. Hiding a block only stops it
            being drawn — the data keeps being collected either way, so nothing is lost
            by turning something off and back on later.{" "}
            <Link
              href="/stats"
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              View stats
            </Link>
          </p>
        </div>

        <StatsModulesForm hidden={user?.statsHidden ?? []} />
      </section>

      {/* Last, and visually separated. Required in the app by App Store review,
          and offered here for the same reason it is there: someone who signed up
          on the website should not have to install an app to leave. */}
      <section className="border-t border-zinc-900 pt-8">
        <div className="mb-3">
          <h2 className="text-[10px] uppercase tracking-widest text-zinc-500">Account</h2>
          <p className="mt-1 text-[11px] leading-snug text-zinc-600">
            Deleting removes your library, your ratings and every record of them.
            There is no export yet, so take anything you want to keep first.
          </p>
        </div>
        <DeleteAccount savedItems={savedItems} />
      </section>
    </div>
  );
}
