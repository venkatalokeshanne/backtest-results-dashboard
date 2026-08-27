import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EXPORTS_DIR } from "@/lib/data";
import { resolveTimeframe } from "@/lib/timeframe";

/** Serves scripts/robust_tag_strategy_selection.py's output for one
 * timeframe (?tf=5m, default) from its combined JSON, optionally
 * filtering top10 to one tag via ?tag=. */
export async function GET(req: NextRequest) {
  const stamp = resolveTimeframe(req.nextUrl.searchParams.get("tf"));
  const tag = req.nextUrl.searchParams.get("tag");
  const filePath = path.join(EXPORTS_DIR, `${stamp}_tag_robustness.json`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ top10: [], summary: [], no_edge: [] });
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let top10 = data.top10 ?? [];
  if (tag) top10 = top10.filter((r: any) => r.tag === tag);
  return NextResponse.json({ top10, summary: data.summary ?? [], no_edge: data.no_edge ?? [] });
}
