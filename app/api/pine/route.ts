import { NextRequest, NextResponse } from "next/server";
import { getPine, heldUp, median, repaintVerdict, PINE_TIMEFRAMES, type PineData, type PineQuery, type PineRow } from "@/lib/pine";

const r2 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);
const med = (g: PineRow[], k: string) => r2(median(g.map((r) => r[k]).filter((v) => v != null)));

/** Lower end of the 90% Wilson interval for k successes in n: "held up on 2 of 2" scores below
 * "held up on 9 of 10", because two tickers prove much less than ten. */
function wilsonLow(k: number, n: number, z = 1.645) {
  if (!n) return 0;
  const p = k / n, d = 1 + (z * z) / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
}

/** Depth (as in the TrendSpider backtests): judge the recent part on the last N bars instead of the last 30%,
 * and make the headline figures describe that window. Rows without that many bars are left out rather than
 * silently judged on less. */
function withDepth(rows: PineRow[], depth: number): PineRow[] {
  if (Number.isNaN(depth)) return rows.map((r) => ({ ...r, window_from: r.from?.slice(0, 10) }));
  return rows.filter((r) => (r.bars ?? 0) > depth).map((r) => ({
    ...r,
    oos_trades: r[`d${depth}_trades`], oos_avg_trade: r[`d${depth}_avg_trade`], oos_win_rate: r[`d${depth}_win_rate`],
    oos_profit_factor: r[`d${depth}_profit_factor`], oos_edge_trade: r[`d${depth}_edge_trade`], oos_median_trade: null,
    trades: r[`d${depth}_trades`], win_rate: r[`d${depth}_win_rate`], avg_trade: r[`d${depth}_avg_trade`],
    profit_factor: r[`d${depth}_profit_factor`], edge_trade: r[`d${depth}_edge_trade`], median_trade: null,
    net_profit_pct: r[`d${depth}_net_pct`], trade_max_dd: r[`d${depth}_max_dd`], window_from: r[`d${depth}_from`],
    trades_per_month: null, sharpe: null, sortino: null,
  }));
}

/** One strategy x timeframe across the tickers in `g`: the ranking row every view shares. */
function groupRow(g: PineRow[], q: PineQuery, data: PineData) {
  const held = g.filter((r) => heldUp(r, q));
  const s = data.strategies[g[0].strategy_id];
  return {
    strategy_id: g[0].strategy_id, strategy: s?.title ?? g[0].strategy_id, url: s?.url, author: s?.author,
    dup_of: s?.dup_of ?? null, repaint: repaintVerdict(s, g[0].timeframe),
    timeframe: g[0].timeframe, tickers: g.length, held_up: held.length,
    held_up_pct: Math.round((1000 * held.length) / g.length) / 10,
    confidence: Math.round(1000 * wilsonLow(held.length, g.length)) / 10,
    held_up_tickers: held.map((r) => r.ticker).sort().join(" "),
    med_is_avg: med(g, "is_avg_trade"), med_oos_avg: med(g, "oos_avg_trade"), med_oos_edge: med(g, "oos_edge_trade"),
    med_oos_pf: med(g, "oos_profit_factor"), med_win: med(g, "win_rate"), med_net: med(g, "net_profit_pct"),
    med_dd: med(g, "trade_max_dd"), trades: g.reduce((a, r) => a + (r.trades ?? 0), 0),
    longs: g.reduce((a, r) => a + (r.longs ?? 0), 0), shorts: g.reduce((a, r) => a + (r.shorts ?? 0), 0),
  };
}

function groupBy(rows: PineRow[], key: (r: PineRow) => string) {
  const m = new Map<string, PineRow[]>();
  for (const r of rows) {
    const k = key(r);
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  return m;
}

function sortRows(out: any[], sort: string, dir: number) {
  return out.sort((a, b) => {
    const av = a[sort], bv = b[sort];
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return (b.confidence ?? b.best_score ?? 0) - (a.confidence ?? a.best_score ?? 0) || (b.tickers ?? 0) - (a.tickers ?? 0);
  });
}

/** mode=rank     one row per strategy x timeframe across the scoped tickers
 *  mode=compare  one row per strategy, its score on every timeframe side by side
 *  mode=ticker   every strategy on one ticker, next to how it did across the scoped tickers
 *  mode=strategy one strategy: coverage, per-timeframe summary, every run
 *  mode=runs     the individual strategy x ticker x timeframe runs */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("mode") ?? "rank";
  const tf = p.get("timeframe") ?? "";
  // compare and strategy need every timeframe; the others read only the one asked for
  const data = getPine(mode === "compare" || mode === "strategy" ? "" : tf);
  if (!data) return NextResponse.json({ missing: true });
  const tickersParam = p.get("tickers");
  const q: PineQuery = {
    timeframe: mode === "compare" || mode === "strategy" ? "" : tf,
    tickers: tickersParam ? new Set(tickersParam.split(",").filter(Boolean)) : null,
    q: (p.get("q") ?? "").trim().toLowerCase(),
    minTrades: parseInt(p.get("min_trades") ?? "30", 10) || 0,
    minIs: parseInt(p.get("min_is") ?? "10", 10) || 0,
    minOos: parseInt(p.get("min_oos") ?? "5", 10) || 0,
  };
  const hideDups = p.get("hide_dups") === "1";
  // strategies whose backtest is proven to use future data are left out unless asked for
  const showRepaint = p.get("show_repaint") === "1";
  const dir = p.get("dir") === "asc" ? 1 : -1;
  const page = Math.max(parseInt(p.get("page") ?? "1", 10), 1);
  const pageSize = Math.min(parseInt(p.get("page_size") ?? "50", 10), 500);
  const title = (id: string) => data.strategies[id]?.title ?? id;

  const rows = withDepth(data.rows, parseInt(p.get("depth") ?? "", 10)).filter((r) =>
    (!q.timeframe || r.timeframe === q.timeframe) &&
    (!q.tickers || q.tickers.has(r.ticker)) &&
    (r.trades ?? 0) >= q.minTrades &&
    !(hideDups && data.strategies[r.strategy_id]?.dup_of) &&
    (showRepaint || repaintVerdict(data.strategies[r.strategy_id], r.timeframe) !== "repaints") &&
    (!q.q || title(r.strategy_id).toLowerCase().includes(q.q) || r.strategy_id.toLowerCase().includes(q.q)));

  const base = { timeframes: data.meta.timeframes ?? Object.keys(PINE_TIMEFRAMES), tickers: data.meta.tickers ?? [],
    meta: { ...data.meta, strategies: Object.keys(data.strategies).length } };

  if (mode === "strategy") {
    const id = p.get("id") ?? "";
    const s = data.strategies[id];
    if (!s) return NextResponse.json({ ...base, error: "unknown strategy" });
    // the detail view shows every timeframe, repainting ones included, each labelled
    const mine = withDepth(data.rows, parseInt(p.get("depth") ?? "", 10)).filter((r) => r.strategy_id === id &&
      (!q.tickers || q.tickers.has(r.ticker)) && (r.trades ?? 0) >= q.minTrades);
    const per_tf = [...groupBy(mine, (r) => r.timeframe).values()].map((g) => groupRow(g, q, data))
      .sort((a, b) => base.timeframes.indexOf(a.timeframe) - base.timeframes.indexOf(b.timeframe));
    const runs = mine.map((r): PineRow => ({ ...r, held_up: heldUp(r, q) }))
      .sort((a, b) => Number(b.held_up) - Number(a.held_up) || (b.oos_edge_trade ?? -1e9) - (a.oos_edge_trade ?? -1e9));
    const dupes = Object.entries(data.strategies).filter(([k, v]) => v.dup_of === id || (s.dup_of && (k === s.dup_of || v.dup_of === s.dup_of) && k !== id))
      .map(([k, v]) => ({ id: k, title: v.title }));
    return NextResponse.json({ ...base, mode, strategy: { id, ...s }, duplicates: dupes, per_tf, runs });
  }

  let out: any[];
  if (mode === "compare") {
    out = [...groupBy(rows, (r) => r.strategy_id).values()].map((g) => {
      const byTf: Record<string, any> = {};
      for (const [t, tg] of groupBy(g, (r) => r.timeframe)) {
        const gr = groupRow(tg, q, data);
        byTf[t] = { score: gr.confidence, held: gr.held_up, tested: gr.tickers, edge: gr.med_oos_edge };
      }
      const s = data.strategies[g[0].strategy_id];
      const scores = Object.entries(byTf).sort((a, b) => b[1].score - a[1].score);
      const row: any = { strategy_id: g[0].strategy_id, strategy: s?.title ?? g[0].strategy_id, url: s?.url,
        dup_of: s?.dup_of ?? null, best_tf: scores[0]?.[0], best_score: scores[0]?.[1].score ?? 0,
        tfs_scoring: scores.filter(([, v]) => v.score >= 40).length };
      for (const t of base.timeframes) {
        row[`score_${t}`] = byTf[t]?.score ?? null;
        row[`held_${t}`] = byTf[t] ? `${byTf[t].held}/${byTf[t].tested}` : null;
        row[`repaint_${t}`] = repaintVerdict(s, t);
      }
      return row;
    });
    sortRows(out, p.get("sort") ?? "best_score", dir);
  } else if (mode === "ticker") {
    const tk = p.get("ticker") ?? "";
    // how each strategy did across the scoped tickers on that timeframe, for context next to this ticker's run
    const across = new Map<string, any>();
    for (const [k, g] of groupBy(rows, (r) => r.strategy_id + "|" + r.timeframe)) across.set(k, groupRow(g, q, data));
    out = rows.filter((r) => r.ticker === tk).map((r) => {
      const a = across.get(r.strategy_id + "|" + r.timeframe);
      return { ...r, strategy: title(r.strategy_id), url: data.strategies[r.strategy_id]?.url,
        dup_of: data.strategies[r.strategy_id]?.dup_of ?? null, repaint: repaintVerdict(data.strategies[r.strategy_id], r.timeframe),
        held_up: heldUp(r, q), held_up_n: heldUp(r, q) ? 1 : 0,
        confidence: a?.confidence ?? 0, across: a ? `${a.held_up}/${a.tickers}` : "" };
    });
    sortRows(out, p.get("sort") ?? "held_up_n", dir);
  } else if (mode === "runs") {
    out = rows.map((r) => ({ ...r, strategy: title(r.strategy_id), url: data.strategies[r.strategy_id]?.url,
      dup_of: data.strategies[r.strategy_id]?.dup_of ?? null, repaint: repaintVerdict(data.strategies[r.strategy_id], r.timeframe),
      held_up: heldUp(r, q) }));
    sortRows(out, p.get("sort") ?? "oos_avg_trade", dir);
  } else {
    out = [...groupBy(rows, (r) => r.strategy_id + "|" + r.timeframe).values()].map((g) => groupRow(g, q, data));
    sortRows(out, p.get("sort") ?? "confidence", dir);
  }

  const total = out.length;
  if (p.get("format") === "csv") {
    const cols = Object.keys(out[0] ?? {}).filter((k) => k !== "url");
    const esc = (v: any) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.join(","), ...out.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pine_${mode}${tf ? "_" + tf : ""}.csv"` } });
  }
  return NextResponse.json({
    ...base, mode, total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) || 1,
    rows: out.slice((page - 1) * pageSize, page * pageSize),
  });
}
