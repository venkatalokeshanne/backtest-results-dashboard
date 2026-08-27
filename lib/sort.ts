"use client";

import { useState } from "react";

function compareRows(a: any, b: any, key: string): number {
  const av = a[key], bv = b[key];
  const an = av === "" || av == null ? NaN : Number(av);
  const bn = bv === "" || bv == null ? NaN : Number(bv);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(av ?? "").localeCompare(String(bv ?? ""));
}

/** Click-to-sort state for one table: null sortKey means "use the
 * caller's default order" (e.g. confidence tier, or CSV row order). */
export function useSort(defaultRows: any[]) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function onSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const rows = sortKey
    ? [...defaultRows].sort((a, b) => (sortDir === "asc" ? 1 : -1) * compareRows(a, b, sortKey))
    : defaultRows;

  return { rows, sortKey: sortKey ?? undefined, sortDir, onSort };
}
