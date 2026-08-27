import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EXPORTS_DIR } from "@/lib/data";
import { resolveTimeframe } from "@/lib/timeframe";

/** Serves scripts/robust_5m_strategy_selection.py's output for one
 * timeframe (?tf=5m, default) straight from its combined JSON file — this
 * data is static until that script is re-run, so there's nothing to
 * compute here, just read whatever's on disk. */
export async function GET(req: NextRequest) {
  const stamp = resolveTimeframe(req.nextUrl.searchParams.get("tf"));
  const filePath = path.join(EXPORTS_DIR, `${stamp}_robustness.json`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ tickers: [], strategies: [], concentration: [], no_edge: [] });
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return NextResponse.json(data);
}
