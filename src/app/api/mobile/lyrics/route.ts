import { NextResponse } from "next/server";
import { getLyrics } from "@/lib/lyrics";
import { clientKey, memoryLimit, tooMany } from "@/lib/rate-limit";

/**
 * Lyrics for one track.
 *
 * Unauthenticated, like the rest of the catalogue: reading the words to a song
 * is not something an account should be required for. Rate limited in memory,
 * because this is a cheap frequent read and a database round trip would cost
 * more than the abuse it prevents.
 */
export const GET = async (req: Request) => {
  const gate = memoryLimit(clientKey(req, "lyrics"), 90, 60_000);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const params = new URL(req.url).searchParams;
  const artist = params.get("artist");
  const track = params.get("track");
  if (!artist || !track) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const duration = Number(params.get("duration"));

  return NextResponse.json(
    await getLyrics({
      artist,
      track,
      album: params.get("album") ?? undefined,
      duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    })
  );
};
