"use client";

const NAV = [
  { key: "leaderboard", label: "Leaderboard", icon: "M3 17h3v3H3v-3zm5-6h3v9H8v-9zm5-4h3v13h-3V7zm5-4h3v17h-3V3z" },
  { key: "browse", label: "Browse", icon: "M4 5h16M4 12h16M4 19h16" },
  { key: "robustness", label: "Robustness", icon: "M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" },
  { key: "top-strategies", label: "Top Strategies", icon: "M8 17l4-9 4 9M9.5 14h5M3 21h18" },
  { key: "tag-strategies", label: "By Tag", icon: "M20.59 13.41L12 22l-9-9V4a1 1 0 011-1h9l9 9a1 1 0 010 1.41zM7 8a1 1 0 100-2 1 1 0 000 2z" },
];

export default function Sidebar({
  active,
  onSelect,
  totalRows,
}: {
  active: string;
  onSelect: (key: string) => void;
  totalRows: number | null;
}) {
  return (
    <aside className="border-b border-border bg-surface md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-4 py-4 md:px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M3 17l5-5 4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Backtest Results</h1>
          <p className="text-[0.7rem] text-text-faint">
            {totalRows != null ? `${totalRows.toLocaleString()} rows` : "loading…"}
          </p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:px-3 md:pb-4">
        {NAV.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full ${
                isActive
                  ? "bg-accent-soft text-accent"
                  : "text-text-dim hover:bg-white/5 hover:text-text"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0">
                <path d={item.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
