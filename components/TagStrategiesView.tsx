"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable, { confidenceBadge, numClass, type Column } from "./DataTable";
import { useSort } from "@/lib/sort";

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

type TagData = { top10: any[]; summary: any[]; no_edge: any[] };

const SUMMARY_COLUMNS: Column[] = [
  { key: "tag", label: "Tag", sortable: true },
  { key: "n_tickers_with_tag", label: "Tickers", align: "right", sortable: true },
  { key: "n_candidates_evaluated", label: "Strategies Tried", align: "right", sortable: true },
  { key: "top_strategy", label: "Top Strategy", sortable: true },
  { key: "strategy_family", label: "Family", sortable: true },
  { key: "robustness_score", label: "Score", align: "right", sortable: true, render: fmt },
  { key: "confidence", label: "Confidence", sortable: true, render: confidenceBadge },
  { key: "reason", label: "Reason", sortable: true },
];

const TOP10_COLUMNS: Column[] = [
  { key: "rank", label: "#", align: "center" },
  { key: "strategy", label: "Strategy" },
  { key: "family", label: "Family" },
  { key: "robustness_score", label: "Score", align: "right", render: fmt },
  { key: "confidence", label: "Confidence", render: confidenceBadge },
  { key: "n_tickers", label: "Tickers", align: "right" },
  { key: "tickers_positive_ratio", label: "Tickers +", align: "right", render: (v) => (v === "" ? "—" : `${Math.round(Number(v) * 100)}%`) },
  { key: "median_sharpe", label: "Med. Sharpe", align: "right", render: fmt },
  { key: "median_expectancy", label: "Med. Expectancy", align: "right", render: fmt },
  { key: "median_net_profit_pct", label: "Avg Perf %", align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_asset_perf", label: "Avg Asset Perf %", align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_max_dd", label: "Med. Max DD", align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_trades", label: "Med. Trades", align: "right", render: fmt },
  { key: "reason", label: "Reason" },
];

export default function TagStrategiesView() {
  const [tf, setTf] = useState("5m");
  const [cache, setCache] = useState<Record<string, TagData>>({});
  const [loading, setLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [confFilter, setConfFilter] = useState("");

  useEffect(() => {
    if (cache[tf]) return;
    setLoading(true);
    fetch(`/api/tag-strategies?tf=${tf}`)
      .then((r) => r.json())
      .then((data) => setCache((c) => ({ ...c, [tf]: data })))
      .finally(() => setLoading(false));
  }, [tf, cache]);

  const data = cache[tf];

  const summaryRows = useMemo(() => {
    if (!data) return [];
    let rows = data.summary;
    if (confFilter) rows = rows.filter((r) => r.confidence === confFilter);
    return rows;
  }, [data, confFilter]);

  const summarySort = useSort(summaryRows);

  const drillRows = useMemo(() => {
    if (!data || !selectedTag) return [];
    return data.top10.filter((r) => r.tag === selectedTag);
  }, [data, selectedTag]);

  const tagOptions = useMemo(() => (data ? data.summary.map((r) => r.tag) : []), [data]);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-text-dim">
        Which strategies hold up not just on one ticker, but across every ticker sharing a
        classification tag (sector, cap size, volatility profile, etc.) — evidence pooled across
        tickers, so a tag needs at least 3 tickers trying a strategy before it can qualify. See{" "}
        <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs">
          scripts/robust_tag_strategy_selection.py
        </code>
        .
      </p>

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
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5">
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
            <p className="pb-2 text-xs text-text-faint">Click a row's tag to drill into its top 10 below.</p>
          </div>

          <DataTable
            columns={SUMMARY_COLUMNS.map((c) =>
              c.key === "tag"
                ? {
                    ...c,
                    render: (v: string) => (
                      <button
                        onClick={() => setSelectedTag(v)}
                        className={`underline decoration-dotted underline-offset-2 hover:text-accent ${
                          selectedTag === v ? "font-semibold text-accent" : ""
                        }`}
                      >
                        {v}
                      </button>
                    ),
                  }
                : c
            )}
            rows={summarySort.rows}
            sortKey={summarySort.sortKey}
            sortDir={summarySort.sortDir}
            onSort={summarySort.onSort}
          />

          {selectedTag && (
            <>
              <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
                Top 10 for &ldquo;{selectedTag}&rdquo;
              </h3>
              <DataTable columns={TOP10_COLUMNS} rows={drillRows} />
            </>
          )}

          {!selectedTag && tagOptions.length > 0 && (
            <p className="text-sm text-text-faint">Select a tag above to see its full top-10 breakdown.</p>
          )}
        </>
      )}
    </div>
  );
}
