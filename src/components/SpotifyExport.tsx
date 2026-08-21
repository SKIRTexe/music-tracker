"use client";

import { useState, useTransition } from "react";
import { exportWantToListen, disconnectSpotify, type ExportReport } from "@/app/spotify-actions";

export function SpotifyExport({
  connected,
  configured,
  wantCount,
  notice,
}: {
  connected: boolean;
  configured: boolean;
  wantCount: number;
  notice?: string;
}) {
  const [report, setReport] = useState<ExportReport | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!configured) {
    return (
      <p className="text-[11px] text-zinc-700">
        Spotify export needs <code className="text-zinc-600">SPOTIFY_CLIENT_ID</code> — see DEPLOY.md
      </p>
    );
  }

  const noticeText: Record<string, string> = {
    linked: "Spotify connected.",
    denied: "Spotify connection cancelled.",
    badstate: "Connection failed a security check — please try again.",
    failed: "Could not connect to Spotify. Please try again.",
  };

  const handleExport = () => {
    startTransition(async () => {
      setReport(await exportWantToListen());
      setOpen(true);
    });
  };

  return (
    <div className="text-right">
      {notice && noticeText[notice] && (
        <p className="text-[11px] text-zinc-500 mb-1">{noticeText[notice]}</p>
      )}

      {!connected ? (
        <a
          href="/api/spotify/login"
          className="inline-block text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 transition-colors"
        >
          Connect Spotify
        </a>
      ) : (
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={handleExport}
            disabled={isPending || wantCount === 0}
            className="text-xs px-3 py-2 bg-zinc-100 hover:bg-white rounded text-zinc-900 font-medium transition-colors disabled:opacity-40"
          >
            {isPending
              ? "Exporting…"
              : `Export ${wantCount} to Spotify`}
          </button>
          <button
            onClick={() => startTransition(async () => { await disconnectSpotify(); })}
            disabled={isPending}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}

      {report && open && (
        <div className="mt-3 text-left bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className={`text-xs ${report.ok ? "text-zinc-200" : "text-red-400"}`}>
              {report.message}
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Dismiss"
              className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0"
            >
              ✕
            </button>
          </div>

          {report.playlistUrl && (
            <a
              href={report.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-300 hover:text-zinc-100 underline underline-offset-2"
            >
              Open playlist in Spotify →
            </a>
          )}

          {report.matched.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-zinc-500 cursor-pointer">
                Matched {report.matched.length}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {report.matched.map((m) => (
                  <li key={m.label} className="text-[11px] text-zinc-500">
                    {m.matchedAs}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {report.missing.length > 0 && (
            <details className="mt-2" open>
              <summary className="text-[11px] text-zinc-500 cursor-pointer">
                Not found on Spotify ({report.missing.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {report.missing.map((m) => (
                  <li key={m} className="text-[11px] text-zinc-600">{m}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
