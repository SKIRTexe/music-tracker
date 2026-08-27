import { NextResponse } from "next/server";
import { getArtist, artistAlbums, CatalogNotFound } from "@/lib/catalog";
import { getExistingEntries } from "@/lib/library";
import { userIdFromRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { artistAlbumPopularity, withDeadline } from "@/lib/popularity";
import { after } from "next/server";

/**
 * An artist and their studio discography, oldest first.
 *
 * Genres come from the `ArtistMeta` cache rather than the catalogue: Spotify
 * withdrew `genres` from `GET /artists/{id}` in 2026 — the field is absent, not
 * empty — so asking Spotify for them returns nothing at all, silently. The cache
 * is filled by background enrichment from MusicBrainz. An artist nobody has saved
 * anything by therefore has no genres here yet, which is correct: there is no
 * source that could answer without a rate-limited lookup this request must not make.
 */
export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  let artist;
  try {
    artist = await getArtist(id);
  } catch (err) {
    if (err instanceof CatalogNotFound) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("mobile artist:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "catalog_error" }, { status: 502 });
  }

  // One cached request covers the whole discography. Bounded the same way as the
  // album page: a discography without fan counts is still a discography.
  const lookup = artistAlbumPopularity(artist.name);
  after(async () => {
    await lookup.catch(() => {});
  });

  const [albums, meta, popularity] = await Promise.all([
    artistAlbums(id),
    prisma.artistMeta.findUnique({ where: { artistId: id }, select: { genres: true } }),
    withDeadline(lookup, {} as Record<string, number>),
  ]);

  const userId = (await userIdFromRequest(req)) ?? undefined;
  const byId = await getExistingEntries(userId, albums.map((a) => a.id));

  return NextResponse.json({
    ...artist,
    genres: artist.genres.length ? artist.genres : meta?.genres ?? [],
    albums,
    existing: Object.fromEntries(byId),
    popularity,
  });
};
