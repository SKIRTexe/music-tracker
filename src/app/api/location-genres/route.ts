import { NextRequest, NextResponse } from "next/server";
import { getLocationTopGenres } from "@/lib/musicbrainz";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const isCountry = req.nextUrl.searchParams.get("country") === "1";
  if (!slug) return NextResponse.json({ genres: [] });

  const genres = await getLocationTopGenres(slug, isCountry, 8, "low");
  return NextResponse.json({ genres });
}
