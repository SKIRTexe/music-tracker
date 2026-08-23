"use client";

import { saveToLibrary, removeFromLibrary, type LibraryItemInput } from "@/app/actions";
import type { ExistingEntry } from "@/lib/library";

export const STATUS_LABELS: Record<string, string> = {
  LISTENED: "Listened",
  LISTENING: "Listening",
  WANT: "Want to listen",
};

const STATUSES = ["LISTENED", "LISTENING", "WANT"] as const;

/**
 * The + menu: pick a status, or remove. Nothing else.
 *
 * Rating deliberately does not live here. It used to, and the rate prompt was
 * rendered *inside* this popover — which broke it: the prompt portals to
 * `document.body`, so it sits outside the card's ref, and the card's
 * outside-press handler closed the menu on `pointerdown` and unmounted the
 * prompt with it, before any button in it could be clicked. The prompt now
 * belongs to the card, whose own state survives the menu closing.
 *
 * Shared by album and song cards and by album tracklist rows, so every surface
 * saves the same way — the caller supplies the item and positions the popover.
 */
export function RatePopover({
  item,
  saved,
  onSaved,
  onClose,
  onPromptRate,
  className = "",
}: {
  item: LibraryItemInput;
  saved: ExistingEntry | null;
  onSaved: (next: ExistingEntry | null) => void;
  onClose: () => void;
  /** Ask the card to open the rate prompt, once the status has been written. */
  onPromptRate?: () => void;
  className?: string;
}) {
  /**
   * Marking something Listened is the moment you have an opinion, so that is
   * when to ask for one — but only the first time. Re-marking an already-rated
   * item as Listened is not a request to re-rate it.
   *
   * The prompt opens *after* the write lands: both paths upsert the same row,
   * and firing them together races two writes at one record.
   */
  const handleStatus = (status: string) => {
    onSaved({ status, rating: saved?.rating ?? null });
    const prompt = status === "LISTENED" && saved?.rating == null;
    onClose();

    void saveToLibrary(item, status)
      .then(() => {
        if (prompt) onPromptRate?.();
      })
      .catch((err) => console.error("saveToLibrary failed:", err));
  };

  const handleRemove = () => {
    onSaved(null);
    onClose();
    void removeFromLibrary(
      item.mbid,
      item.itemType === "SONG" ? { title: item.title, artistName: item.artistName } : undefined
    ).catch((err) => console.error("removeFromLibrary failed:", err));
  };

  return (
    <div
      // max-w keeps it inside the viewport on a narrow phone, where a card is
      // barely wider than the popover itself.
      className={`z-30 w-44 max-w-[calc(100vw-1.5rem)] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 ${className}`}
    >
      <div className="flex flex-col gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => handleStatus(s)}
            className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded transition-colors ${
              saved?.status === s
                ? "bg-zinc-600 text-zinc-100"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {saved && (
        <button
          onClick={handleRemove}
          className="mt-2.5 w-full border-t border-zinc-800 pt-2 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Remove from library
        </button>
      )}
    </div>
  );
}
