import fs from "fs";
import path from "path";

// Self-contained within webapp-next (copied here, not read from the
// sibling automation project) so this deploys standalone on Vercel,
// which only bundles files inside the project's own directory tree.
export const CONFIG_DIR = path.join(process.cwd(), "config");
export const EXPORTS_DIR = path.join(process.cwd(), "data", "exports");
const RESULTS_JSON = path.join(EXPORTS_DIR, "results.json");

// TrendSpider's own export contains a handful of internally-broken
// net_profit_pct values (one hit 261 BILLION percent), confirmed traced
// byte-for-byte to their raw CSV. Same cap used by the CSV export script.
export const NET_PROFIT_PCT_CAP = 10000;

export const METRIC_COLUMNS = [
  "sharpe", "sortino", "net_profit_pct", "win_rate", "trade_count",
  "max_drawdown", "avg_trade", "expectancy", "rew_risk_ratio",
  "trades_per_month", "trades_per_day", "r_vol", "avg_length",
  "cagr_2y", "cagr_3y", "cagr_4y", "cagr_5y",
  "net_perf_1mo", "net_perf_3mo", "net_perf_6mo", "net_perf_1y",
  "max_consecutive_wins", "max_consecutive_losses", "beta_vs_asset",
  "asset_perf", "exposure",
];

export const DIMENSION_KEYS = [
  "strategy_name", "ticker", "timeframe", "depth", "strategy_family", "strategy_setup",
] as const;

export const BROWSE_COLUMNS = [
  "run_id", "strategy_name", "ticker", "timeframe", "depth", "strategy_family", "ticker_tags",
  "net_profit_pct", "win_rate", "trade_count", "sharpe", "sortino", "max_drawdown",
  "avg_trade", "expectancy", "rew_risk_ratio", "trades_per_month", "avg_length",
];

export type Row = Record<string, any> & {
  strategy_family: string | null;
  strategy_setup: string | null;
  ticker_tags: string[];
  ticker_tags_display: string;
};

let cachedRows: Row[] | null = null;
let cachedTagFrequency: [string, number][] | null = null;

function loadJson(name: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), "utf-8")).categories;
}

/** Loads data/exports/results.json (a full, static dump of the one-time
 * TrendSpider automation run — see scripts/export_results_json.py) plus
 * the classification JSONs, joins them in memory, and caches the result
 * for the life of the Node process. No database involved: this data
 * never changes, so there's nothing to query live. */
export function getRows(): Row[] {
  if (cachedRows) return cachedRows;

  const raw = JSON.parse(fs.readFileSync(RESULTS_JSON, "utf-8")) as { columns: string[]; rows: any[][] };
  const strategyClass = loadJson("strategy_classification.json");
  const tickerClass = loadJson("ticker_classification.json");

  const tickerTagMap: Record<string, string[]> = {};
  for (const [ticker, v] of Object.entries(tickerClass)) {
    tickerTagMap[ticker] = (v as any).secondary_tags.map((t: string) => t.trim());
  }

  const { columns } = raw;
  cachedRows = raw.rows.map((values) => {
    const row: any = {};
    columns.forEach((col, i) => (row[col] = values[i]));
    const sc = strategyClass[row.strategy_name];
    const tags: string[] = tickerTagMap[row.ticker] ?? [];
    row.strategy_family = sc?.family ?? null;
    row.strategy_setup = sc?.setup ?? null;
    row.ticker_tags = tags;
    row.ticker_tags_display = tags.join(", ");
    return row as Row;
  });

  return cachedRows;
}

export function getTagFrequency(): [string, number][] {
  if (cachedTagFrequency) return cachedTagFrequency;
  const counts: Record<string, number> = {};
  for (const row of getRows()) {
    for (const tag of row.ticker_tags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  cachedTagFrequency = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return cachedTagFrequency;
}

export type Filters = {
  strategy_name: string[]; ticker: string[]; timeframe: string[]; depth: string[];
  strategy_family: string[]; strategy_setup: string[]; ticker_tag: string[];
  min_trades: number;
};

export function parseFilters(params: URLSearchParams): Filters {
  return {
    strategy_name: params.getAll("strategy_name"),
    ticker: params.getAll("ticker"),
    timeframe: params.getAll("timeframe"),
    depth: params.getAll("depth"),
    strategy_family: params.getAll("strategy_family"),
    strategy_setup: params.getAll("strategy_setup"),
    ticker_tag: params.getAll("ticker_tag"),
    min_trades: (() => {
      const n = parseInt(params.get("min_trades") ?? "5", 10);
      return Number.isNaN(n) ? 5 : n;
    })(),
  };
}

/** Same semantics as the old SQL WHERE clause: every dimension filter is
 * an OR-within-AND-across (IN), ticker_tag matches if the ticker carries
 * ANY of the selected tags, trade_count must clear min_trades, and
 * net_profit_pct above NET_PROFIT_PCT_CAP is always excluded. */
export function makeFilterFn(f: Filters): (row: Row) => boolean {
  const sets = {
    strategy_name: f.strategy_name.length ? new Set(f.strategy_name) : null,
    ticker: f.ticker.length ? new Set(f.ticker) : null,
    timeframe: f.timeframe.length ? new Set(f.timeframe) : null,
    depth: f.depth.length ? new Set(f.depth.map(Number)) : null,
    strategy_family: f.strategy_family.length ? new Set(f.strategy_family) : null,
    strategy_setup: f.strategy_setup.length ? new Set(f.strategy_setup) : null,
    ticker_tag: f.ticker_tag.length ? new Set(f.ticker_tag) : null,
  };

  return (row: Row) => {
    if (sets.strategy_name && !sets.strategy_name.has(row.strategy_name)) return false;
    if (sets.ticker && !sets.ticker.has(row.ticker)) return false;
    if (sets.timeframe && !sets.timeframe.has(row.timeframe)) return false;
    if (sets.depth && !sets.depth.has(row.depth)) return false;
    if (sets.strategy_family && !sets.strategy_family.has(row.strategy_family)) return false;
    if (sets.strategy_setup && !sets.strategy_setup.has(row.strategy_setup)) return false;
    if (sets.ticker_tag && !row.ticker_tags.some((t) => sets.ticker_tag!.has(t))) return false;
    if ((row.trade_count ?? 0) < f.min_trades) return false;
    if (row.net_profit_pct != null && row.net_profit_pct > NET_PROFIT_PCT_CAP) return false;
    return true;
  };
}
