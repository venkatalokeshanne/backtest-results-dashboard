import type { FiltersState } from "@/components/FiltersBar";

export function filtersToParams(filters: FiltersState): URLSearchParams {
  const p = new URLSearchParams();
  filters.strategy_name.forEach((v) => p.append("strategy_name", v));
  filters.ticker.forEach((v) => p.append("ticker", v));
  filters.timeframe.forEach((v) => p.append("timeframe", v));
  filters.depth.forEach((v) => p.append("depth", v));
  filters.strategy_family.forEach((v) => p.append("strategy_family", v));
  filters.strategy_setup.forEach((v) => p.append("strategy_setup", v));
  filters.ticker_tag.forEach((v) => p.append("ticker_tag", v));
  p.set("min_trades", String(filters.min_trades));
  return p;
}

export const METRIC_LABELS: Record<string, string> = {
  sharpe: "Sharpe", sortino: "Sortino", net_profit_pct: "Net Perf %", win_rate: "Win Rate %",
  trade_count: "Trade Count", max_drawdown: "Max Drawdown", avg_trade: "Avg Trade %",
  expectancy: "Expectancy", rew_risk_ratio: "Reward/Risk", trades_per_month: "Trades/Month",
  trades_per_day: "Trades/Day", r_vol: "R. Vol", avg_length: "Avg Length",
  cagr_2y: "CAGR 2y", cagr_3y: "CAGR 3y", cagr_4y: "CAGR 4y", cagr_5y: "CAGR 5y",
  net_perf_1mo: "Net Perf 1mo", net_perf_3mo: "Net Perf 3mo", net_perf_6mo: "Net Perf 6mo",
  net_perf_1y: "Net Perf 1y", max_consecutive_wins: "Max Win Streak",
  max_consecutive_losses: "Max Loss Streak", beta_vs_asset: "Beta", asset_perf: "Asset Perf %",
  exposure: "Exposure",
};

export const GROUP_LABELS: Record<string, string> = {
  none: "Individual results",
  strategy_name: "Strategy (avg across all runs)",
  ticker: "Ticker (avg across all strategies)",
  strategy_family: "Strategy Family",
  strategy_setup: "Strategy Setup",
  ticker_tag: "Ticker Tag",
  timeframe: "Timeframe",
  depth: "Depth",
};
