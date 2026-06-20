export async function getWikipediaSummary(query: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(query.replace(/ /g, "_"));
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === "disambiguation") return null;
    return (data.extract as string) ?? null;
  } catch {
    return null;
  }
}
