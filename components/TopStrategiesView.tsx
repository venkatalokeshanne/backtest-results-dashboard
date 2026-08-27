"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable, { confidenceBadge, numClass, type Column } from "./DataTable";

const TIMEFRAMES = [
  { key: "5m", label: "5 min" },
  { key: "15m", label: "15 min" },
  { key: "1h", label: "1 hour" },
  { key: "daily", label: "Daily" },
];

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(2);
}

const COLUMNS: Column[] = [
  { key: "rank", label: "#", align: "center" },
  { key: "strategy", label: "Strategy" },
  { key: "family", label: "Family" },
  { key: "robustness_score", label: "Score", align: "right", render: fmt },
  { key: "confidence", label: "Confidence", render: confidenceBadge },
  { key: "median_sharpe", label: "Med. Sharpe", align: "right", render: fmt },
  { key: "median_expectancy", label: "Med. Expectancy", align: "right", render: fmt },
  { key: "median_net_profit_pct", label: "Avg Perf %", align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_asset_perf", label: "Avg Asset Perf %", align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_max_dd", label: "Med. Max DD", align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_trades", label: "Med. Trades", align: "right", render: fmt },
  { key: "depths_positive", label: "Depths +", align: "center" },
  { key: "reason", label: "Reason" },
];

export default function TopStrategiesView({ tickers }: { tickers: string[] }) {
  const [ticker, setTicker] = useState("");
  const [tf, setTf] = useState("5m");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker && tickers.length) setTicker(tickers[0]);
  }, [tickers, ticker]);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetch(`/api/top-strategies?tf=${tf}&ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((data) => setRows(data.rows ?? []))
      .finally(() => setLoading(false));
  }, [ticker, tf]);

  const filteredTickers = useMemo(
    () => (query ? tickers.filter((t) => t.toUpperCase().includes(query.toUpperCase())) : tickers),
    [tickers, query]
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-text-dim">
        Every strategy tried on this ticker &amp; timeframe, ranked by the same profitability +
        cross-depth consistency + risk-adjusted score as the Robustness view — not just the single
        best pick.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5">
        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
            Ticker
          </label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter list..."
              className="w-32 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
            />
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="w-32 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
            >
              {filteredTickers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

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

      {loading ? (
        <div className="py-10 text-center text-text-faint">Loading…</div>
      ) : (
        <DataTable columns={COLUMNS} rows={rows} emptyMessage={`No 5m data for ${ticker || "this ticker"}.`} />
      )}
    </div>
  );
}
