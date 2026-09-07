"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable, { confidenceBadge, numClass, type Column } from "./DataTable";
import { useSort } from "@/lib/sort";

type Entry = Record<string, any> & { strategy: string; confidence: string };
type Cell = {
  ticker_type: string;
  regime: string;
  verdict: "trade" | "hold_asset" | "stay_flat";
  n_runs: number;
  n_tickers: number;
  n_strategies_evaluated: number;
  median_asset_perf_pct: number | null;
  n_strategies_beating_bh: number;
  primary: Entry | null;
  backup: Entry | null;
  best_available: Entry;
  top: Entry[];
};
type Regime = {
  key: string; label: string; trend: string; vol: string; description: string;
  n_windows: number; asset_perf_median: number | null; asset_vol_median: number | null;
};
type Playbook = {
  meta: any;
  regimes: Regime[];
  ticker_types: { tag: string; n_tickers: number; tickers: string[] }[];
  cells: Cell[];
  family_matrix: any[];
};

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n : n.toFixed(2);
}

const pct = (v: any) => (v == null ? "—" : `${Math.round(Number(v) * 100)}%`);

const CONF_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, "NO EDGE": 3 };

const VERDICT_COPY: Record<string, { title: string; body: string; tone: string }> = {
  trade: {
    title: "Trade it",
    tone: "text-accent",
    body: "At least one strategy both beat buy & hold and made money on its own terms here.",
  },
  hold_asset: {
    title: "Hold the asset — don't day trade it",
    tone: "text-blue",
    body: "No intraday strategy cleared buy & hold in this cell. The asset rose on its own, so trading it added risk and cost without adding return.",
  },
  stay_flat: {
    title: "Stay flat",
    tone: "text-text-dim",
    body: "Nothing beat buy & hold, and buy & hold itself lost money. This cell has no long-side edge worth taking.",
  },
};

const STRATEGY_COLUMNS: Column[] = [
  { key: "strategy", label: "Strategy", sortable: true },
  { key: "family", label: "Family", sortable: true },
  { key: "confidence", label: "Confidence", sortable: true, render: confidenceBadge },
  { key: "score", label: "Score", align: "right", sortable: true, render: fmt },
  { key: "median_excess_pct", label: "Excess vs B&H %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_net_profit_pct", label: "Net %", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_sharpe", label: "Sharpe", align: "right", sortable: true, render: fmt },
  { key: "beat_bh_rate", label: "Beat B&H", align: "right", sortable: true, render: pct },
  { key: "positive_rate", label: "Profitable", align: "right", sortable: true, render: pct },
  { key: "ticker_breadth", label: "Breadth", align: "right", sortable: true, render: pct },
  { key: "median_max_dd", label: "Max DD", align: "right", sortable: true, render: (v) => <span className={numClass(v)}>{fmt(v)}</span> },
  { key: "median_exposure_pct", label: "Exposure %", align: "right", sortable: true, render: fmt },
  { key: "median_hold_days", label: "Hold (days)", align: "right", sortable: true, render: fmt },
  { key: "median_trades", label: "Trades", align: "right", sortable: true, render: fmt },
  { key: "n_runs", label: "Runs", align: "right", sortable: true },
  { key: "n_tickers", label: "Tickers", align: "right", sortable: true },
];

export default function PlaybookView() {
  const [data, setData] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ tag: string; regime: string } | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    fetch("/api/playbook")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const cellIndex = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of data?.cells ?? []) m.set(`${c.ticker_type}|${c.regime}`, c);
    return m;
  }, [data]);

  // Default to the strongest recommendation in the whole playbook, so the
  // view opens on something worth looking at rather than an empty cell.
  useEffect(() => {
    if (!data || selected) return;
    const best = [...data.cells]
      .filter((c) => c.primary)
      .sort((a, b) =>
        (CONF_RANK[a.primary!.confidence] - CONF_RANK[b.primary!.confidence]) ||
        (b.primary!.score - a.primary!.score))[0];
    if (best) setSelected({ tag: best.ticker_type, regime: best.regime });
  }, [data, selected]);

  const cell = selected ? cellIndex.get(`${selected.tag}|${selected.regime}`) ?? null : null;
  const regime = data?.regimes.find((r) => r.key === selected?.regime) ?? null;

  const topSort = useSort(
    useMemo(
      () => [...(cell?.top ?? [])].sort((a, b) =>
        (CONF_RANK[a.confidence] - CONF_RANK[b.confidence]) || (b.score - a.score)),
      [cell]
    )
  );

  if (loading) return <div className="py-10 text-center text-text-faint">Loading…</div>;
  if (!data?.meta) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-dim">
        No playbook data. Run <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs">
          python3 scripts/build_daytrading_playbook.py
        </code> to generate it.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-text-dim">
        The best day-trading strategy for each combination of{" "}
        <span className="text-text">market condition</span> and{" "}
        <span className="text-text">ticker type</span>. Market conditions are labelled from the
        asset's own behaviour over each backtest window, never from strategy results, and every
        strategy is scored on <span className="text-text">excess return over buy &amp; hold</span> —
        in a rising tape raw return is mostly beta. Built from{" "}
        {data.meta.n_ranked_runs.toLocaleString()} intraday runs across{" "}
        {data.meta.n_windows.toLocaleString()} windows by{" "}
        <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs">
          scripts/build_daytrading_playbook.py
        </code>
        .
      </p>

      <button
        onClick={() => setShowMethod((s) => !s)}
        className="self-start text-xs text-accent hover:underline"
      >
        {showMethod ? "Hide" : "Show"} method &amp; limitations
      </button>
      {showMethod && (
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">Method</h3>
            <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-sm text-text-dim">
              {(data.meta.method ?? []).map((m: string) => <li key={m}>{m}</li>)}
            </ol>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">Limitations</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-text-dim">
              {(data.meta.caveats ?? []).map((m: string) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        </div>
      )}

      <RegimeLegend regimes={data.regimes} />

      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-dim">
          Coverage map — pick a ticker type and market condition
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Ticker type
                </th>
                {data.regimes.map((r) => (
                  <th key={r.key} className="px-2 py-2 text-center text-xs font-semibold text-text-dim">
                    <div className="whitespace-nowrap">{r.trend}</div>
                    <div className="whitespace-nowrap text-[0.65rem] font-normal text-text-faint">{r.vol}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.ticker_types.map((t) => (
                <tr key={t.tag} className="border-t border-border-soft">
                  <td className="whitespace-nowrap px-2 py-1.5 capitalize">
                    {t.tag}
                    <span className="ml-1.5 text-xs text-text-faint">{t.n_tickers}</span>
                  </td>
                  {data.regimes.map((r) => {
                    const c = cellIndex.get(`${t.tag}|${r.key}`);
                    const active = selected?.tag === t.tag && selected?.regime === r.key;
                    return (
                      <td key={r.key} className="px-1 py-1 text-center">
                        <MatrixCell
                          cell={c}
                          active={active}
                          onClick={() => c && setSelected({ tag: t.tag, regime: r.key })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-text-faint">
          <span><span className="text-accent">HIGH / MED / LOW</span> — a strategy qualified, tier by weight of evidence</span>
          <span><span className="text-blue">hold</span> — buy &amp; hold won</span>
          <span><span className="text-text-dim">flat</span> — no edge either way</span>
          <span>· — too little data</span>
        </div>
      </div>

      {cell && regime && (
        <>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold">
                <span className="capitalize">{cell.ticker_type}</span> · {regime.label}
              </h3>
              <span className="text-xs text-text-faint">
                {cell.n_runs.toLocaleString()} runs · {cell.n_tickers} tickers ·{" "}
                {cell.n_strategies_evaluated} strategies evaluated ·{" "}
                {cell.n_strategies_beating_bh} beat buy &amp; hold
              </span>
            </div>
            <p className="mt-1 text-sm text-text-dim">{regime.description}</p>
            <p className="mt-2 text-sm">
              <span className={`font-semibold ${VERDICT_COPY[cell.verdict].tone}`}>
                {VERDICT_COPY[cell.verdict].title}.
              </span>{" "}
              <span className="text-text-dim">{VERDICT_COPY[cell.verdict].body}</span>{" "}
              <span className="text-text-faint">
                Buy &amp; hold returned a median{" "}
                <span className={numClass(cell.median_asset_perf_pct)}>
                  {fmt(cell.median_asset_perf_pct)}%
                </span>{" "}
                across these windows.
              </span>
            </p>
          </div>

          {cell.primary ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <RecCard label="Primary" entry={cell.primary} />
              {cell.backup && <RecCard label="Backup (different family)" entry={cell.backup} />}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-dim">
                Closest thing — did not qualify
              </h4>
              <p className="mt-1 text-sm text-text-dim">
                <span className="text-text">{cell.best_available.strategy}</span> ranked highest here
                but failed the bar: excess vs buy &amp; hold{" "}
                <span className={numClass(cell.best_available.median_excess_pct)}>
                  {fmt(cell.best_available.median_excess_pct)}%
                </span>
                , net{" "}
                <span className={numClass(cell.best_available.median_net_profit_pct)}>
                  {fmt(cell.best_available.median_net_profit_pct)}%
                </span>
                , Sharpe {fmt(cell.best_available.median_sharpe)}.
              </p>
            </div>
          )}

          <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
            Top strategies in this cell
          </h3>
          <DataTable
            columns={STRATEGY_COLUMNS}
            rows={topSort.rows}
            sortKey={topSort.sortKey}
            sortDir={topSort.sortDir}
            onSort={topSort.onSort}
            emptyMessage="No strategy cleared the minimum evidence bar here."
          />
        </>
      )}

      <h3 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
        What works when — strategy family by market condition
      </h3>
      <p className="-mt-2 max-w-3xl text-xs text-text-faint">
        Median excess return over buy &amp; hold, pooled across every ticker type. Green means the
        family beat holding the asset; red means holding won.
      </p>
      <FamilyMatrix rows={data.family_matrix} regimes={data.regimes} />
    </div>
  );
}

function MatrixCell({ cell, active, onClick }: { cell?: Cell; active: boolean; onClick: () => void }) {
  if (!cell) return <span className="text-text-faint">·</span>;

  const label = cell.primary
    ? cell.primary.confidence === "MEDIUM" ? "MED" : cell.primary.confidence
    : cell.verdict === "hold_asset" ? "hold" : "flat";
  const tone = cell.primary
    ? { HIGH: "bg-accent-soft text-accent", MEDIUM: "text-amber", LOW: "text-text-dim" }[cell.primary.confidence] ?? "text-text-dim"
    : cell.verdict === "hold_asset" ? "text-blue" : "text-text-faint";

  return (
    <button
      onClick={onClick}
      title={cell.primary ? `${cell.primary.strategy} — ${cell.primary.confidence}` : VERDICT_COPY[cell.verdict].title}
      className={`w-full rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors hover:bg-white/5 ${tone} ${
        active ? "ring-1 ring-accent" : ""
      }`}
    >
      {label}
    </button>
  );
}

function RecCard({ label, entry }: { label: string; entry: Entry }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">{label}</span>
        {confidenceBadge(entry.confidence)}
      </div>
      <h4 className="mt-1 text-base font-semibold">{entry.strategy}</h4>
      <p className="text-xs text-text-faint">
        {entry.family}
        {entry.setup ? ` · ${entry.setup}` : ""} · works on {entry.timeframes.join(", ")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Stat label="Excess vs B&H" value={`${fmt(entry.median_excess_pct)}%`} cls={numClass(entry.median_excess_pct)} />
        <Stat label="Net return" value={`${fmt(entry.median_net_profit_pct)}%`} cls={numClass(entry.median_net_profit_pct)} />
        <Stat label="Sharpe" value={fmt(entry.median_sharpe)} />
        <Stat label="Max DD" value={`${fmt(entry.median_max_dd)}%`} cls={numClass(entry.median_max_dd)} />
        <Stat label="Beat B&H" value={pct(entry.beat_bh_rate)} />
        <Stat label="Profitable runs" value={pct(entry.positive_rate)} />
        <Stat label="Exposure" value={`${fmt(entry.median_exposure_pct)}%`} />
        <Stat label="Median hold" value={`${fmt(entry.median_hold_days)} d`} />
      </div>
      <p className="mt-3 text-xs text-text-faint">
        {entry.n_runs} runs across {entry.n_tickers} tickers · {fmt(entry.median_trades)} trades per run ·
        asset drew down {fmt(entry.median_asset_max_dd)}% over the same windows
      </p>
    </div>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className={`tabular text-lg font-semibold ${cls}`}>{value}</div>
      <div className="text-[0.65rem] text-text-dim">{label}</div>
    </div>
  );
}

function RegimeLegend({ regimes }: { regimes: Regime[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {regimes.map((r) => (
        <div key={r.key} className="rounded-xl border border-border bg-surface p-3">
          <div className="text-sm font-semibold">{r.label}</div>
          <div className="mt-0.5 text-[0.7rem] text-text-faint">
            {r.n_windows} windows · buy &amp; hold median{" "}
            <span className={numClass(r.asset_perf_median)}>{fmt(r.asset_perf_median)}%</span>
            {r.asset_vol_median != null && ` · asset vol ${fmt(r.asset_vol_median)}`}
          </div>
          <p className="mt-1.5 text-xs text-text-dim">{r.description}</p>
        </div>
      ))}
    </div>
  );
}

function FamilyMatrix({ rows, regimes }: { rows: any[]; regimes: Regime[] }) {
  const families = useMemo(
    () => [...new Set(rows.map((r) => r.family))].sort((a, b) => String(a).localeCompare(String(b))),
    [rows]
  );
  const index = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of rows) m.set(`${r.family}|${r.regime}`, r);
    return m;
  }, [rows]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-raised">
            <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-surface-raised px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-dim">
              Family
            </th>
            {regimes.map((r) => (
              <th key={r.key} className="border-b border-border px-3 py-2.5 text-center text-xs font-semibold text-text-dim">
                <div className="whitespace-nowrap">{r.trend}</div>
                <div className="whitespace-nowrap text-[0.65rem] font-normal text-text-faint">{r.vol}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {families.map((fam) => (
            <tr key={fam} className="border-b border-border-soft last:border-0 hover:bg-white/[0.03]">
              <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-surface px-3 py-2 text-xs text-text-dim">
                {fam}
              </td>
              {regimes.map((r) => {
                const e = index.get(`${fam}|${r.key}`);
                if (!e) return <td key={r.key} className="px-3 py-2 text-center text-text-faint">—</td>;
                return (
                  <td
                    key={r.key}
                    title={`${e.n_strategies} strategies, ${e.n_runs} runs · beat buy & hold in ${pct(e.beat_bh_rate)} of runs · median Sharpe ${fmt(e.median_sharpe)}`}
                    className={`tabular px-3 py-2 text-center ${numClass(e.median_excess_pct)}`}
                  >
                    {e.median_excess_pct > 0 ? "+" : ""}{fmt(e.median_excess_pct)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
