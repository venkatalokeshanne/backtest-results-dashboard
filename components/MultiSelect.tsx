"use client";

import { useEffect, useRef, useState } from "react";

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  }

  const display =
    selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div className="relative min-w-[9rem]" ref={ref}>
      <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          selected.length
            ? "border-accent-dim/60 bg-accent-soft text-accent"
            : "border-border bg-surface-raised text-text hover:border-text-faint"
        }`}
      >
        <span className="truncate">{display}</span>
        <svg className="h-3 w-3 shrink-0 text-text-faint" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 flex max-h-72 w-56 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent-dim"
            />
          </div>
          <div className="flex gap-3 border-b border-border px-3 py-1.5 text-xs">
            <button className="text-accent hover:underline" onClick={() => onChange(options)}>
              Select all
            </button>
            <button className="text-text-dim hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-text-faint">No matches</div>
            )}
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
