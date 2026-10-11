"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable, { type Column } from "./DataTable";
import PineStrategyDetail from "./PineStrategyDetail";
import { Badges, fmt, pct, scoreCell } from "./pineShared";

type Mode = "rank" | "compare" | "ticker" | "runs";
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "rank", label: "Ranking", hint: "Each strategy on each timeframe, ranked by how many of your tickers it held up on." },
  { key: "compare", label: "Compare timeframes", hint: "One row per strategy: its score on Daily, 1H, 15m and 5m side by side." },
  { key: "ticker", label: "By ticker", hint: "Every strategy on one ticker, next to how it did across your other tickers." },
  { key: "runs", label: "All runs", hint: "Every strategy × ticker × timeframe run." },
];
const DEFAULT_SORT: Record<Mode, string> = { rank: "confidence", compare: "best_score", ticker: "held_up_n", runs: "oos_avg_trade" };

export default function PineView({ tickers, watchlist }: { tickers: string[]; watchlist: string }) {
  const [mode, setMode] = useState<Mode>("rank");
  const [timeframe, setTimeframe] = useState("");
  const [depth, setDepth] = useState("");
  const [q, setQ] = useState("");
  const [minTrades, setMinTrades] = useState(30);
  const [ticker, setTicker] = useState("INFQ");
  const [hideDups, setHideDups] = useState(true);
  const [showRepaint, setShowRepaint] = useState(false);
  const [sort, setSort] = useState("confidence");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const tickerKey = watchlist ? tickers.join(",") : "";   // a stable key: the array is rebuilt every render
  useEffect(() => setPage(1), [mode, timeframe, depth, q, minTrades, watchlist, ticker, hideDups, showRepaint]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ mode, timeframe, q, min_trades: String(minTrades), sort, dir });
    if (tickerKey) p.set("tickers", tickerKey);
    if (depth) p.set("depth", depth);
    if (mode === "ticker") p.set("ticker", ticker);
    if (hideDups) p.set("hide_dups", "1");
    if (showRepaint) p.set("show_repaint", "1");
    return p;
  }, [mode, timeframe, q, minTrades, sort, dir, tickerKey, depth, ticker, hideDups, showRepaint]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = new URLSearchParams(params);
    p.set("page", String(page)); p.set("page_size", "50");
    fetch(`/api/pine?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [params, page]);

  function switchMode(m: Mode) { setMode(m); setSort(DEFAULT_SORT[m]); setDir("desc"); }
  function onSort(key: string) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("desc"); }
    setPage(1);
  }

  const name = (v: any, row: any) => (
    <span className="inline-flex items-center">
      <button onClick={() => setDetail(row.strategy_id)} className="text-left hover:text-accent hover:underline"
        title="Open the strategy's details">{String(v).slice(0, 58)}</button>
      <Badges dup={row.dup_of} repaint={row.repaint} />
    </span>
  );
  const recent = depth ? `last ${depth} bars` : "last 30%";
  const tfs: string[] = data?.timeframes ?? ["Daily", "1H", "15m", "5m"];

  const columns: Column[] = useMemo(() => {
    const w = depth ? ` (last ${depth} bars)` : "";
    if (mode === "compare") return [
      { key: "strategy", label: "Strategy", sortable: true, render: name },
      { key: "best_score", label: "Best score", sortable: true, align: "right", render: scoreCell },
      { key: "best_tf", label: "Best on", sortable: true },
      { key: "tfs_scoring", label: "Timeframes ≥ 40", sortable: true, align: "right",
        render: (v) => <span title="Timeframes where the score is 40 or more">{v}</span> },
      ...tfs.flatMap((t): Column[] => [
        { key: `score_${t}`, label: `${t} score`, sortable: true, align: "right",
          render: (v, r) => <span className={r[`repaint_${t}`] === "repaints" ? "line-through opacity-60" : ""}
            title={r[`repaint_${t}`] === "repaints" ? "Repaints on this timeframe" : r[`held_${t}`] ? `held up on ${r[`held_${t}`]} tickers` : ""}>{scoreCell(v)}</span> },
        { key: `held_${t}`, label: `${t} held up`, align: "right", render: (v) => <span className="text-text-dim">{v ?? "—"}</span> },
      ]),
    ];
    if (mode === "rank") return [
      { key: "strategy", label: "Strategy", sortable: true, render: name },
      { key: "timeframe", label: "TF", sortable: true },
      { key: "confidence", label: "Score", sortable: true, align: "right", render: scoreCell },
      { key: "held_up", label: "Held up", sortable: true, align: "right", render: (v, r) => `${v} / ${r.tickers}` },
      { key: "med_oos_edge", label: `Beat holding % / trade (${recent})`, sortable: true, align: "right", render: pct },
      { key: "med_is_avg", label: "Avg trade % first 70%", sortable: true, align: "right", render: pct },
      { key: "med_oos_avg", label: `Avg trade % ${recent}`, sortable: true, align: "right", render: pct },
      { key: "med_oos_pf", label: `PF ${recent}`, sortable: true, align: "right", render: (v) => fmt(v) },
      { key: "med_net", label: `Net %${w} (median ticker)`, sortable: true, align: "right", render: pct },
      { key: "med_dd", label: `Max DD %${w} (median ticker)`, sortable: true, align: "right", render: pct },
      { key: "med_win", label: `Win %${w}`, sortable: true, align: "right", render: (v) => fmt(v, 1) },
      { key: "trades", label: `Trades${w}`, sortable: true, align: "right", render: (v) => fmt(v) },
      { key: "longs", label: "Long / short", align: "right", render: (v, r) => <span className="text-text-dim">{fmt(v)} / {fmt(r.shorts)}</span> },
    ];
    const runCols: Column[] = [
      { key: "strategy", label: "Strategy", sortable: true, render: name },
      ...(mode === "runs" ? [{ key: "ticker", label: "Ticker", sortable: true } as Column] : []),
      { key: "timeframe", label: "TF", sortable: true },
      { key: "held_up_n", label: "Held up here", sortable: mode === "ticker", align: "center",
        render: (_v, r) => (r.held_up ? <span className="text-accent">✓</span> : "") },
      ...(mode === "ticker" ? [
        { key: "confidence", label: "Score (all tickers)", sortable: true, align: "right", render: scoreCell } as Column,
        { key: "across", label: "Held up (all tickers)", align: "right", render: (v) => <span className="text-text-dim">{v}</span> } as Column,
      ] : []),
      { key: "net_profit_pct", label: `Net %${w}`, sortable: true, align: "right", render: pct },
      { key: "trade_max_dd", label: `Max DD %${w}`, sortable: true, align: "right", render: pct },
      { key: "trades", label: `Trades${w}`, sortable: true, align: "right", render: (v) => fmt(v) },
      { key: "win_rate", label: `Win %${w}`, sortable: true, align: "right", render: (v) => fmt(v, 1) },
      { key: "avg_trade", label: `Avg trade %${w}`, sortable: true, align: "right", render: pct },
      { key: "profit_factor", label: `PF${w}`, sortable: true, align: "right", render: (v) => fmt(v) },
      { key: "is_avg_trade", label: "Avg % first 70%", sortable: true, align: "right", render: pct },
      ...(depth ? [] : [
        { key: "oos_trades", label: "Trades last 30%", sortable: true, align: "right" } as Column,
        { key: "oos_avg_trade", label: "Avg % last 30%", sortable: true, align: "right", render: pct } as Column,
        { key: "oos_profit_factor", label: "PF last 30%", sortable: true, align: "right", render: (v: any) => fmt(v) } as Column,
      ]),
      { key: "oos_edge_trade", label: `Beat holding % (${recent})`, sortable: true, align: "right", render: pct },
      { key: "window_from", label: `From${w}`, sortable: true },
    ];
    return runCols;
  }, [mode, depth, recent, tfs]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (data?.missing)
    return <p className="text-text-dim">No Pine screening export yet — run scripts/export_pine_results.py.</p>;
  const meta = data?.meta;
  const totals = meta?.totals;
  const inputCls = "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim";
  const unit = mode === "rank" ? "strategy × timeframe" : mode === "compare" ? "strategies" : "runs";
  const csvHref = `/api/pine?${params.toString()}&format=csv`;
  const couldNot = totals ? Object.values(totals.could_not_run as Record<string, number>).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* what was run, in four numbers */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {[
          { label: "Strategies", value: meta?.strategies, sub: "TradingView, run as published" },
          { label: "Backtests", value: totals?.runs, sub: `${meta?.tickers?.length ?? "…"} tickers × ${tfs.length} timeframes` },
          { label: "With closed trades", value: totals?.traded, sub: `${fmt(totals?.no_closed_trades)} ran without closing one` },
          { label: "Could not run", value: couldNot, sub: "needs other data, old libraries, script guards" },
        ].map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-text-faint">{s.label}</div>
            <div className="tabular mt-1 text-xl">{s.value != null ? fmt(s.value) : "…"}</div>
            <div className="mt-0.5 text-xs text-text-faint">{s.sub}</div>
          </div>
        ))}
      </div>

      <details className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text-dim">
        <summary className="cursor-pointer select-none font-medium text-text">How to read this</summary>
        <div className="mt-2 space-y-1.5">
          <p>Every strategy ran <span className="text-text">exactly as published</span> (its own inputs and settings) in Foresight,
            which runs the .pine itself, on regular-hours bars from Twelve Data. Nothing was tuned. Updated {meta?.generated ?? "…"}.</p>
          <p><span className="text-text">Per-trade %</span> is each trade's net P&amp;L over its position value: commission
            included, position size removed, so strategies with different sizing compare fairly. <span className="text-text">Net %</span> is
            the sum of those (not compounded: many scripts hold several positions at once), and <span className="text-text">Max DD</span> the
            largest fall of that running sum, in percentage points.</p>
          <p><span className="text-text">Held up</span> = made money per trade on the first 70% of the history <em>and</em> on the
            last 30% (or the picked depth window), beat simply holding the stock for the same time on both, and kept a profit
            factor above 1 recently. <span className="text-text">Score</span> = the share of tickers it held up on, marked down when
            there are few (2 of 2 proves less than 9 of 10).</p>
          <p><span className="text-red">REPAINTS</span>: Foresight re-ran the strategy seeing only closed bars and the trades changed —
            the backtest used future data, so it is hidden unless you tick "Show repainting".{" "}
            <span className="text-amber">LIVE DIFFERS</span>: history matched, but parts of the script behave differently on the live
            bar. <span className="text-text-faint">DUPLICATE</span>: the same code published under another title.</p>
          <p>No spread or slippage is charged, so live results will be somewhat worse. A strategy that held up on many tickers
            is far more believable than one that shines on one.</p>
        </div>
      </details>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => switchMode(m.key)} title={m.hint}
              className={`px-4 py-2 text-sm font-medium ${mode === m.key ? "bg-accent-soft text-accent" : "bg-surface-raised text-text-dim hover:text-text"}`}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === "ticker" && (
          <label className="flex flex-col gap-1 text-xs text-text-faint">
            Ticker
            <select id="pine-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} className={inputCls}>
              {(data?.tickers ?? [ticker]).filter((t: string) => !watchlist || tickers.includes(t) || t === ticker)
                .map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        {mode !== "compare" && (
          <label className="flex flex-col gap-1 text-xs text-text-faint">
            Timeframe
            <select id="pine-tf" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className={inputCls}>
              <option value="">All</option>
              {tfs.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
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
            className={`${inputCls} w-24`} />
        </label>
        <label className="flex min-w-[12rem] flex-grow flex-col gap-1 text-xs text-text-faint">
          Search strategy
          <input id="pine-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. supertrend, vwap, ORB"
            className={`${inputCls} min-w-0`} />
        </label>
        <div className="flex flex-col gap-1.5 pb-1 text-xs text-text-dim">
          <label className="flex items-center gap-2"><input id="pine-dups" type="checkbox" checked={hideDups}
            onChange={(e) => setHideDups(e.target.checked)} className="accent-[var(--color-accent)]" /> Hide duplicates</label>
          <label className="flex items-center gap-2"><input id="pine-repaint" type="checkbox" checked={showRepaint}
            onChange={(e) => setShowRepaint(e.target.checked)} className="accent-[var(--color-accent)]" /> Show repainting</label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-dim">
        <span>{MODES.find((m) => m.key === mode)?.hint}{watchlist ? ` Scoped to ${watchlist}.` : ""}</span>
        <a href={csvHref} className="text-accent hover:underline">Download CSV</a>
      </div>

      <DataTable columns={columns} rows={data?.mode === mode ? data.rows ?? [] : []} sortKey={sort} sortDir={dir} onSort={onSort}
        emptyMessage={loading ? "Loading… (the first time a timeframe is opened it takes a few seconds)" : "No runs match."} />

      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
          className="rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-sm disabled:opacity-40">← Prev</button>
        <span className="text-sm text-text-dim">
          {loading ? "Loading…" : `page ${page} of ${data?.total_pages ?? 1} · ${(data?.total ?? 0).toLocaleString()} ${unit}`}
        </span>
        <button onClick={() => setPage((p) => Math.min(data?.total_pages ?? 1, p + 1))} disabled={page >= (data?.total_pages ?? 1)}
          className="rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-sm disabled:opacity-40">Next →</button>
      </div>

      {detail && (
        <PineStrategyDetail id={detail} depth={depth} minTrades={minTrades} tickerKey={tickerKey} watchlist={watchlist}
          onClose={() => setDetail(null)} onOpen={setDetail} />
      )}
    </div>
  );
}
