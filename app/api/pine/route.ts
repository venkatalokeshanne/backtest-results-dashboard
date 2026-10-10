import { NextRequest, NextResponse } from "next/server";
import { getPine, heldUp, median, type PineQuery, type PineRow } from "@/lib/pine";

const r2 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);

/** Lower end of the 90% Wilson interval for k successes in n: "held up on 2 of 2" scores below
 * "held up on 9 of 10", because two tickers prove much less than ten. */
function wilsonLow(k: number, n: number, z = 1.645) {
  if (!n) return 0;
  const p = k / n, d = 1 + (z * z) / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
}

/** mode=rank: one row per strategy x timeframe across the scoped tickers.
 *  mode=runs: the individual strategy x ticker x timeframe runs, paged. */
export async function GET(req: NextRequest) {
  const data = getPine();
  if (!data) return NextResponse.json({ missing: true });
  const p = req.nextUrl.searchParams;
  const tickersParam = p.get("tickers");
  const q: PineQuery = {
    timeframe: p.get("timeframe") ?? "",
    tickers: tickersParam ? new Set(tickersParam.split(",").filter(Boolean)) : null,
    q: (p.get("q") ?? "").trim().toLowerCase(),
    minTrades: parseInt(p.get("min_trades") ?? "30", 10) || 0,
    minIs: parseInt(p.get("min_is") ?? "10", 10) || 0,
    minOos: parseInt(p.get("min_oos") ?? "5", 10) || 0,
  };
  const mode = p.get("mode") === "runs" ? "runs" : "rank";
  const sort = p.get("sort") ?? (mode === "rank" ? "confidence" : "oos_avg_trade");
  const dir = p.get("dir") === "asc" ? 1 : -1;
  const page = Math.max(parseInt(p.get("page") ?? "1", 10), 1);
  const pageSize = Math.min(parseInt(p.get("page_size") ?? "50", 10), 200);

  const title = (id: string) => data.strategies[id]?.title ?? id;
  const rows = data.rows.filter((r) =>
    (!q.timeframe || r.timeframe === q.timeframe) &&
    (!q.tickers || q.tickers.has(r.ticker)) &&
    (r.trades ?? 0) >= q.minTrades &&
    (!q.q || title(r.strategy_id).toLowerCase().includes(q.q) || r.strategy_id.toLowerCase().includes(q.q)));

  let out: any[];
  if (mode === "rank") {
    const groups = new Map<string, PineRow[]>();
    for (const r of rows) {
      const k = r.strategy_id + "|" + r.timeframe;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    out = [...groups.values()].map((g) => {
      const held = g.filter((r) => heldUp(r, q));
      const s = data.strategies[g[0].strategy_id];
      return {
        strategy_id: g[0].strategy_id, strategy: s?.title ?? g[0].strategy_id, url: s?.url, author: s?.author,
        timeframe: g[0].timeframe, tickers: g.length, held_up: held.length,
        held_up_pct: Math.round((1000 * held.length) / g.length) / 10,
        confidence: Math.round(1000 * wilsonLow(held.length, g.length)) / 10,
        held_up_tickers: held.map((r) => r.ticker).sort().join(" "),
        med_is_avg: r2(median(g.map((r) => r.is_avg_trade).filter((v) => v != null))),
        med_oos_avg: r2(median(g.map((r) => r.oos_avg_trade).filter((v) => v != null))),
        med_oos_edge: r2(median(g.map((r) => r.oos_edge_trade).filter((v) => v != null))),
        med_oos_pf: r2(median(g.map((r) => r.oos_profit_factor).filter((v) => v != null))),
        med_win: r2(median(g.map((r) => r.win_rate).filter((v) => v != null))),
        trades: g.reduce((a, r) => a + (r.trades ?? 0), 0),
        errors: s?.errors ?? 0,
      };
    });
  } else {
    out = rows.map((r) => ({ ...r, strategy: title(r.strategy_id), url: data.strategies[r.strategy_id]?.url,
      held_up: heldUp(r, q) }));
  }
  out.sort((a, b) => {
    const av = a[sort], bv = b[sort];
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return (b.confidence ?? 0) - (a.confidence ?? 0) || (b.tickers ?? 0) - (a.tickers ?? 0);
  });
  const total = out.length;
  return NextResponse.json({
    mode, total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) || 1,
    rows: out.slice((page - 1) * pageSize, page * pageSize),
    timeframes: [...new Set(data.rows.map((r) => r.timeframe))],
    meta: { ...data.meta, strategies: Object.keys(data.strategies).length, runs: data.rows.length },
  });
}
