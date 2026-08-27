export const ROBUSTNESS_TIMEFRAMES = new Set(["5m", "15m", "1h", "daily"]);

export function resolveTimeframe(tf: string | null): string {
  const lower = (tf ?? "5m").toLowerCase();
  return ROBUSTNESS_TIMEFRAMES.has(lower) ? lower : "5m";
}
