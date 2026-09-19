"use client";

import type { Watchlist } from "./FiltersBar";

/** App-wide ticker scope, sourced from the user's Interactive Brokers
 * watchlists (see config/watchlists.json). Every list currently shipped
 * covers part of the dataset, but a list can still resolve to nothing
 * after a refresh — IBKR lists routinely hold futures, forex and non-US
 * listings that were never backtested. Those are offered but disabled
 * rather than hidden, so the reason a list can't be scoped to is visible
 * instead of the list silently going missing. */
export default function WatchlistSelect({
  watchlists,
  value,
  onChange,
  totalTickers,
}: {
  watchlists: Watchlist[];
  value: string;
  onChange: (name: string) => void;
  totalTickers: number;
}) {
  const active = watchlists.find((w) => w.name === value);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={
          active
            ? `${active.tickers_in_data.length} of ${active.tickers.length} symbols on this IBKR list have backtest data`
            : "Every ticker in the dataset"
        }
        className={`w-56 appearance-none rounded-lg border py-2 pl-3 pr-9 text-sm font-medium outline-none ${
          active
            ? "border-accent-dim/60 bg-accent-soft text-accent focus:border-accent"
            : "border-border bg-surface-raised text-text focus:border-accent-dim"
        }`}
      >
        <option value="">All tickers ({totalTickers})</option>
        {watchlists.map((w) => {
          const n = w.tickers_in_data.length;
          return (
            <option key={w.name} value={w.name} disabled={n === 0}>
              {w.name} ({n === 0 ? "no data" : n})
            </option>
          );
        })}
      </select>
      <svg
        viewBox="0 0 12 12"
        fill="none"
        className={`pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 ${
          active ? "text-accent" : "text-text-faint"
        }`}
      >
        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
