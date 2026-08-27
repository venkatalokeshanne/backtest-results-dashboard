"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import FiltersBar, { type FiltersState, type FilterOptions } from "@/components/FiltersBar";
import LeaderboardView from "@/components/LeaderboardView";
import BrowseView from "@/components/BrowseView";
import RobustnessView from "@/components/RobustnessView";
import TopStrategiesView from "@/components/TopStrategiesView";
import TagStrategiesView from "@/components/TagStrategiesView";

const EMPTY_FILTERS: FiltersState = {
  strategy_name: [], ticker: [], timeframe: [], depth: [],
  strategy_family: [], strategy_setup: [], ticker_tag: [],
  min_trades: 5,
};

const VIEW_TITLES: Record<string, string> = {
  leaderboard: "Leaderboard",
  browse: "Browse",
  robustness: "Robustness",
  "top-strategies": "Top Strategies",
  "tag-strategies": "Top Strategies by Tag",
};

export default function Home() {
  const [view, setView] = useState("leaderboard");
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((data) => {
        setOptions(data);
        setTotalRows(data.total_rows);
      });
  }, []);

  const showFilters = view === "leaderboard" || view === "browse";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar active={view} onSelect={setView} totalRows={totalRows} />

      <main className="flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
          <h2 className="text-xl font-semibold">{VIEW_TITLES[view]}</h2>

          {showFilters && <FiltersBar filters={filters} options={options} onChange={setFilters} />}

          {view === "leaderboard" && <LeaderboardView filters={filters} />}
          {view === "browse" && <BrowseView filters={filters} />}
          {view === "robustness" && <RobustnessView />}
          {view === "top-strategies" && <TopStrategiesView tickers={options?.tickers ?? []} />}
          {view === "tag-strategies" && <TagStrategiesView />}
        </div>
      </main>
    </div>
  );
}
