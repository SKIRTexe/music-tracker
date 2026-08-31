"use client";

import { useState, useTransition } from "react";
import { searchPeople } from "@/app/social-actions";
import { PersonRow } from "@/components/PersonRow";
import type { Person } from "@/lib/social";

export function PeopleSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => setResults(await searchPeople(query)));
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="@handle or name"
          autoComplete="off"
          className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none sm:text-sm"
        />
        <button
          type="submit"
          disabled={pending || query.trim().length < 2}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
        >
          {pending ? "…" : "Search"}
        </button>
      </form>

      {results !== null && (
        results.length === 0 ? (
          <p className="py-2 text-xs text-zinc-600">
            Nobody found. Handles have to match from the start — try the whole thing.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {results.map((p) => (
              <PersonRow key={p.id} person={p} action="add" />
            ))}
          </ul>
        )
      )}
    </div>
  );
}
