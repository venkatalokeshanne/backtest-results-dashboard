"""Export the Foresight screening of TradingView Pine strategies into data/exports/pine_results.json.

Source: C:/Users/annev/workspace/pine_screen/results/<tf>/<TICKER>.jsonl, written by pine_screen/runner.py.
Each line is one strategy run as published (its own inputs and strategy() settings) on one ticker and
timeframe, by Foresight, which runs the .pine directly. Trade figures are per-trade NET % returns
(pl / (entry price x size): commission included, position size cancels out). "is_" = trades entered in
the first 70% of the bars, "oos_" = the last 30%; nothing was tuned on either part.

Rows that errored (data the script needs that we don't have, retired libraries, ...) are not rows here;
they are counted per strategy in `strategies[id].errors`. Run: python scripts/export_pine_results.py"""
import json, glob, collections, time
from pathlib import Path

SRC = Path(r"C:\Users\annev\workspace\pine_screen\results")
PROGRESS = Path(r"C:\Users\annev\workspace\trading_strategies_indicators\progress\progress.json")
OUT = Path(__file__).resolve().parents[1] / "data" / "exports" / "pine_results.json"
TF = {"daily": "Daily", "1h": "1H", "15m": "15m", "5m": "5m"}
COLS = ["strategy_id", "ticker", "timeframe", "bars", "from", "to",
        "trades", "win_rate", "avg_trade", "median_trade", "profit_factor", "sum_trades", "avg_bars", "longs", "shorts",
        "is_trades", "is_avg_trade", "is_profit_factor", "is_win_rate",
        "oos_trades", "oos_avg_trade", "oos_median_trade", "oos_profit_factor", "oos_win_rate",
        "sharpe", "sortino", "max_drawdown", "trades_per_month", "buyhold_pct",
        "drift_trade", "edge_trade", "is_edge_trade", "oos_edge_trade"]


def drift_per_bar(x):
    """Average % move per bar of simply holding the stock over the tested period (geometric)."""
    bh, bars = x.get("buyhold_return_pct"), x.get("bars")
    if bh is None or not bars or bh <= -1: return None
    return 100 * ((1 + bh) ** (1 / bars) - 1)


def edge(avg, hold_bars, x):
    """Per-trade % beyond what the stock's own drift gave for the same holding time and net direction:
    a long-only system on a rising stock does not get credit for the rise."""
    d = drift_per_bar(x)
    n = (x.get("t_long") or 0) + (x.get("t_short") or 0)
    if avg is None or d is None or not hold_bars or not n: return None
    net_dir = ((x.get("t_long") or 0) - (x.get("t_short") or 0)) / n
    return avg - d * hold_bars * net_dir


def r(v, d=3):
    return None if v is None else round(v, d)


def main():
    meta = json.loads(PROGRESS.read_text(encoding="utf-8"))["scripts"]
    rows, strategies = [], {}
    errors = collections.defaultdict(collections.Counter)
    files = sorted(glob.glob(str(SRC / "*" / "*.jsonl")))
    for f in files:
        for line in open(f, encoding="utf-8"):
            try: x = json.loads(line)
            except Exception: continue
            sid = x["strategy"]
            if sid not in strategies:
                m = meta.get(sid, {})
                strategies[sid] = {"title": m.get("title") or x.get("family") or sid, "author": m.get("author"),
                                   "url": m.get("url"), "runs": 0, "errors": 0, "error_kinds": {}}
            s = strategies[sid]
            if "error" in x:
                s["errors"] += 1
                msg = str(x["error"])
                kind = ("needs other data" if "DATA_BLOCKED" in msg else "does not compile" if "compile" in msg
                        else "timeout/crash" if "timeout" in msg else "runtime error")
                errors[sid][kind] += 1
                continue
            s["runs"] += 1
            if not x.get("t_n"): continue                       # ran, but never traded: nothing to rank
            rows.append([sid, x["ticker"], TF.get(x["tf"], x["tf"]), x.get("bars"), x.get("from"), x.get("to"),
                         x.get("t_n"), r(x.get("t_win"), 1), r(x.get("t_avg")), r(x.get("t_med")), r(x.get("t_pf")),
                         r(x.get("t_sum"), 1), r(x.get("t_bars"), 1), x.get("t_long"), x.get("t_short"),
                         x.get("is_n"), r(x.get("is_avg")), r(x.get("is_pf")), r(x.get("is_win"), 1),
                         x.get("oos_n"), r(x.get("oos_avg")), r(x.get("oos_med")), r(x.get("oos_pf")), r(x.get("oos_win"), 1),
                         r(x.get("sharpe")), r(x.get("sortino")),
                         r(-100 * x["mdd"], 2) if x.get("mdd") is not None else None,
                         r(x.get("trades_per_month"), 2),
                         r(100 * x["buyhold_return_pct"], 1) if x.get("buyhold_return_pct") is not None else None,
                         r(edge(0, x.get("t_bars"), x) * -1 if edge(0, x.get("t_bars"), x) is not None else None),
                         r(edge(x.get("t_avg"), x.get("t_bars"), x)), r(edge(x.get("is_avg"), x.get("is_bars"), x)),
                         r(edge(x.get("oos_avg"), x.get("oos_bars"), x))])
    for sid, c in errors.items(): strategies[sid]["error_kinds"] = dict(c)
    done = sum(1 for f in glob.glob(str(SRC / "*" / "*.done")))
    OUT.write_text(json.dumps({"columns": COLS, "rows": rows, "strategies": strategies,
                               "meta": {"generated": time.strftime("%Y-%m-%d %H:%M"), "datasets_done": done,
                                        "datasets_total": len(glob.glob(r"C:\Users\annev\workspace\pine_screen\data\*\*.csv")),
                                        "engine": "Foresight (runs the .pine directly)", "oos_split": 0.7}},
                              separators=(",", ":")), encoding="utf-8")
    print(f"{len(rows)} rows, {len(strategies)} strategies, {done} datasets done -> {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
