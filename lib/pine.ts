import fs from "fs";
import path from "path";
import { EXPORTS_DIR } from "./data";

/** TradingView Pine strategies screened with Foresight (runs the .pine as published, no conversion).
 * Built by scripts/export_pine_results.py. Kept apart from the TrendSpider rows: those used fixed
 * 1000-4000-bar windows, these use the full history with a 70/30 split, so ranking them together
 * would compare unlike things. All trade figures are per-trade NET % (commission in, size out). */
// pine_meta.json holds the column names and the strategy list; the rows are split one file per timeframe
// (each under GitHub's 100 MB file limit). Only the timeframes a request asks for are read and kept.
const META_FILE = path.join(EXPORTS_DIR, "pine_meta.json");
export const PINE_TIMEFRAMES: Record<string, string> = { Daily: "daily", "1H": "1h", "15m": "15m", "5m": "5m" };

export type PineRow = Record<string, any> & { strategy_id: string; ticker: string; timeframe: string };
export type PineStrategy = {
  title: string; author: string | null; url: string | null;
  runs: number; errors: number; error_kinds: Record<string, number>; traded?: number; dup_of?: string;
  repaint?: Record<string, { verdict: string; vectors: string[]; checked_on: string; as_written: number; matched: number }>;
};
export type PineData = {
  rows: PineRow[];
  strategies: Record<string, PineStrategy>;
  meta: Record<string, any>;
};
type Meta = { columns: string[]; strategies: Record<string, PineStrategy>; meta: Record<string, any> };

let metaCache: { mtime: number; data: Meta } | null = null;
const tfCache = new Map<string, { mtime: number; rows: PineRow[] }>();

function readMeta(): Meta | null {
  if (!fs.existsSync(META_FILE)) return null;
  const mtime = fs.statSync(META_FILE).mtimeMs;
  if (!metaCache || metaCache.mtime !== mtime) {
    metaCache = { mtime, data: JSON.parse(fs.readFileSync(META_FILE, "utf-8")) };
    tfCache.clear();                       // a new export: drop rows read from the previous one
  }
  return metaCache.data;
}

function readTimeframe(tf: string, columns: string[]): PineRow[] {
  const file = path.join(EXPORTS_DIR, `pine_results_${PINE_TIMEFRAMES[tf]}.json`);
  if (!fs.existsSync(file)) return [];
  const mtime = fs.statSync(file).mtimeMs;
  const hit = tfCache.get(tf);
  if (hit && hit.mtime === mtime) return hit.rows;
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { rows: any[][] };
  const rows = raw.rows.map((v) => {
    const o: any = {};
    columns.forEach((c, i) => (o[c] = v[i]));
    return o as PineRow;
  });
  tfCache.set(tf, { mtime, rows });
  return rows;
}

/** `timeframe` = one of PINE_TIMEFRAMES, or "" for all of them. */
export function getPine(timeframe = ""): PineData | null {
  const meta = readMeta();
  if (!meta) return null;
  const tfs = timeframe && PINE_TIMEFRAMES[timeframe] ? [timeframe] : Object.keys(PINE_TIMEFRAMES);
  const rows = tfs.length === 1 ? readTimeframe(tfs[0], meta.columns) : tfs.flatMap((tf) => readTimeframe(tf, meta.columns));
  return { rows, strategies: meta.strategies, meta: meta.meta };
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

/** Foresight's repaint verdict for a strategy on a timeframe: "repaints" | "vectors_present" | "clean" | null. */
export function repaintVerdict(s: PineStrategy | undefined, timeframe: string): string | null {
  return s?.repaint?.[timeframe]?.verdict ?? null;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
