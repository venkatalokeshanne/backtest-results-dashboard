"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import DataTable, { confidenceBadge, numClass, type Column } from "./DataTable";
import { useSort } from "@/lib/sort";

const TIMEFRAMES = [
  { key: "5m", label: "5 min" },
  { key: "15m", label: "15 min" },
  { key: "1h", label: "1 hour" },
  { key: "daily", label: "Daily" },
];

const CONF_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, "NO EDGE": 3 };

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(2);
}

type RobData = { tickers: any[]; strategies: any[]; concentration: any[]; no_edge: any[] };

export default function RobustnessView() {
  const [tf, setTf] = useState("5m");
  const [cache, setCache] = useState<Record<string, RobData>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState("");

  useEffect(() => {
    if (cache[tf]) return;
    setLoading(true);
    fetch(`/api/robustness?tf=${tf}`)
      .then((r) => r.json())
      .then((data) => setCache((c) => ({ ...c, [tf]: data })))
      .finally(() => setLoading(false));
  }, [tf, cache]);

  const data = cache[tf];

  const tickers = useMemo(() => {
    if (!data) return [];
    let rows = data.tickers;
    if (search) rows = rows.filter((r) => r.ticker?.toUpperCase().includes(search.toUpperCase()));
    if (confFilter) rows = rows.filter((r) => r.confidence === confFilter);
    return [...rows].sort((a, b) => (CONF_ORDER[a.confidence] ?? 4) - (CONF_ORDER[b.confidence] ?? 4));
  }, [data, search, confFilter]);

  const summary = useMemo(() => {
    if (!data) return { high: 0, medium: 0, low: 0, noEdge: 0 };
    const counts = { high: 0, medium: 0, low: 0, noEdge: 0 };
    for (const r of data.tickers) {
      if (r.confidence === "HIGH") counts.high++;
      else if (r.confidence === "MEDIUM") counts.medium++;
      else if (r.confidence === "LOW") counts.low++;
      else counts.noEdge++;
    }
    return counts;
  }, [data]);

  const tickerColumns: Column[] = [
    { key: "ticker", label: "Ticker", sortable: true },
    { key: "primary_strategy", label: "Primary Strategy", sortable: true },
    { key: "backup_strategy", label: "Backup Strategy", sortable: true },
    { key: "strategy_family", label: "Family", sortable: true },
    { key: "robustness_score", label: "Score", align: "right", sortable: true, render: fmt },
    { key: "confidence", label: "Confidence", sortable: true, render: confidenceBadge },
    { key: "median_sharpe", label: "Med. Sharpe", align: "right", sortable: true, render: fmt },
    { key: "median_expectancy", label: "Med. Expectancy", align: "right", sortable: true, render: fmt },
    { key: "median_net_profit_pct", label: "Avg Perf %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "median_asset_perf", label: "Avg Asset Perf %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "median_max_dd", label: "Med. Max DD", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "median_trades", label: "Med. Trades", align: "right", sortable: true, render: fmt },
    { key: "depths_positive", label: "Depths +", align: "center", sortable: true },
    { key: "reason", label: "Reason", sortable: true },
  ];

  const strategyColumns: Column[] = [
    { key: "strategy", label: "Strategy", sortable: true },
    { key: "n_tickers_selected", label: "Tickers Won", align: "right", sortable: true },
    { key: "avg_robustness", label: "Avg Score", align: "right", sortable: true, render: fmt },
    { key: "median_sharpe", label: "Med. Sharpe", align: "right", sortable: true, render: fmt },
    { key: "avg_net_profit_pct", label: "Avg Perf %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "avg_asset_perf_pct", label: "Avg Asset Perf %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "median_dd", label: "Med. DD", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "median_trades", label: "Med. Trades", align: "right", sortable: true, render: fmt },
    { key: "best_use", label: "Example Tickers", sortable: true },
  ];

  const noEdgeColumns: Column[] = [
    { key: "ticker", label: "Ticker", sortable: true },
    { key: "best_strategy_attempted", label: "Best Attempted", sortable: true },
    { key: "score", label: "Score", align: "right", sortable: true, render: fmt },
    { key: "main_problem", label: "Main Problem", sortable: true },
  ];

  const tickerSort = useSort(tickers);
  const strategySort = useSort(data?.strategies ?? []);
  const noEdgeSort = useSort(data?.no_edge ?? []);

  const chartData = (data?.concentration ?? []).slice(0, 10).map((r) => ({
    name: r.strategy.length > 22 ? r.strategy.slice(0, 20) + "…" : r.strategy,
    tickers: Number(r.n_tickers),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTf(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tf === t.key ? "bg-accent-soft text-accent" : "text-text-dim hover:bg-white/5 hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && <div className="py-10 text-center text-text-faint">Loading…</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="High confidence" value={summary.high} tone="accent" />
            <StatCard label="Medium confidence" value={summary.medium} tone="amber" />
            <StatCard label="Low confidence" value={summary.low} tone="dim" />
            <StatCard label="No edge" value={summary.noEdge} tone="red" />
          </div>

          {chartData.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-dim">
                Strategy concentration — tickers won (top 10)
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232c3d" horizontal={false} />
                  <XAxis type="number" stroke="#5a6478" fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#8592a8" fontSize={12} width={160} />
                  <Tooltip
                    contentStyle={{ background: "#171e2b", border: "1px solid #232c3d", borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: "#e9eef7" }}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="tickers" fill="#3ee6a8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5">
            <div>
              <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
                Search ticker
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. AAPL"
                className="w-36 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
              />
            </div>
            <div>
              <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
                Confidence
              </label>
              <select
                value={confFilter}
                onChange={(e) => setConfFilter(e.target.value)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
              >
                <option value="">All</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="NO EDGE">NO EDGE</option>
              </select>
            </div>
          </div>

          <DataTable
            columns={tickerColumns}
            rows={tickerSort.rows}
            sortKey={tickerSort.sortKey}
            sortDir={tickerSort.sortDir}
            onSort={tickerSort.onSort}
          />

          <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-dim">Strategy summary</h3>
          <DataTable
            columns={strategyColumns}
            rows={strategySort.rows}
            sortKey={strategySort.sortKey}
            sortDir={strategySort.sortDir}
            onSort={strategySort.onSort}
          />

          <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-dim">NO EDGE tickers</h3>
          <DataTable
            columns={noEdgeColumns}
            rows={noEdgeSort.rows}
            sortKey={noEdgeSort.sortKey}
            sortDir={noEdgeSort.sortDir}
            onSort={noEdgeSort.onSort}
          />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "accent" | "amber" | "dim" | "red" }) {
  const toneCls = {
    accent: "text-accent",
    amber: "text-amber",
    dim: "text-text-dim",
    red: "text-red",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className={`text-2xl font-semibold tabular ${toneCls}`}>{value}</div>
      <div className="mt-1 text-xs text-text-dim">{label}</div>
    </div>
  );
}
