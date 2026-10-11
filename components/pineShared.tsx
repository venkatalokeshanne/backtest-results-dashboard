"use client";

import { numClass } from "./DataTable";

/** Formatting and badges shared by the Pine page and its strategy detail panel. */
export function fmt(v: any, d = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(d);
}
export const pct = (v: any) => <span className={numClass(v)}>{fmt(v)}</span>;
export const scoreCell = (v: any) =>
  v == null ? <span className="text-text-faint">—</span> :
  <span className={v >= 60 ? "font-semibold text-accent" : v >= 40 ? "text-accent" : v > 0 ? "" : "text-text-faint"}
    title="Held-up share, marked down for few tickers (90% Wilson lower bound)">{fmt(v, 1)}</span>;

/** Small labels next to a strategy name: same code as another strategy, repaint verdict. */
export function Badges({ dup, repaint }: { dup?: string | null; repaint?: string | null }) {
  return (
    <>
      {repaint === "repaints" && (
        <span className="ml-1.5 rounded bg-red/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-red"
          title="Foresight's repaint check: the historical trades use data that was not available at the time. Not tradable as backtested.">
          REPAINTS</span>)}
      {repaint === "vectors_present" && (
        <span className="ml-1.5 rounded bg-amber/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber"
          title="History matched with closed bars only, but the script uses constructs that behave differently on the live bar.">
          LIVE DIFFERS</span>)}
      {dup && (
        <span className="ml-1.5 rounded bg-surface-raised px-1.5 py-0.5 text-[0.65rem] text-text-faint"
          title={`Same code as strategy ${dup} (republished under another title)`}>DUPLICATE</span>)}
    </>
  );
}

