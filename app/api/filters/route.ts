import { NextResponse } from "next/server";
import { getRows, getTagFrequency, METRIC_COLUMNS } from "@/lib/data";

function distinct<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

export async function GET() {
  const rows = getRows();

  const strategies = distinct(rows.map((r) => r.strategy_name)).sort();
  const tickers = distinct(rows.map((r) => r.ticker)).sort();
  const timeframes = distinct(rows.map((r) => r.timeframe)).sort();
  const depths = distinct(rows.map((r) => r.depth)).sort((a, b) => a - b);
  const families = distinct(rows.map((r) => r.strategy_family).filter(Boolean)).sort();
  const setups = distinct(rows.map((r) => r.strategy_setup).filter(Boolean)).sort();
  const ticker_tags = getTagFrequency().map(([tag]) => tag);

  return NextResponse.json({
    strategies, tickers, timeframes, depths,
    strategy_families: families, strategy_setups: setups,
    ticker_tags, total_rows: rows.length, metric_columns: METRIC_COLUMNS,
  });
}
