"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";
import FiltersBar, { type FiltersState, type FilterOptions } from "@/components/FiltersBar";
import LeaderboardView from "@/components/LeaderboardView";
import BrowseView from "@/components/BrowseView";
import RobustnessView from "@/components/RobustnessView";
import TopStrategiesView from "@/components/TopStrategiesView";
import TagStrategiesView from "@/components/TagStrategiesView";
import CompareTimeframesView from "@/components/CompareTimeframesView";
import PlaybookView from "@/components/PlaybookView";

const EMPTY_FILTERS: FiltersState = {
  strategy_name: [], ticker: [], timeframe: [], depth: [],
  strategy_family: [], strategy_setup: [], ticker_tag: [],
  watchlist: [],
  min_trades: 5,
};

const VIEW_TITLES: Record<string, string> = {
  leaderboard: "Leaderboard",
  browse: "Browse",
  robustness: "Robustness",
  "top-strategies": "Top Strategies",
  "tag-strategies": "Top Strategies by Tag",
  compare: "Compare",
  playbook: "Day-Trading Playbook",
};

export default function Home() {
  const [view, setView] = useState("leaderboard");
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  // Watchlist is app-wide scope rather than per-view state: picking one in
  // the header narrows every view at once. It lives inside `filters` too,
  // so it rides along on the API calls that already send filters.
  const watchlist = filters.watchlist[0] ?? "";

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((data) => {
        setOptions(data);
        setTotalRows(data.total_rows);
      });
  }, []);

  // The ticker universe every view picks from. IBKR lists carry symbols
  // that were never backtested, so scope to the ones with data.
  const scopedTickers = useMemo(() => {
    const all = options?.tickers ?? [];
    if (!watchlist) return all;
    const wl = options?.watchlists?.find((w) => w.name === watchlist);
    if (!wl) return all;
    const inList = new Set(wl.tickers_in_data);
    return all.filter((t) => inList.has(t));
  }, [options, watchlist]);

  function onWatchlistChange(name: string) {
    // Drop any explicitly picked tickers that fall outside the new scope,
    // otherwise the two filters AND together into an empty result.
    const wl = options?.watchlists?.find((w) => w.name === name);
    const inList = wl ? new Set(wl.tickers_in_data) : null;
    setFilters((f) => ({
      ...f,
      watchlist: name ? [name] : [],
      ticker: inList ? f.ticker.filter((t) => inList.has(t)) : f.ticker,
    }));
  }

  const showFilters = view === "leaderboard" || view === "browse";

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        active={view}
        onSelect={setView}
        totalRows={totalRows}
        watchlists={options?.watchlists ?? []}
        watchlist={watchlist}
        onWatchlistChange={onWatchlistChange}
        totalTickers={options?.tickers.length ?? 0}
      />

      <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
          <h2 className="text-xl font-semibold">{VIEW_TITLES[view]}</h2>

          {showFilters && (
            <FiltersBar
              filters={filters}
              options={options}
              onChange={setFilters}
              scopedTickers={scopedTickers}
            />
          )}

          {view === "leaderboard" && <LeaderboardView filters={filters} />}
          {view === "browse" && <BrowseView filters={filters} />}
          {view === "robustness" && (
            <RobustnessView watchlist={watchlist} watchlistTickers={scopedTickers} />
          )}
          {view === "top-strategies" && <TopStrategiesView tickers={scopedTickers} />}
          {view === "tag-strategies" && <TagStrategiesView />}
          {view === "compare" && <CompareTimeframesView tickers={scopedTickers} />}
          {view === "playbook" && (
            <PlaybookView watchlist={watchlist} watchlistTickers={scopedTickers} />
          )}
        </div>
      </main>
    </div>
  );
}
