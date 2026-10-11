"use client";

import { useEffect, useState } from "react";
import DataTable, { numClass, type Column } from "./DataTable";

function fmt(v: any, d = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(d);
}
const pct = (v: any) => <span className={numClass(v)}>{fmt(v)}</span>;
const nameCell = (v: any, row: any) =>
  row.url ? (
    <a href={row.url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline" title={row.strategy_id}>
      {String(v).slice(0, 60)}
    </a>
  ) : (
    String(v).slice(0, 60)
  );

const RANK_COLUMNS: Column[] = [
  { key: "strategy", label: "Strategy", sortable: true, render: nameCell },
  { key: "timeframe", label: "TF", sortable: true },
  { key: "confidence", label: "Score", sortable: true, align: "right",
    render: (v) => <span className={v >= 40 ? "text-accent font-semibold" : v > 0 ? "" : "text-text-faint"} title="Held-up share, adjusted down for few tickers (90% Wilson lower bound)">{fmt(v, 1)}</span> },
  { key: "held_up_pct", label: "Held up %", sortable: true, align: "right",
    render: (v, r) => <span className={v >= 50 ? "text-accent font-semibold" : v > 0 ? "" : "text-text-faint"}>{fmt(v, 1)}</span> },
  { key: "held_up", label: "Held up", sortable: true, align: "right", render: (v, r) => `${v} / ${r.tickers}` },
  { key: "med_is_avg", label: "Avg trade % first 70%", sortable: true, align: "right", render: pct },
  { key: "med_oos_avg", label: "Avg trade % last 30%", sortable: true, align: "right", render: pct },
  { key: "med_oos_edge", label: "Beat holding by % (last 30%)", sortable: true, align: "right", render: pct },
  { key: "med_oos_pf", label: "PF last 30%", sortable: true, align: "right", render: (v) => fmt(v) },
  { key: "med_net", label: "Net % (median ticker)", sortable: true, align: "right", render: pct },
  { key: "med_dd", label: "Max DD % (median ticker)", sortable: true, align: "right", render: pct },
  { key: "med_win", label: "Win %", sortable: true, align: "right", render: (v) => fmt(v, 1) },
  { key: "trades", label: "Trades", sortable: true, align: "right" },
  { key: "held_up_tickers", label: "Held up on", render: (v) => <span className="text-text-dim">{v || "—"}</span> },
];

const RUN_COLUMNS: Column[] = [
  { key: "strategy", label: "Strategy", sortable: true, render: nameCell },
  { key: "ticker", label: "Ticker", sortable: true },
  { key: "timeframe", label: "TF", sortable: true },
  { key: "held_up", label: "Held up", align: "center", render: (v) => (v ? <span className="text-accent">✓</span> : "") },
  { key: "net_profit_pct", label: "Net %", sortable: true, align: "right", render: pct },
  { key: "trade_max_dd", label: "Max DD %", sortable: true, align: "right", render: pct },
  { key: "trades", label: "Trades", sortable: true, align: "right" },
  { key: "win_rate", label: "Win %", sortable: true, align: "right", render: (v) => fmt(v, 1) },
  { key: "avg_trade", label: "Avg trade %", sortable: true, align: "right", render: pct },
  { key: "median_trade", label: "Median %", sortable: true, align: "right", render: pct },
  { key: "profit_factor", label: "PF", sortable: true, align: "right", render: (v) => fmt(v) },
  { key: "is_avg_trade", label: "Avg % first 70%", sortable: true, align: "right", render: pct },
  { key: "oos_trades", label: "Trades last 30%", sortable: true, align: "right" },
  { key: "oos_avg_trade", label: "Avg % last 30%", sortable: true, align: "right", render: pct },
  { key: "oos_profit_factor", label: "PF last 30%", sortable: true, align: "right", render: (v) => fmt(v) },
  { key: "oos_edge_trade", label: "Beat holding % (last 30%)", sortable: true, align: "right", render: pct },
  { key: "trades_per_month", label: "Trades/mo", sortable: true, align: "right", render: (v) => fmt(v, 1) },
  { key: "window_from", label: "From", sortable: true },
];

function recentLabel(depth: string) { return depth ? `last ${depth} bars` : "last 30%"; }
// With a depth picked, the headline columns (trades, win %, avg trade, PF) describe that window. In the
// runs table the separate "last N bars" copies would then repeat them, and median / drawdown / trades per
// month are not computed per window, so those columns are hidden rather than shown for the wrong period.
const HEADLINE = new Set(["trades", "win_rate", "avg_trade", "profit_factor", "med_win", "net_profit_pct",
  "trade_max_dd", "med_net", "med_dd", "window_from"]);
const HIDE_WITH_DEPTH = new Set(["median_trade", "trades_per_month",
  "oos_trades", "oos_avg_trade", "oos_profit_factor"]);
function withRecent(cols: Column[], depth: string): Column[] {
  return cols
    .filter((c) => !(depth && HIDE_WITH_DEPTH.has(c.key)))
    .map((c) => ({ ...c, label: c.label.replace("last 30%", recentLabel(depth)) +
      (depth && HEADLINE.has(c.key) ? ` (last ${depth} bars)` : "") }));
}

export default function PineView({ tickers, watchlist }: { tickers: string[]; watchlist: string }) {
  const [mode, setMode] = useState<"rank" | "runs">("rank");
  const [timeframe, setTimeframe] = useState("");
  const [depth, setDepth] = useState("");
  const [q, setQ] = useState("");
  const [minTrades, setMinTrades] = useState(30);
  const [sort, setSort] = useState("confidence");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const tickerKey = watchlist ? tickers.join(",") : "";   // a stable key: the array is rebuilt every render
  useEffect(() => setPage(1), [mode, timeframe, depth, q, minTrades, watchlist]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = new URLSearchParams({ mode, timeframe, q, min_trades: String(minTrades), sort, dir, page: String(page), page_size: "50" });
    if (tickerKey) p.set("tickers", tickerKey);
    if (depth) p.set("depth", depth);
    fetch(`/api/pine?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [mode, timeframe, depth, q, minTrades, sort, dir, page, tickerKey]);

  function switchMode(m: "rank" | "runs") {
    setMode(m);
    setSort(m === "rank" ? "confidence" : "oos_avg_trade");
    setDir("desc");
  }
  function onSort(key: string) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("desc"); }
    setPage(1);
  }

  if (data?.missing)
    return <p className="text-text-dim">No Pine screening export yet — run scripts/export_pine_results.py.</p>;
  const meta = data?.meta;
  const inputCls = "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-text-dim">
        <p>
          <span className="font-semibold text-text">{meta ? meta.strategies.toLocaleString() : "…"}</span> TradingView strategies,
          each run <span className="text-text">exactly as published</span> (its own inputs and settings) by Foresight on your
          watchlist tickers — {meta ? `${meta.datasets_done} of ${meta.datasets_total} ticker/timeframe datasets done, ` : ""}
          updated {meta?.generated ?? "…"}.
        </p>
        <p className="mt-1.5">
          Trade figures are per-trade <span className="text-text">net %</span> (commission included, position size removed, so
          strategies are comparable). <span className="text-text">Net %</span> is the sum of those per-trade returns (not compounded:
          many scripts hold several positions at once, and compounding those would invent impossible figures), and{" "}
          <span className="text-text">Max DD</span> is the largest fall of that running sum, in percentage points — the
          same yardstick for every strategy, whatever sizing its author chose. <span className="text-text">From</span> is
          where the history (or the picked depth window) starts. <span className="text-text">Held up</span> = profitable per trade on the first 70% of the
          history <em>and</em> on the last 30%, beating what simply holding the stock gave over the same holding
          time on both, with a profit factor above 1 on the last 30%. Nothing was tuned. No spread or slippage
          is charged, so live results will be somewhat worse. <span className="text-text">Score</span> = the held-up share,
          marked down when it rests on few tickers (2 of 2 proves less than 9 of 10). <span className="text-text">Depth</span>{" "}
          judges the recent part on the last 1000-4000 bars instead, as in the TrendSpider backtests (same run, so
          only a trade already open at the window start can differ from a fresh start there). A strategy that held up on many tickers is far more
          believable than one that shines on one.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {(["rank", "runs"] as const).map((m) => (
            <button key={m} onClick={() => switchMode(m)}
              className={`px-4 py-2 text-sm font-medium ${mode === m ? "bg-accent-soft text-accent" : "bg-surface-raised text-text-dim hover:text-text"}`}>
              {m === "rank" ? "Strategy ranking" : "All runs"}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-faint">
          Timeframe
          <select id="pine-tf" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className={inputCls}>
            <option value="">All</option>
            {(data?.timeframes ?? []).map((t: string) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-faint">
          Recent part judged on
          <select id="pine-depth" value={depth} onChange={(e) => setDepth(e.target.value)} className={inputCls}>
            <option value="">Last 30% of history</option>
            {["1000", "2000", "3000", "4000"].map((d) => <option key={d} value={d}>Last {d} bars (depth)</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-faint">
          Min trades per run
          <input id="pine-min" type="number" min={0} value={minTrades} onChange={(e) => setMinTrades(Number(e.target.value) || 0)}
            className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-grow flex-col gap-1 text-xs text-text-faint">
          Search strategy
          <input id="pine-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. supertrend, vwap, ORB"
            className={`${inputCls} min-w-0`} />
        </label>
      </div>

      <DataTable columns={withRecent(mode === "rank" ? RANK_COLUMNS : RUN_COLUMNS, depth)} rows={data?.rows ?? []} sortKey={sort} sortDir={dir}
        onSort={onSort} emptyMessage={loading ? "Loading…" : "No runs match."} />

      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
          className="rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-sm disabled:opacity-40">← Prev</button>
        <span className="text-sm text-text-dim">
          {loading ? "Loading…" : `page ${page} of ${data?.total_pages ?? 1} · ${(data?.total ?? 0).toLocaleString()} ${mode === "rank" ? "strategy × timeframe" : "runs"}`}
        </span>
        <button onClick={() => setPage((p) => Math.min(data?.total_pages ?? 1, p + 1))} disabled={page >= (data?.total_pages ?? 1)}
          className="rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-sm disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}
