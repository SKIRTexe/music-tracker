"use client";

import { useState } from "react";

interface ExpandableTextProps {
  text: string;
  initialParagraphs?: number;
}

export function ExpandableText({ text, initialParagraphs = 3 }: ExpandableTextProps) {
  const paragraphs = text.split("\n").filter((p) => p.trim().length > 0);
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? paragraphs : paragraphs.slice(0, initialParagraphs);
  const hidden = paragraphs.length - initialParagraphs;

  return (
    <div>
      <div className="space-y-3">
        {visible.map((p, i) => (
          <p key={i} className="text-sm text-zinc-400 leading-relaxed">
            {p}
          </p>
        ))}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          {expanded
            ? "Show less"
            : `Read more (${hidden} more paragraph${hidden !== 1 ? "s" : ""})`}
        </button>
      )}
    </div>
  );
}
