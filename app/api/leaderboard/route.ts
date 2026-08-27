import { NextRequest, NextResponse } from "next/server";
import { getRows, makeFilterFn, parseFilters, METRIC_COLUMNS, DIMENSION_KEYS, type Row } from "@/lib/data";

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const metric = params.get("metric") ?? "sharpe";
  if (!METRIC_COLUMNS.includes(metric)) {
    return NextResponse.json({ error: `unknown metric ${metric}` }, { status: 400 });
  }
  const groupBy = params.get("group_by") ?? "none";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 500);

  const filterFn = makeFilterFn(parseFilters(params));
  const rows = getRows().filter(filterFn).filter((r) => r[metric] != null);

  if (groupBy === "none") {
    rows.sort((a, b) => (dir === "desc" ? b[metric] - a[metric] : a[metric] - b[metric]));
    const out = rows.slice(0, limit).map((r) => ({
      strategy_name: r.strategy_name, ticker: r.ticker, timeframe: r.timeframe, depth: r.depth,
      strategy_family: r.strategy_family, ticker_tags: r.ticker_tags_display,
      metric_value: r[metric], trade_count: r.trade_count, win_rate: r.win_rate,
      net_profit_pct: r.net_profit_pct, sharpe: r.sharpe, sortino: r.sortino,
      max_drawdown: r.max_drawdown,
    }));
    return NextResponse.json({ rows: out, grouped: false });
  }

  if (groupBy !== "ticker_tag" && !(DIMENSION_KEYS as readonly string[]).includes(groupBy)) {
    return NextResponse.json({ error: `unknown group_by ${groupBy}` }, { status: 400 });
  }

  // Fan out one entry per (row, tag) for ticker_tag — a ticker with two
  // tags should count toward both groups, same as the old SQL JOIN did.
  type Entry = { key: string; row: Row };
  const entries: Entry[] = [];
  if (groupBy === "ticker_tag") {
    for (const r of rows) for (const tag of r.ticker_tags) entries.push({ key: tag, row: r });
  } else {
    for (const r of rows) {
      const key = r[groupBy];
      if (key != null) entries.push({ key: String(key), row: r });
    }
  }

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!groups.has(e.key)) groups.set(e.key, []);
    groups.get(e.key)!.push(e);
  }

  const grouped = [...groups.entries()].map(([key, es]) => {
    const metricVals = es.map((e) => e.row[metric]);
    const best = es.reduce((a, b) =>
      (dir === "desc" ? b.row[metric] > a.row[metric] : b.row[metric] < a.row[metric]) ? b : a
    ).row;
    return {
      group_key: key,
      sample_count: es.length,
      avg_metric: avg(metricVals),
      avg_win_rate: avg(es.map((e) => e.row.win_rate).filter((v) => v != null)),
      avg_net_profit_pct: avg(es.map((e) => e.row.net_profit_pct).filter((v) => v != null)),
      avg_trade_count: avg(es.map((e) => e.row.trade_count).filter((v) => v != null)),
      best_metric: best[metric],
      best_strategy_name: best.strategy_name, best_ticker: best.ticker,
      best_timeframe: best.timeframe, best_depth: best.depth,
    };
  });

  grouped.sort((a, b) =>
    dir === "desc" ? (b.avg_metric ?? -Infinity) - (a.avg_metric ?? -Infinity)
                   : (a.avg_metric ?? Infinity) - (b.avg_metric ?? Infinity)
  );

  return NextResponse.json({ rows: grouped.slice(0, limit), grouped: true, group_by: groupBy });
}
