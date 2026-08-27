import { NextRequest, NextResponse } from "next/server";
import { getRows, makeFilterFn, parseFilters, BROWSE_COLUMNS } from "@/lib/data";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filterFn = makeFilterFn(parseFilters(params));

  let sortKey = params.get("sort") ?? "run_id";
  if (!BROWSE_COLUMNS.includes(sortKey)) sortKey = "run_id";
  const dir = params.get("dir") === "desc" ? "desc" : "asc";

  const page = Math.max(parseInt(params.get("page") ?? "1", 10), 1);
  const pageSize = Math.min(parseInt(params.get("page_size") ?? "50", 10), 200);

  const filtered = getRows().filter(filterFn);

  // Flat sort: nulls always last regardless of direction, run_id as a
  // stable tiebreaker so pagination stays consistent across requests.
  filtered.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const aNull = av == null, bNull = bv == null;
    if (aNull !== bNull) return aNull ? 1 : -1;
    if (!aNull) {
      if (av < bv) return dir === "desc" ? 1 : -1;
      if (av > bv) return dir === "desc" ? -1 : 1;
    }
    return a.run_id - b.run_id;
  });

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const pageRows = filtered.slice(offset, offset + pageSize).map((r) => {
    const out: Record<string, any> = {};
    for (const col of BROWSE_COLUMNS) out[col] = col === "ticker_tags" ? r.ticker_tags_display : r[col];
    return out;
  });

  return NextResponse.json({
    rows: pageRows, total, page, page_size: pageSize,
    total_pages: Math.ceil(total / pageSize) || 1,
  });
}
