"use client";

import MultiSelect from "./MultiSelect";

export type FiltersState = {
  strategy_name: string[];
  ticker: string[];
  timeframe: string[];
  depth: string[];
  strategy_family: string[];
  strategy_setup: string[];
  ticker_tag: string[];
  min_trades: number;
};

export type FilterOptions = {
  strategies: string[];
  tickers: string[];
  timeframes: string[];
  depths: (string | number)[];
  strategy_families: string[];
  strategy_setups: string[];
  ticker_tags: string[];
};

export default function FiltersBar({
  filters,
  options,
  onChange,
}: {
  filters: FiltersState;
  options: FilterOptions | null;
  onChange: (next: FiltersState) => void;
}) {
  if (!options) return null;
  const depthStrs = options.depths.map(String);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5">
      <MultiSelect
        label="Strategy"
        options={options.strategies}
        selected={filters.strategy_name}
        onChange={(v) => onChange({ ...filters, strategy_name: v })}
      />
      <MultiSelect
        label="Ticker"
        options={options.tickers}
        selected={filters.ticker}
        onChange={(v) => onChange({ ...filters, ticker: v })}
      />
      <MultiSelect
        label="Timeframe"
        options={options.timeframes}
        selected={filters.timeframe}
        onChange={(v) => onChange({ ...filters, timeframe: v })}
      />
      <MultiSelect
        label="Depth"
        options={depthStrs}
        selected={filters.depth}
        onChange={(v) => onChange({ ...filters, depth: v })}
      />
      <MultiSelect
        label="Strategy family"
        options={options.strategy_families}
        selected={filters.strategy_family}
        onChange={(v) => onChange({ ...filters, strategy_family: v })}
      />
      <MultiSelect
        label="Strategy setup"
        options={options.strategy_setups}
        selected={filters.strategy_setup}
        onChange={(v) => onChange({ ...filters, strategy_setup: v })}
      />
      <MultiSelect
        label="Ticker tag"
        options={options.ticker_tags}
        selected={filters.ticker_tag}
        onChange={(v) => onChange({ ...filters, ticker_tag: v })}
      />
      <div>
        <label className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">
          Min trades
        </label>
        <input
          type="number"
          min={0}
          value={filters.min_trades}
          onChange={(e) => onChange({ ...filters, min_trades: Number(e.target.value) })}
          className="w-24 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent-dim"
        />
      </div>
    </div>
  );
}
