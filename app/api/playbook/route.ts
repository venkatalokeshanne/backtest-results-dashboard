import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EXPORTS_DIR } from "@/lib/data";

/** Serves scripts/build_daytrading_playbook.py's output — the best
 * day-trading strategy per (market condition x ticker type) cell. Static
 * until that script is re-run, so this is a straight read from disk. */
export async function GET() {
  const filePath = path.join(EXPORTS_DIR, "daytrading_playbook.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ meta: null, regimes: [], ticker_types: [], cells: [], family_matrix: [] });
  }
  return NextResponse.json(JSON.parse(fs.readFileSync(filePath, "utf-8")));
}
