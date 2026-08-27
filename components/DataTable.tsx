"use client";

export type Column = {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  render?: (value: any, row: any) => React.ReactNode;
};

const CONFIDENCE_CLASS: Record<string, string> = {
  HIGH: "text-accent font-semibold",
  MEDIUM: "text-amber",
  LOW: "text-text-dim",
  "NO EDGE": "text-red",
};

export function confidenceBadge(v: string) {
  const cls = CONFIDENCE_CLASS[v] ?? "text-text-dim";
  return <span className={cls}>{v}</span>;
}

export function numClass(v: any) {
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return n > 0 ? "text-accent" : n < 0 ? "text-red" : "text-text-dim";
}

export default function DataTable({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  emptyMessage = "No rows.",
}: {
  columns: Column[];
  rows: any[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-raised">
            {columns.map((c) => {
              const active = sortKey === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => c.sortable && onSort?.(c.key)}
                  className={`sticky top-0 whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-dim ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  } ${c.sortable ? "cursor-pointer select-none hover:text-text" : ""} ${
                    active ? "bg-accent-soft text-accent" : ""
                  }`}
                >
                  {c.label}
                  {active && <span className="ml-1">{sortDir === "desc" ? "▼" : "▲"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-text-faint">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-soft last:border-0 hover:bg-white/[0.03]">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`tabular whitespace-nowrap px-3 py-2 ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
