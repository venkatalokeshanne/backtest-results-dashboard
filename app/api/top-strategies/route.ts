import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EXPORTS_DIR } from "@/lib/data";
import { resolveTimeframe } from "@/lib/timeframe";

/** Top-10-per-ticker rows from scripts/robust_5m_strategy_selection.py's
 * combined JSON, optionally filtered to one ticker via ?ticker=. */
export async function GET(req: NextRequest) {
  const stamp = resolveTimeframe(req.nextUrl.searchParams.get("tf"));
  const ticker = req.nextUrl.searchParams.get("ticker");
  const filePath = path.join(EXPORTS_DIR, `${stamp}_robustness.json`);
  if (!fs.existsSync(filePath)) return NextResponse.json({ rows: [] });
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let rows = data.top10 ?? [];
  if (ticker) rows = rows.filter((r: any) => r.ticker === ticker);
  return NextResponse.json({ rows });
}
