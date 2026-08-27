"use client";

import { useEffect, useState } from "react";
import DataTable, { numClass, type Column } from "./DataTable";
import type { FiltersState } from "./FiltersBar";
import { filtersToParams, METRIC_LABELS, GROUP_LABELS } from "@/lib/api";

const METRICS = Object.keys(METRIC_LABELS);
const GROUPS = ["none", "strategy_name", "ticker", "strategy_family", "strategy_setup", "ticker_tag", "timeframe", "depth"];

export default function LeaderboardView({ filters }: { filters: FiltersState }) {
  const [metric, setMetric] = useState("sharpe");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const [groupBy, setGroupBy] = useState("none");
  const [limit, setLimit] = useState(50);
  const [rows, setRows] = useState<any[]>([]);
  const [grouped, setGrouped] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = filtersToParams(filters);
    p.set("metric", metric);
    p.set("dir", dir);
    p.set("group_by", groupBy);
    p.set("limit", String(limit));
    fetch(`/api/leaderboard?${p.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setGrouped(!!data.grouped);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, metric, dir, groupBy, limit]);

  // Column -> metric key, for columns whose header can be clicked as a
  // shortcut to the Rank-by/Order dropdowns above: clicking the currently
  // active metric's column just flips direction; clicking another metric
  // column switches "Rank by" to it (defaulting to highest-first).
  const COLUMN_METRIC: Record<string, string> = {
    metric_value: metric, trade_count: "trade_count", win_rate: "win_rate",
    net_profit_pct: "net_profit_pct", sharpe: "sharpe", sortino: "sortino",
    max_drawdown: "max_drawdown",
  };
  const GROUPED_COLUMN_METRIC: Record<string, string> = {
    avg_metric: metric, avg_win_rate: "win_rate", avg_net_profit_pct: "net_profit_pct",
    avg_trade_count: "trade_count", best_metric: metric,
  };

  function sortByColumn(map: Record<string, string>, key: string) {
    const targetMetric = map[key];
    if (!targetMetric) return;
    if (targetMetric === metric) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setMetric(targetMetric);
      setDir("desc");
    }
  }

  const individualColumns: Column[] = [
    { key: "rank", label: "#", render: (_v, row) => rows.indexOf(row) + 1 },
    { key: "strategy_name", label: "Strategy" },
    { key: "strategy_family", label: "Family" },
    { key: "ticker", label: "Ticker" },
    { key: "ticker_tags", label: "Tags" },
    { key: "timeframe", label: "TF" },
    { key: "depth", label: "Depth", align: "right" },
    { key: "metric_value", label: METRIC_LABELS[metric], align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "trade_count", label: "Trades", align: "right", sortable: true },
    { key: "win_rate", label: "Win %", align: "right", sortable: true, render: fmt },
    { key: "net_profit_pct", label: "Net %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "sharpe", label: "Sharpe", align: "right", sortable: true, render: fmt },
    { key: "sortino", label: "Sortino", align: "right", sortable: true, render: fmt },
    { key: "max_drawdown", label: "Max DD", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  ];

  const groupedColumns: Column[] = [
    { key: "rank", label: "#", render: (_v, row) => rows.indexOf(row) + 1 },
    { key: "group_key", label: GROUP_LABELS[groupBy] ?? "Group" },
    { key: "sample_count", label: "Samples", align: "right" },
    { key: "avg_metric", label: `Avg ${METRIC_LABELS[metric]}`, align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "avg_win_rate", label: "Avg Win %", align: "right", sortable: true, render: fmt },
    { key: "avg_net_profit_pct", label: "Avg Net %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
    { key: "avg_trade_count", label: "Avg Trades", align: "right", sortable: true, render: fmt },
    { key: "best_metric", label: `Best ${METRIC_LABELS[metric]}`, align: "right", sortable: true, render: fmt },
    { key: "best_strategy_name", label: "Best Strategy" },
    { key: "best_ticker", label: "Best Ticker" },
    { key: "best_timeframe", label: "Best TF" },
    { key: "best_depth", label: "Best Depth", align: "right" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5">
        <Field label="Rank by">
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className={selectCls}>
            {METRICS.map((m) => (
              <option key={m} value={m}>{METRIC_LABELS[m]}</option>
            ))}
          </select>
        </Field>
        <Field label="Order">
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className={selectCls}>
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
        </Field>
        <Field label="Group by">
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={selectCls}>
            {GROUPS.map((g) => (
              <option key={g} value={g}>{GROUP_LABELS[g]}</option>
            ))}
          </select>
        </Field>
        <Field label="Show top">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={selectCls}>
            {[25, 50, 100, 250].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
        {loading && <span className="pb-2 text-xs text-text-faint">Loading…</span>}
      </div>

      <DataTable
        columns={grouped ? groupedColumns : individualColumns}
        rows={rows}
        sortKey={grouped ? Object.keys(GROUPED_COLUMN_METRIC).find((k) => GROUPED_COLUMN_METRIC[k] === metric) : Object.keys(COLUMN_METRIC).find((k) => COLUMN_METRIC[k] === metric)}
        sortDir={dir}
        onSort={(key) => sortByColumn(grouped ? GROUPED_COLUMN_METRIC : COLUMN_METRIC, key)}
      />
    </div>
  );
}

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(2);
}

const selectCls =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">{label}</label>
      {children}
    </div>
  );
}
