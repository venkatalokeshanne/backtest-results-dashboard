import { NextRequest, NextResponse } from "next/server";
import { getRows, BROWSE_COLUMNS } from "@/lib/data";

/** For one (ticker, strategy, depth) triple, returns one row per
 * timeframe that has data — lets the UI put 5m/15m/1h/Daily for the same
 * strategy+ticker side by side. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ticker = params.get("ticker");
  const strategy = params.get("strategy");
  const depth = params.get("depth");

  if (!ticker || !strategy || !depth) {
    return NextResponse.json({ error: "ticker, strategy, and depth are required" }, { status: 400 });
  }
  const depthNum = Number(depth);

  const matches = getRows().filter(
    (r) => r.ticker === ticker && r.strategy_name === strategy && r.depth === depthNum
  );

  // One row per timeframe (there should be at most one anyway, since
  // ticker+strategy+timeframe+depth is unique per the original DB).
  const byTf = new Map<string, (typeof matches)[number]>();
  for (const r of matches) if (!byTf.has(r.timeframe)) byTf.set(r.timeframe, r);

  const TF_ORDER = ["5m", "15m", "1H", "Daily"];
  const rows = [...byTf.values()]
    .sort((a, b) => TF_ORDER.indexOf(a.timeframe) - TF_ORDER.indexOf(b.timeframe))
    .map((r) => {
      const out: Record<string, any> = {};
      for (const col of BROWSE_COLUMNS) out[col] = col === "ticker_tags" ? r.ticker_tags_display : r[col];
      return out;
    });

  return NextResponse.json({ rows });
}
