"use server";

import { signOut } from "@/lib/auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeAppleAccess } from "@/lib/apple-auth";

/**
 * Delete the signed-in account and everything attached to it.
 *
 * The same operation the app exposes, and it has to exist in both places: App
 * Store review requires it in the app, and someone who signed up on the website
 * should not have to install an app to leave.
 *
 * One row. Every table referencing a user does so with `onDelete: Cascade`, so
 * the library, events, reviews, playlist rows, sessions and linked provider
 * accounts go with it — inside the database, with no list here to fall out of
 * date as tables are added. `MbCache` and `ArtistMeta` deliberately stay: they
 * are facts about records, not about people.
 */
// `void` in the union rather than `never`: `signOut` ends the request by
// throwing a redirect, which TypeScript cannot see, so a bare `never` makes the
// function look like it falls off the end.
export async function deleteMyAccount(): Promise<{ error: string } | void> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in." };

  const userId = session.user.id;

  try {
    // While the refresh token is still readable. Apple requires that deleting
    // an account also revokes the Sign in with Apple grant.
    await revokeAppleAccess(userId).catch(() => {});
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    console.error("delete account:", err instanceof Error ? err.message : err);
    return { error: "Could not delete the account. Please try again." };
  }

  // Outside the try: `signOut` redirects by throwing, and catching that here
  // would turn a successful deletion into an error message.
  await signOut({ redirectTo: "/" });
}
