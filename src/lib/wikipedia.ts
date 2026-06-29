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

export async function getWikipediaArticle(
  query: string
): Promise<{ intro: string | null; history: string | null }> {
  try {
    // Step 1 — resolve canonical title, catch disambiguation pages
    const encoded = encodeURIComponent(query.replace(/ /g, "_"));
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { next: { revalidate: 86400 } }
    );
    if (!summaryRes.ok) return { intro: null, history: null };
    const summary = await summaryRes.json();
    if (summary.type === "disambiguation") return { intro: null, history: null };

    // Step 2 — fetch the full article as plain text
    // Wikipedia Action API requires a descriptive User-Agent
    const title = encodeURIComponent(summary.title);
    const articleRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=extracts&explaintext=true&format=json&formatversion=2`,
      {
        headers: { "User-Agent": "Recordcrate/0.1 (recordcrate app; contact@example.com)" },
        next: { revalidate: 86400 },
      }
    );
    if (!articleRes.ok) return { intro: summary.extract ?? null, history: null };
    const articleData = await articleRes.json();

    const fullText: string = articleData.query?.pages?.[0]?.extract ?? "";
    if (!fullText) return { intro: summary.extract ?? null, history: null };

    // Step 3 — walk lines, split intro from sections
    const introLines: string[] = [];
    let inIntro = true;
    const historyLines: string[] = [];
    let inHistory = false;
    const HISTORY_KEYWORDS = ["history", "career", "background", "biography", "formation"];

    for (const line of fullText.split("\n")) {
      const heading = line.match(/^={2,}\s*(.+?)\s*={2,}$/);
      if (heading) {
        inIntro = false;
        const h = heading[1].toLowerCase();
        inHistory = HISTORY_KEYWORDS.some((k) => h.includes(k));
      } else if (inIntro) {
        introLines.push(line);
      } else if (inHistory) {
        historyLines.push(line);
      }
    }

    const intro = introLines.join("\n").trim() || summary.extract || null;
    const history = historyLines.join("\n").trim() || null;

    return { intro, history };
  } catch {
    return { intro: null, history: null };
  }
}
