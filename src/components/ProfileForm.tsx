"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { saveProfile } from "@/app/social-actions";

const FIELD =
  "w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none sm:text-sm";

export function ProfileForm({
  handle, name, bio, image, isPublic,
}: {
  handle: string;
  name: string;
  bio: string;
  image: string;
  isPublic: boolean;
}) {
  const [form, setForm] = useState({ handle, name, bio, image, isPublic });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setError(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveProfile(form);
          if (result.error) setError(result.error);
          else setSaved(true);
        });
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <Avatar name={form.name} handle={form.handle} image={form.image} size={56} />
        <div className="min-w-0 flex-1">
          <label className="block text-[11px] text-zinc-500">
            Picture link
            <input
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://…"
              autoComplete="off"
              className={`mt-1 ${FIELD}`}
            />
          </label>
          {/* Said plainly rather than hidden behind a broken image: there is no
              upload yet, and pretending otherwise wastes the user's time. */}
          <p className="mt-1 text-[10px] text-zinc-600">
            Paste a link to an image. Uploading isn&rsquo;t supported yet.
          </p>
        </div>
      </div>

      <label className="block text-[11px] text-zinc-500">
        Handle
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm text-zinc-600">@</span>
          <input
            value={form.handle}
            onChange={(e) => set("handle", e.target.value.toLowerCase())}
            placeholder="yourname"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={FIELD}
          />
        </div>
        <span className="mt-1 block text-[10px] text-zinc-600">
          How friends find you. Letters, numbers and underscores, 3–20 characters.
        </span>
      </label>

      <label className="block text-[11px] text-zinc-500">
        Display name
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Optional"
          className={`mt-1 ${FIELD}`}
        />
      </label>

      <label className="block text-[11px] text-zinc-500">
        Bio
        <textarea
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Optional"
          className={`mt-1 ${FIELD} resize-none`}
        />
      </label>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => set("isPublic", e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
          />
          <span className="text-[11px] leading-relaxed text-zinc-400">
            <span className="block text-zinc-200">Public profile</span>
            {/* Both halves stated, because the default is the private one and a
                user should know what they are turning on rather than what they
                are turning off. */}
            Anyone with your handle can see what you have saved and rated. Leave
            this off and only friends you accept can.
          </span>
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {saved && (
          <span className="text-[11px] text-zinc-500">
            Saved.{" "}
            {form.handle && (
              <Link
                href={`/u/${form.handle}`}
                className="text-brand-500 underline underline-offset-2"
              >
                View profile
              </Link>
            )}
          </span>
        )}
      </div>
    </form>
  );
}
