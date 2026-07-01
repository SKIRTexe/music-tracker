import { NextRequest, NextResponse } from "next/server";
import { getArtist } from "@/lib/musicbrainz";

export async function GET(req: NextRequest) {
  const mbid = req.nextUrl.searchParams.get("mbid");
  if (!mbid) return NextResponse.json({ locationTags: [] });

  try {
    const artist = await getArtist(mbid);

    const locationTags: { label: string; slug: string }[] = [];
    const seen = new Set<string>();
    const add = (label: string, slug: string) => {
      if (!seen.has(label)) { seen.add(label); locationTags.push({ label, slug }); }
    };

    if (artist.country) {
      try {
        const name = new Intl.DisplayNames(["en"], { type: "region" }).of(artist.country);
        if (name) add(name, artist.country);
      } catch { /* unsupported code */ }
    }
    if (artist.area?.name) add(artist.area.name, artist.area.name);
    if (artist["begin-area"]?.name && artist["begin-area"].name !== artist.area?.name)
      add(artist["begin-area"].name, artist["begin-area"].name);

    return NextResponse.json({ locationTags });
  } catch {
    return NextResponse.json({ locationTags: [] });
  }
}
