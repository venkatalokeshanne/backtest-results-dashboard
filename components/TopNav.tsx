"use client";

import WatchlistSelect from "./WatchlistSelect";
import type { Watchlist } from "./FiltersBar";

export const NAV = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "browse", label: "Browse" },
  { key: "robustness", label: "Robustness" },
  { key: "top-strategies", label: "Top Strategies" },
  { key: "tag-strategies", label: "By Tag" },
  { key: "compare", label: "Compare" },
  { key: "playbook", label: "Day-Trading Playbook" },
];

export default function TopNav({
  active,
  onSelect,
  totalRows,
  watchlists,
  watchlist,
  onWatchlistChange,
  totalTickers,
}: {
  active: string;
  onSelect: (key: string) => void;
  totalRows: number | null;
  watchlists: Watchlist[];
  watchlist: string;
  onWatchlistChange: (name: string) => void;
  totalTickers: number;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M3 17l5-5 4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Backtests</h1>
          <p className="text-[0.7rem] text-text-faint">
            {totalRows != null ? `${totalRows.toLocaleString()} rows` : "loading…"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <WatchlistSelect
          watchlists={watchlists}
          value={watchlist}
          onChange={onWatchlistChange}
          totalTickers={totalTickers}
        />

      <div className="relative">
        <select
          value={active}
          onChange={(e) => onSelect(e.target.value)}
          className="w-52 appearance-none rounded-lg border border-accent-dim/60 bg-accent-soft py-2 pl-3 pr-9 text-sm font-medium text-accent outline-none focus:border-accent"
        >
          {NAV.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </select>
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-accent"
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      </div>
    </header>
  );
}
