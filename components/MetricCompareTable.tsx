"use client";

// Which direction counts as "better" for each metric row, for the
// highlight — null means no direction (informational only, e.g. Trades).
export const METRIC_ROWS: { key: string; label: string; better: "high" | "low" | null }[] = [
  { key: "net_profit_pct", label: "Net Profit %", better: "high" },
  { key: "win_rate", label: "Win Rate %", better: "high" },
  { key: "trade_count", label: "Trade Count", better: null },
  { key: "sharpe", label: "Sharpe", better: "high" },
  { key: "sortino", label: "Sortino", better: "high" },
  { key: "max_drawdown", label: "Max Drawdown", better: "high" }, // less negative = higher = better
  { key: "avg_trade", label: "Avg Trade %", better: "high" },
  { key: "rew_risk_ratio", label: "Reward/Risk", better: "high" },
  { key: "trades_per_month", label: "Trades/Month", better: null },
  { key: "avg_length", label: "Avg Trade Length", better: null },
  { key: "expectancy", label: "Expectancy", better: "high" },
];

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(2);
}

export type ComparableItem = Record<string, any> & { run_id: number | string };

/** Pivoted comparison table: one column per item, one row per metric,
 * best value in each metric row highlighted. Shared by the
 * selected-runs Compare view and the across-timeframes Compare view. */
export default function MetricCompareTable({
  items,
  columnHeader,
  onRemove,
}: {
  items: ComparableItem[];
  columnHeader: (item: ComparableItem) => React.ReactNode;
  onRemove?: (id: number | string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-raised">
            <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-surface-raised px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-dim">
              Metric
            </th>
            {items.map((item) => (
              <th key={item.run_id} className="min-w-[11rem] border-b border-border px-3 py-2.5 text-left align-top">
                <div className="flex items-start justify-between gap-2">
                  {columnHeader(item)}
                  {onRemove && (
                    <button
                      onClick={() => onRemove(item.run_id)}
                      title="Remove"
                      className="shrink-0 rounded text-text-faint hover:text-red"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((metric) => {
            const nums = items.map((item) => {
              const v = item[metric.key];
              return v === "" || v == null ? null : Number(v);
            });
            let bestIdx = -1;
            if (metric.better) {
              let bestVal: number | null = null;
              nums.forEach((n, i) => {
                if (n == null) return;
                if (bestVal === null || (metric.better === "high" ? n > bestVal : n < bestVal)) {
                  bestVal = n;
                  bestIdx = i;
                }
              });
            }
            return (
              <tr key={metric.key} className="border-b border-border-soft last:border-0 hover:bg-white/[0.02]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-surface px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-dim">
                  {metric.label}
                </td>
                {items.map((item, i) => (
                  <td
                    key={item.run_id}
                    className={`tabular px-3 py-2 ${i === bestIdx ? "font-semibold text-accent" : ""}`}
                  >
                    {fmt(item[metric.key])}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr className="border-t border-border">
            <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-surface px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-dim">
              Family / Tags
            </td>
            {items.map((item) => (
              <td key={item.run_id} className="px-3 py-2 text-xs text-text-dim">
                {item.strategy_family || "—"}
                {item.ticker_tags ? ` · ${item.ticker_tags}` : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
