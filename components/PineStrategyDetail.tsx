"use client";

import { useEffect, useState } from "react";
import DataTable, { type Column } from "./DataTable";
import { Badges, fmt, pct, scoreCell } from "./pineShared";

const VERDICT: Record<string, { label: string; cls: string; text: string }> = {
  repaints: { label: "Repaints", cls: "text-red",
    text: "Re-run seeing only closed bars, the trades changed: the backtest used data that was not available at the time." },
  vectors_present: { label: "Live differs", cls: "text-amber",
    text: "History matched with closed bars only, but some constructs behave differently on the live bar." },
  clean: { label: "Clean", cls: "text-accent", text: "No repainting found." },
};

/** One strategy: where it ran, why it could not run elsewhere, how it did per timeframe, every ticker's run. */
export default function PineStrategyDetail({ id, depth, minTrades, tickerKey, watchlist, onClose, onOpen }: {
  id: string; depth: string; minTrades: number; tickerKey: string; watchlist: string;
  onClose: () => void; onOpen: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [tf, setTf] = useState("");

  useEffect(() => {
    setData(null);
    const p = new URLSearchParams({ mode: "strategy", id, min_trades: String(minTrades) });
    if (depth) p.set("depth", depth);
    if (tickerKey) p.set("tickers", tickerKey);
    fetch(`/api/pine?${p.toString()}`).then((r) => r.json()).then(setData);
  }, [id, depth, minTrades, tickerKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = data?.strategy;
  const w = depth ? ` (last ${depth} bars)` : "";
  const recent = depth ? `last ${depth} bars` : "last 30%";
  const tfCols: Column[] = [
    { key: "timeframe", label: "TF" },
    { key: "confidence", label: "Score", align: "right", render: scoreCell },
    { key: "held_up", label: "Held up", align: "right", render: (v, r) => `${v} / ${r.tickers}` },
    { key: "med_oos_edge", label: `Beat holding % (${recent})`, align: "right", render: pct },
    { key: "med_net", label: `Net %${w} (median)`, align: "right", render: pct },
    { key: "med_dd", label: `Max DD %${w} (median)`, align: "right", render: pct },
    { key: "med_win", label: `Win %${w}`, align: "right", render: (v) => fmt(v, 1) },
    { key: "trades", label: `Trades${w}`, align: "right", render: (v) => fmt(v) },
    { key: "repaint", label: "Repaint check", render: (v) => v ? <span className={VERDICT[v]?.cls}>{VERDICT[v]?.label ?? v}</span> : "—" },
  ];
  const runCols: Column[] = [
    { key: "ticker", label: "Ticker" },
    { key: "timeframe", label: "TF" },
    { key: "held_up", label: "Held up", align: "center", render: (v) => (v ? <span className="text-accent">✓</span> : "") },
    { key: "net_profit_pct", label: `Net %${w}`, align: "right", render: pct },
    { key: "trade_max_dd", label: `Max DD %${w}`, align: "right", render: pct },
    { key: "trades", label: `Trades${w}`, align: "right", render: (v) => fmt(v) },
    { key: "win_rate", label: `Win %${w}`, align: "right", render: (v) => fmt(v, 1) },
    { key: "avg_trade", label: `Avg trade %${w}`, align: "right", render: pct },
    { key: "is_avg_trade", label: "Avg % first 70%", align: "right", render: pct },
    { key: "oos_avg_trade", label: `Avg % ${recent}`, align: "right", render: pct },
    { key: "oos_edge_trade", label: `Beat holding % (${recent})`, align: "right", render: pct },
    { key: "window_from", label: `From${w}` },
  ];
  const runs = (data?.runs ?? []).filter((r: any) => !tf || r.timeframe === tf);
  const kinds = Object.entries((s?.error_kinds ?? {}) as Record<string, number>);
  const total = (s?.runs ?? 0) + (s?.errors ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-5xl overflow-y-auto border-l border-border bg-bg p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{s?.title ?? "Loading…"}<Badges dup={s?.dup_of} /></h3>
            <p className="mt-0.5 text-sm text-text-dim">
              {s?.author ? `by ${s.author} · ` : ""}<span className="font-mono text-xs">{id}</span>
              {s?.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Open on TradingView ↗</a></>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm hover:text-accent">Close ✕</button>
        </div>

        {s && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">Where it ran</div>
              <p className="text-text-dim">
                <span className="tabular text-text">{fmt(s.traded ?? 0)}</span> of {fmt(total)} ticker × timeframe runs closed
                trades; <span className="tabular text-text">{fmt((s.runs ?? 0) - (s.traded ?? 0))}</span> ran without closing one.
              </p>
              {kinds.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-text-dim">
                  {kinds.map(([k, n]) => <li key={k}>Could not run: <span className="text-text">{k}</span> ({fmt(n)})</li>)}
                </ul>
              )}
              {data?.duplicates?.length > 0 && (
                <p className="mt-2 text-text-dim">Same code as:{" "}
                  {data.duplicates.map((d: any, i: number) => (
                    <span key={d.id}>{i ? ", " : ""}<button onClick={() => onOpen(d.id)} className="text-accent hover:underline">{d.title}</button></span>
                  ))}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">Repaint check (Foresight)</div>
              {s.repaint && Object.keys(s.repaint).length ? (
                <ul className="space-y-1 text-text-dim">
                  {Object.entries(s.repaint as Record<string, any>).map(([t, v]) => (
                    <li key={t}><span className="text-text">{t}</span>: <span className={VERDICT[v.verdict]?.cls}>{VERDICT[v.verdict]?.label ?? v.verdict}</span>
                      {v.verdict === "repaints" && v.as_written ? ` — only ${v.matched} of ${v.as_written} trades survive with closed bars` : ""}
                      <span className="text-text-faint"> (checked on {v.checked_on})</span></li>
                  ))}
                </ul>
              ) : <p className="text-text-dim">Not checked yet.</p>}
              <p className="mt-2 text-xs text-text-faint">{VERDICT.repaints.text}</p>
            </div>
          </div>
        )}

        <div className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
          Per timeframe{watchlist ? ` · ${watchlist}` : ""}
        </div>
        <DataTable columns={tfCols} rows={data?.per_tf ?? []} emptyMessage={data ? "No runs with enough trades." : "Loading…"} />

        <div className="mt-5 mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">Every ticker</span>
          <div className="flex overflow-hidden rounded-lg border border-border text-xs">
            {["", ...((data?.per_tf ?? []).map((t: any) => t.timeframe))].map((t: string) => (
              <button key={t || "all"} onClick={() => setTf(t)}
                className={`px-3 py-1 ${tf === t ? "bg-accent-soft text-accent" : "bg-surface-raised text-text-dim hover:text-text"}`}>{t || "All"}</button>
            ))}
          </div>
          <span className="text-xs text-text-faint">{runs.length} runs · held-up first</span>
        </div>
        <DataTable columns={runCols} rows={runs} emptyMessage={data ? "No runs." : "Loading…"} />
      </div>
    </div>
  );
}
