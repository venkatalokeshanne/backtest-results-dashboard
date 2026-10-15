"""Export the Foresight screening of TradingView Pine strategies into data/exports/pine_meta.json and
pine_results_<daily|1h|15m|5m>.json (one per timeframe).
Source: C:/Users/annev/workspace/pine_screen/results_pos/<tf>/<TICKER>.jsonl (runner.py's records with the trade
statistics recomputed by restat.py), else results/.
Each line is one strategy run as published (its own inputs and strategy() settings) on one ticker and
timeframe, by Foresight, which runs the .pine directly. Trade figures are per-trade NET % returns where a trade is a
POSITION (partial exits merged into their entry, scale-ins into one campaign): P&L / capital entered, commission
included, position size cancels out. "is_" = trades entered in
the first 70% of the bars, "oos_" = the last 30%; nothing was tuned on either part.

Rows that errored (data the script needs that we don't have, retired libraries, ...) are not rows here;
they are counted per strategy in `strategies[id].errors`. Run: python scripts/export_pine_results.py"""
import json, glob, collections, time
from pathlib import Path

# results_pos/: the same records with every trade statistic recomputed from the saved trades, one trade = one position
# (partial exits and scale-ins merged; pine_screen/restat.py). results/ keeps the run markers (.done).
RUNS = Path(r"C:\Users\annev\workspace\pine_screen\results")
SRC = RUNS.parent / "results_pos" if (RUNS.parent / "results_pos").exists() else RUNS
PROGRESS = Path(r"C:\Users\annev\workspace\trading_strategies_indicators\progress\progress.json")
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "exports"
# One file per timeframe (each well under GitHub's 100 MB file limit; nothing is dropped) plus a meta file
# with the column names and the strategy list. The dashboard loads only the timeframe being viewed.
TF_FILE = {"Daily": "daily", "1H": "1h", "15m": "15m", "5m": "5m"}
TF = {"daily": "Daily", "1h": "1H", "15m": "15m", "5m": "5m"}
COLS = ["strategy_id", "ticker", "timeframe", "bars", "from", "to",
        "trades", "win_rate", "avg_trade", "median_trade", "profit_factor", "sum_trades", "avg_bars", "longs", "shorts",
        "is_trades", "is_avg_trade", "is_profit_factor", "is_win_rate",
        "oos_trades", "oos_avg_trade", "oos_median_trade", "oos_profit_factor", "oos_win_rate",
        "sharpe", "sortino", "max_drawdown", "trades_per_month", "buyhold_pct",
        "drift_trade", "edge_trade", "is_edge_trade", "oos_edge_trade"]
DEPTHS = (1000, 2000, 3000, 4000)
for _d in DEPTHS:
    COLS += [f"d{_d}_trades", f"d{_d}_avg_trade", f"d{_d}_win_rate", f"d{_d}_profit_factor", f"d{_d}_edge_trade",
             f"d{_d}_net_pct", f"d{_d}_max_dd", f"d{_d}_from"]
# net % = sum of the per-trade net % returns (commission in, the script's own sizing out; not compounded,
# because overlapping positions would compound into impossible figures); max dd = largest fall of that
# running sum in percentage points, negative like the TrendSpider rows
COLS += ["net_profit_pct", "trade_max_dd", "is_net_pct", "oos_net_pct", "oos_max_dd", "oos_from"]


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


def neg(v):
    return None if v is None else -round(v, 2)


def r(v, d=3):
    return None if v is None else round(v, d)


PINE_DIR = Path(r"C:\Users\annev\workspace\trading_strategies_indicators\TradingView\strategies")


def mark_duplicates(strategies):
    """Authors sometimes republish the same code under another title. Two strategies whose source is the same
    once comments, whitespace and the strategy() title are removed get `dup_of` = the first one's id, so the
    dashboard does not count them as two independent results."""
    import hashlib, re
    first = {}
    for sid in sorted(strategies):
        files = list(PINE_DIR.glob(f"{sid}*.pine"))
        if not files: continue
        src = files[0].read_text(encoding="utf-8", errors="replace")
        src = re.sub(r"//[^\n]*", "", src)
        src = re.sub(r"strategy\s*\(\s*(title\s*=\s*)?(\"[^\"]*\"|'[^']*')", "strategy(", src)
        key = hashlib.sha1(re.sub(r"\s+", "", src).encode()).hexdigest()
        if key in first: strategies[sid]["dup_of"] = first[key]
        else: first[key] = sid


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
                         r(edge(x.get("oos_avg"), x.get("oos_bars"), x))]
                        + [v for d in DEPTHS for v in (x.get(f"d{d}_n"), r(x.get(f"d{d}_avg")), r(x.get(f"d{d}_win"), 1),
                                                       r(x.get(f"d{d}_pf")), r(edge(x.get(f"d{d}_avg"), x.get(f"d{d}_bars"), x)),
                                                       r(x.get(f"d{d}_net"), 2), neg(x.get(f"d{d}_dd")), x.get(f"d{d}_from"))]
                        + [r(x.get("t_net"), 2), neg(x.get("t_dd")), r(x.get("is_net"), 2), r(x.get("oos_net"), 2),
                           neg(x.get("oos_dd")), x.get("oos_from")])
    for sid, c in errors.items(): strategies[sid]["error_kinds"] = dict(c)
    # Foresight's repaint check per strategy x timeframe (pine_screen/repaint.py): "repaints" = the historical
    # trades used data not available at the time, so those results are fiction
    rp = SRC.parent / "repaint.jsonl"
    if rp.exists():
        for line in open(rp, encoding="utf-8"):
            x = json.loads(line)
            if x["strategy"] in strategies and x.get("verdict"):
                strategies[x["strategy"]].setdefault("repaint", {})[TF.get(x["tf"], x["tf"])] = {
                    "verdict": x["verdict"], "vectors": x.get("vectors", []), "checked_on": x.get("ticker"),
                    "as_written": x.get("as_written"), "matched": x.get("matched")}
    for sid, s in strategies.items(): s["traded"] = 0
    for row in rows: strategies[row[0]]["traded"] += 1
    mark_duplicates(strategies)
    done = sum(1 for f in glob.glob(str(RUNS / "*" / "*.done")))
    kinds = collections.Counter()
    for c in errors.values(): kinds.update(c)
    meta = {"generated": time.strftime("%Y-%m-%d %H:%M"), "datasets_done": done,
            "datasets_total": len(glob.glob(r"C:\Users\annev\workspace\pine_screen\data\*\*.csv")),
            "engine": "Foresight (runs the .pine directly)", "oos_split": 0.7, "timeframes": list(TF_FILE),
            "tickers": sorted({row[1] for row in rows}),
            "totals": {"runs": sum(s["runs"] + s["errors"] for s in strategies.values()), "traded": len(rows),
                       "no_closed_trades": sum(s["runs"] for s in strategies.values()) - len(rows),
                       "could_not_run": dict(kinds)}}
    (OUT_DIR / "pine_meta.json").write_text(json.dumps({"columns": COLS, "strategies": strategies, "meta": meta},
                                                       separators=(",", ":")), encoding="utf-8")
    for tf, name in TF_FILE.items():
        part = [row for row in rows if row[2] == tf]
        f = OUT_DIR / f"pine_results_{name}.json"
        f.write_text(json.dumps({"rows": part}, separators=(",", ":")), encoding="utf-8")
        print(f"  {f.name}: {len(part)} rows, {f.stat().st_size / 1e6:.1f} MB")
    old = OUT_DIR / "pine_results.json"           # the single-file format this replaced
    if old.exists(): old.unlink()
    print(f"{len(rows)} rows, {len(strategies)} strategies, {done} datasets done")


if __name__ == "__main__":
    main()
