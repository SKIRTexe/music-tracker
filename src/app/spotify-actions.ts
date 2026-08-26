"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  exportWantToListenFor,
  disconnectSpotifyFor,
  type ExportReport,
} from "@/lib/spotify-export";

/**
 * The website's Spotify mutations.
 *
 * The work itself is in `src/lib/spotify-export.ts`, taking an explicit user id,
 * so the iOS client reaches the same sync with a bearer token. What is left here
 * is the session and the revalidation.
 */

export type { ExportReport };

export async function exportWantToListen(): Promise<ExportReport> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      message: "Please sign in.",
      matched: [],
      missing: [],
      added: 0,
      removed: 0,
      alreadyPresent: 0,
    };
  }
  const report = await exportWantToListenFor(session.user.id);
  revalidatePath("/library");
  return report;
}

export async function disconnectSpotify(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await disconnectSpotifyFor(session.user.id);
  revalidatePath("/library");
}
