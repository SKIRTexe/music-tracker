import { NextRequest, NextResponse } from "next/server";
import { getLocationTopGenres } from "@/lib/musicbrainz";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const isCountry = req.nextUrl.searchParams.get("country") === "1";
  if (!slug) return NextResponse.json({ genres: [] });

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "8");
  const genres = await getLocationTopGenres(slug, isCountry, isNaN(limit) ? 8 : limit, "low");
  return NextResponse.json({ genres });
}
