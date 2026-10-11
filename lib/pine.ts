import fs from "fs";
import path from "path";
import { EXPORTS_DIR } from "./data";

/** TradingView Pine strategies screened with Foresight (runs the .pine as published, no conversion).
 * Built by scripts/export_pine_results.py. Kept apart from the TrendSpider rows: those used fixed
 * 1000-4000-bar windows, these use the full history with a 70/30 split, so ranking them together
 * would compare unlike things. All trade figures are per-trade NET % (commission in, size out). */
const FILE = path.join(EXPORTS_DIR, "pine_results.json");

export type PineRow = Record<string, any> & { strategy_id: string; ticker: string; timeframe: string };
export type PineStrategy = {
  title: string; author: string | null; url: string | null;
  runs: number; errors: number; error_kinds: Record<string, number>;
};
export type PineData = {
  rows: PineRow[];
  strategies: Record<string, PineStrategy>;
  meta: Record<string, any>;
};

let cached: { mtime: number; data: PineData } | null = null;

export function getPine(): PineData | null {
  if (!fs.existsSync(FILE)) return null;
  const mtime = fs.statSync(FILE).mtimeMs;
  if (cached && cached.mtime === mtime) return cached.data;
  const raw = JSON.parse(fs.readFileSync(FILE, "utf-8")) as {
    columns: string[]; rows: any[][]; strategies: Record<string, PineStrategy>; meta: Record<string, any>;
  };
  const rows = raw.rows.map((v) => {
    const o: any = {};
    raw.columns.forEach((c, i) => (o[c] = v[i]));
    return o as PineRow;
  });
  cached = { mtime, data: { rows, strategies: raw.strategies, meta: raw.meta } };
  return cached.data;
}

export type PineQuery = {
  timeframe: string; tickers: Set<string> | null; q: string;
  minTrades: number; minIs: number; minOos: number;
};

/** A run "held up" when, on BOTH parts of the history (first 70%, unseen last 30%; nothing was tuned on
 * either), each with enough trades to mean something, it made money per trade net of commission AND beat
 * the stock's own drift for the same holding time and direction, with a profit factor above 1 on the
 * unseen part. A long-only system on a stock that tripled does not pass just by being long. */
export function heldUp(r: PineRow, q: PineQuery) {
  return (r.is_trades ?? 0) >= q.minIs && (r.oos_trades ?? 0) >= q.minOos &&
    (r.is_avg_trade ?? 0) > 0 && (r.oos_avg_trade ?? 0) > 0 && (r.oos_profit_factor ?? 0) > 1 &&
    (r.is_edge_trade ?? 0) > 0 && (r.oos_edge_trade ?? 0) > 0;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
