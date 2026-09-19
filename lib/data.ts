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
let cachedWatchlists: Watchlist[] | null = null;

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

export type Watchlist = {
  name: string;
  ibkr_id: string;
  /** Every symbol on the IBKR list, including ones with no backtest data. */
  tickers: string[];
  /** Subset of `tickers` that actually has backtest rows. */
  tickers_in_data: string[];
};

/** Loads config/watchlists.json — a snapshot of the user's Interactive
 * Brokers watchlists (earnings lists excluded). The IBKR lists carry
 * futures, forex and non-US listings that were never backtested, so each
 * list also reports which of its symbols this dataset actually covers;
 * the UI uses that to disable lists with no usable tickers rather than
 * silently offering a filter that matches nothing. */
export function getWatchlists(): Watchlist[] {
  if (cachedWatchlists) return cachedWatchlists;

  const file = path.join(CONFIG_DIR, "watchlists.json");
  if (!fs.existsSync(file)) return (cachedWatchlists = []);

  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { watchlists?: Watchlist[] };
  const inData = new Set(getRows().map((r) => r.ticker));

  cachedWatchlists = (raw.watchlists ?? []).map((w) => ({
    name: w.name,
    ibkr_id: w.ibkr_id,
    tickers: w.tickers,
    tickers_in_data: w.tickers.filter((t) => inData.has(t)),
  }));
  return cachedWatchlists;
}

/** Resolve watchlist names to the set of tickers they cover. Unknown
 * names are ignored rather than matching nothing, so a stale bookmark
 * degrades to "no watchlist scope" instead of an empty dashboard. */
export function watchlistTickerSet(names: string[]): Set<string> | null {
  if (!names.length) return null;
  const wanted = new Set(names);
  const out = new Set<string>();
  let matched = false;
  for (const w of getWatchlists()) {
    if (!wanted.has(w.name)) continue;
    matched = true;
    for (const t of w.tickers_in_data) out.add(t);
  }
  return matched ? out : null;
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
  watchlist: string[];
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
    watchlist: params.getAll("watchlist"),
    min_trades: (() => {
      const n = parseInt(params.get("min_trades") ?? "5", 10);
      return Number.isNaN(n) ? 5 : n;
    })(),
  };
}

/** Same semantics as the old SQL WHERE clause: every dimension filter is
 * an OR-within-AND-across (IN), ticker_tag matches if the ticker carries
 * ANY of the selected tags, trade_count must clear min_trades, and
 * net_profit_pct above NET_PROFIT_PCT_CAP is always excluded.
 *
 * Watchlist is an additional AND-ed scope on top of the explicit ticker
 * filter, not a replacement for it: picking a watchlist narrows the
 * universe, and picking tickers as well narrows it further. */
export function makeFilterFn(f: Filters): (row: Row) => boolean {
  const sets = {
    strategy_name: f.strategy_name.length ? new Set(f.strategy_name) : null,
    ticker: f.ticker.length ? new Set(f.ticker) : null,
    timeframe: f.timeframe.length ? new Set(f.timeframe) : null,
    depth: f.depth.length ? new Set(f.depth.map(Number)) : null,
    strategy_family: f.strategy_family.length ? new Set(f.strategy_family) : null,
    strategy_setup: f.strategy_setup.length ? new Set(f.strategy_setup) : null,
    ticker_tag: f.ticker_tag.length ? new Set(f.ticker_tag) : null,
    watchlist: watchlistTickerSet(f.watchlist),
  };

  return (row: Row) => {
    if (sets.strategy_name && !sets.strategy_name.has(row.strategy_name)) return false;
    if (sets.ticker && !sets.ticker.has(row.ticker)) return false;
    if (sets.watchlist && !sets.watchlist.has(row.ticker)) return false;
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
