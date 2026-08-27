"use client";

import { useEffect, useState } from "react";
import DataTable, { numClass, type Column } from "./DataTable";
import type { FiltersState } from "./FiltersBar";
import { filtersToParams } from "@/lib/api";

const COLUMNS: Column[] = [
  { key: "run_id", label: "Run", sortable: true, align: "right" },
  { key: "strategy_name", label: "Strategy", sortable: true },
  { key: "ticker", label: "Ticker", sortable: true },
  { key: "timeframe", label: "TF", sortable: true },
  { key: "depth", label: "Depth", sortable: true, align: "right" },
  { key: "strategy_family", label: "Family", sortable: true },
  { key: "ticker_tags", label: "Tags", sortable: true },
  { key: "net_profit_pct", label: "Net %", sortable: true, align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "win_rate", label: "Win %", sortable: true, align: "right", render: fmt },
  { key: "trade_count", label: "Trades", sortable: true, align: "right" },
  { key: "sharpe", label: "Sharpe", sortable: true, align: "right", render: fmt },
  { key: "sortino", label: "Sortino", sortable: true, align: "right", render: fmt },
  { key: "max_drawdown", label: "Max DD", sortable: true, align: "right", render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "avg_trade", label: "Avg Trade %", sortable: true, align: "right", render: fmt },
  { key: "expectancy", label: "Expectancy", sortable: true, align: "right", render: fmt },
  { key: "rew_risk_ratio", label: "R/R", sortable: true, align: "right", render: fmt },
  { key: "trades_per_month", label: "Trades/mo", sortable: true, align: "right", render: fmt },
  { key: "avg_length", label: "Avg Length", sortable: true, align: "right", render: fmt },
];

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(2);
}

export default function BrowseView({ filters }: { filters: FiltersState }) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sort, setSort] = useState("run_id");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => setPage(1), [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = filtersToParams(filters);
    p.set("sort", sort);
    p.set("dir", dir);
    p.set("page", String(page));
    p.set("page_size", String(pageSize));
    fetch(`/api/results?${p.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.total_pages ?? 1);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, sort, dir, page, pageSize]);

  function onSort(key: string) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable columns={COLUMNS} rows={rows} sortKey={sort} sortDir={dir} onSort={onSort} />
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-sm disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-sm text-text-dim">
          {loading ? "Loading…" : `page ${page} of ${totalPages} · ${total.toLocaleString()} rows`}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-sm disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
