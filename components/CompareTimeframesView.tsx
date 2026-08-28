"use client";

import { useEffect, useMemo, useState } from "react";
import MetricCompareTable, { type ComparableItem } from "./MetricCompareTable";

const DEPTHS = [1000, 2000, 3000, 4000];
const ROBUSTNESS_TIMEFRAMES = ["5m", "15m", "1h", "daily"];
const TF_LABELS: Record<string, string> = { "5m": "5m", "15m": "15m", "1h": "1H", daily: "Daily" };

const MIN_QUALIFY_OPTIONS = [
  { value: 4, label: "All 4 (strictest)" },
  { value: 3, label: "At least 3 of 4" },
  { value: 2, label: "At least 2 of 4" },
];

type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NO EDGE";
// strategy -> timeframe -> confidence, so both the dropdown ranking AND
// the per-timeframe qualify badges in the table can be derived from one
// fetch instead of two.
type ConfidenceMap = Record<string, Partial<Record<string, Confidence>>>;

export default function CompareTimeframesView({ tickers }: { tickers: string[] }) {
  const [ticker, setTicker] = useState("");
  const [strategy, setStrategy] = useState("");
  const [depth, setDepth] = useState(3000);
  const [minQualify, setMinQualify] = useState(3);
  const [rows, setRows] = useState<ComparableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [confidenceMap, setConfidenceMap] = useState<ConfidenceMap | null>(null);
  const [loadingReliable, setLoadingReliable] = useState(false);

  useEffect(() => {
    if (!ticker && tickers.length) setTicker(tickers[0]);
  }, [tickers, ticker]);

  // Pull every candidate's confidence on every timeframe for this ticker
  // in one shot — the dropdown then filters/ranks by how many timeframes
  // each strategy clears the evidence bar on (adjustable via minQualify),
  // instead of hard-requiring all 4 which is often too strict.
  useEffect(() => {
    if (!ticker) return;
    setLoadingReliable(true);
    Promise.all(
      ROBUSTNESS_TIMEFRAMES.map((tf) =>
        fetch(`/api/top-strategies?tf=${tf}&ticker=${encodeURIComponent(ticker)}`).then((r) => r.json())
      )
    )
      .then((results) => {
        const map: ConfidenceMap = {};
        results.forEach((data, i) => {
          const tf = ROBUSTNESS_TIMEFRAMES[i];
          for (const r of data.rows ?? []) {
            if (!map[r.strategy]) map[r.strategy] = {};
            map[r.strategy][tf] = r.confidence;
          }
        });
        setConfidenceMap(map);
      })
      .finally(() => setLoadingReliable(false));
  }, [ticker]);

  const rankedStrategies = useMemo(() => {
    if (!confidenceMap) return [];
    return Object.entries(confidenceMap)
      .map(([name, byTf]) => ({
        name,
        qualifyCount: ROBUSTNESS_TIMEFRAMES.filter((tf) => byTf[tf] && byTf[tf] !== "NO EDGE").length,
      }))
      .filter((s) => s.qualifyCount >= minQualify)
      .sort((a, b) => b.qualifyCount - a.qualifyCount || a.name.localeCompare(b.name));
  }, [confidenceMap, minQualify]);

  useEffect(() => {
    if (!confidenceMap) return;
    if (!rankedStrategies.some((s) => s.name === strategy)) setStrategy(rankedStrategies[0]?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedStrategies, confidenceMap]);

  useEffect(() => {
    let cancelled = false;

    if (!ticker || !strategy || !depth) {
      // No strategy meets the current bar (or the list is still
      // loading) — clear any stale rows from a previous selection.
      // Also reset `loading` explicitly: a still-in-flight request from
      // the PREVIOUS ticker's cleanup sets its own `cancelled` flag and
      // skips setLoading(false) in its `finally`, which would otherwise
      // leave this state stuck true forever.
      setRows([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    fetch(`/api/compare-timeframes?ticker=${encodeURIComponent(ticker)}&strategy=${encodeURIComponent(strategy)}&depth=${depth}`)
      .then((r) => r.json())
      // Guard against a stale request (fired with the previous ticker's
      // strategy, before the ranked list caught up) resolving AFTER a
      // newer effect run already cleared the rows.
      .then((data) => {
        if (!cancelled) setRows(data.rows ?? []);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [ticker, strategy, depth]);

  const selectedQualify = confidenceMap?.[strategy];

  return (
    <div className="flex flex-col gap-4">

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5">
        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
            Ticker
          </label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-28 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
          >
            {tickers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
            Strategy
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            disabled={loadingReliable || rankedStrategies.length === 0}
            className="w-64 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim disabled:opacity-50"
          >
            {loadingReliable && <option>Loading…</option>}
            {!loadingReliable && rankedStrategies.length === 0 && <option>No strategy meets this bar</option>}
            {rankedStrategies.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.qualifyCount}/4)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
            Minimum timeframes
          </label>
          <select
            value={minQualify}
            onChange={(e) => setMinQualify(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
          >
            {MIN_QUALIFY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
            Depth
          </label>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {!loadingReliable && confidenceMap && (
        <p className="text-xs text-text-faint">
          {rankedStrategies.length} strateg{rankedStrategies.length === 1 ? "y" : "ies"} qualify at this bar
        </p>
      )}

      {loading && <div className="py-10 text-center text-text-faint">Loading…</div>}

      {!loading && !loadingReliable && confidenceMap && rankedStrategies.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <p className="text-sm text-text-dim">
            No strategy for {ticker} clears the minimum-evidence bar on at least {minQualify} of 4
            timeframes. Try lowering <span className="text-text">Minimum timeframes</span>, or a
            different ticker.
          </p>
        </div>
      )}

      {!loading && searched && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <p className="text-sm text-text-dim">
            No data for {strategy} on {ticker} at depth {depth}. Try a different depth or strategy.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <MetricCompareTable
          items={rows}
          columnHeader={(item) => {
            const conf = selectedQualify?.[item.timeframe.toLowerCase() as string];
            const qualifies = conf && conf !== "NO EDGE";
            return (
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold normal-case text-text">
                    {TF_LABELS[item.timeframe.toLowerCase()] ?? item.timeframe}
                  </span>
                  <span
                    title={qualifies ? `Confidence: ${conf}` : "Doesn't clear the evidence bar on this timeframe"}
                    className={`h-1.5 w-1.5 rounded-full ${qualifies ? "bg-accent" : "bg-red"}`}
                  />
                </div>
                <div className="mt-0.5 text-xs font-normal normal-case text-text-dim">
                  {item.ticker} · {item.depth}
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
