"""Build a day-trading playbook: the best strategy for each combination of
market condition and ticker type.

Reads the same static inputs the dashboard reads (data/exports/results.json
plus the two config/ classification files) and writes
data/exports/daytrading_playbook.json, served by /api/playbook.

Method, in short
----------------
1. DAY-TRADING UNIVERSE. Only intraday timeframes (5m/15m/1H), and within
   those only strategy+timeframe pairs whose *measured* median holding
   period is under one trading session. avg_length is in bars (verified:
   trade_count * avg_length / depth tracks the exposure column), so the
   hold is converted to trading days via BARS_PER_DAY.

2. MARKET CONDITION. A "window" is one (ticker, timeframe, depth) backtest.
   Its regime is labelled from ASSET-side columns only — asset_perf
   (buy & hold over the window) and r_vol_asset (the asset's realised
   volatility). No strategy result feeds the labelling, so a strategy can
   never be scored against a regime its own performance helped define.
   Both axes are cut on percentiles *within* a (timeframe, depth) cohort,
   because windows of 1000 and 4000 bars cover very different spans and
   their raw numbers are not comparable.

3. EDGE, NOT RETURN. In a bull window almost every long strategy makes
   money, so raw net_profit_pct mostly measures beta. Every run is scored
   on excess return over buy & hold (net_profit_pct - asset_perf).

4. PAIRED RANKING. Within each window all eligible strategies traded the
   same ticker over the same bars, so they are directly comparable. Each
   strategy gets a percentile rank against its peers in that window, and
   its cell score is the median of those ranks. This removes window
   length, ticker volatility and vendor scaling from the comparison
   entirely — no magic normalising constants.

5. CELLS. One cell per (ticker type, regime). Ticker types are the
   user-supplied secondary_tags, case-normalised (the raw config mixes
   "Growth"/"growth"). A strategy must clear minimum evidence bars in
   distinct tickers and runs before it can be recommended.

Limitations are recorded in the output's `meta.caveats` and surfaced in
the UI: this dataset is LONG-only, single-asset-class, has no dates on
the backtest windows, and covers one vendor's fills.
"""

import json
import os
import statistics as st
from collections import Counter, defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS = os.path.join(ROOT, "data", "exports")
CONFIG = os.path.join(ROOT, "config")
OUT_PATH = os.path.join(EXPORTS, "daytrading_playbook.json")

# US regular session: 6.5h. Only used to turn avg_length (bars) into a
# holding period in trading days for the day-trading gate.
BARS_PER_DAY = {"5m": 78.0, "15m": 26.0, "1H": 6.5}
MAX_HOLD_DAYS = 1.0
# A median hold shorter than one full bar means the backtester opened and
# closed inside the same candle, where the fill sequencing is unknowable —
# not something a live day trader can reproduce. Exactly one strategy trips
# this ("Zero Lag MA Long Strategy", 0.8/0.4/0.2 bars on 5m/15m/1H), and it
# otherwise topped most bear-regime cells on a near-flat equity curve, so
# the exclusion matters. The threshold is deliberately one bar and not two:
# at 1H several legitimate strategies hold 1.2-1.4 bars, which is 1.2-1.4
# hours of real intraday exposure.
MIN_HOLD_BARS = 1.0

# Same cap lib/data.ts applies: a handful of vendor net_profit_pct values
# are internally broken (one reached 261 billion percent).
NET_PROFIT_PCT_CAP = 10000.0

MIN_TRADES = 20          # per run, so a run is not two lucky fills
MIN_RUNS_FOR_GATE = 10   # per strategy+timeframe, for the hold-period gate
MIN_TICKERS_PER_TAG = 4  # a "ticker type" needs a real cohort
MIN_PEERS_PER_WINDOW = 8 # windows with too few eligible strategies can't rank

# Evidence bars for a cell recommendation.
TIER_RULES = [
    # (label, min_runs, min_tickers, min_score, min_beat_rate)
    ("HIGH", 30, 5, 65.0, 0.70),
    ("MEDIUM", 20, 4, 57.0, 0.60),
    ("LOW", 12, 3, 0.0, 0.55),
]

TREND_CUTS = [("Bear", 0.0, 1 / 3), ("Chop", 1 / 3, 2 / 3), ("Bull", 2 / 3, 1.0)]
VOL_CUTS = [("Normal vol", 0.0, 0.5), ("High vol", 0.5, 1.0)]

REGIME_BLURBS = {
    "bull-normal-vol": "Asset trending up on contained volatility — the easiest tape, and the one where beating buy & hold is hardest.",
    "bull-high-vol": "Asset up but violently — big trends punctuated by sharp shakeouts.",
    "chop-normal-vol": "Directionless and quiet. Buy & hold earns nothing, so any edge here is pure strategy.",
    "chop-high-vol": "Directionless but wide daily ranges — the classic intraday mean-reversion tape.",
    "bear-normal-vol": "Grinding downtrend. A long-only book's hardest regime; the goal is losing less than the asset.",
    "bear-high-vol": "Sharp selloffs with violent bounces. Survivability matters more than upside.",
}


def norm_tag(s):
    return " ".join(s.strip().lower().split())


def pct_rank(sorted_vals, v):
    """Fraction of values strictly below v, midpoint-adjusted for ties."""
    lo, hi = 0, len(sorted_vals)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_vals[mid] < v:
            lo = mid + 1
        else:
            hi = mid
    below = lo
    lo, hi = 0, len(sorted_vals)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_vals[mid] <= v:
            lo = mid + 1
        else:
            hi = mid
    at_or_below = lo
    return (below + at_or_below) / 2.0 / len(sorted_vals)


def med(xs):
    xs = [x for x in xs if x is not None]
    return st.median(xs) if xs else None


def r2(v, nd=2):
    return None if v is None else round(v, nd)


def load_inputs():
    with open(os.path.join(EXPORTS, "results.json"), encoding="utf-8") as fh:
        raw = json.load(fh)
    with open(os.path.join(CONFIG, "strategy_classification.json"), encoding="utf-8") as fh:
        strat_class = json.load(fh)["categories"]
    with open(os.path.join(CONFIG, "ticker_classification.json"), encoding="utf-8") as fh:
        ticker_class = json.load(fh)["categories"]
    return raw, strat_class, ticker_class


def build_runs(raw):
    """Inflate the columnar export into dicts, intraday rows only."""
    idx = {c: i for i, c in enumerate(raw["columns"])}
    want = ["strategy_name", "ticker", "timeframe", "depth", "net_profit_pct",
            "asset_perf", "r_vol_asset", "sharpe", "max_drawdown", "max_dd_asset",
            "trade_count", "win_rate", "avg_length", "trades_per_day", "expectancy",
            "exposure"]
    runs = []
    for row in raw["rows"]:
        if row[idx["timeframe"]] not in BARS_PER_DAY:
            continue
        r = {k: row[idx[k]] for k in want}
        if r["trade_count"] is None or r["trade_count"] < MIN_TRADES:
            continue
        if r["net_profit_pct"] is None or r["net_profit_pct"] > NET_PROFIT_PCT_CAP:
            continue
        if r["asset_perf"] is None:
            continue
        r["excess"] = r["net_profit_pct"] - r["asset_perf"]
        r["hold_days"] = (r["avg_length"] / BARS_PER_DAY[r["timeframe"]]
                          if r["avg_length"] is not None else None)
        runs.append(r)
    return runs


def day_trade_gate(runs):
    """strategy+timeframe pairs whose median hold is inside one session."""
    holds = defaultdict(list)
    for r in runs:
        if r["hold_days"] is not None:
            holds[(r["strategy_name"], r["timeframe"])].append(r["hold_days"])
    eligible, too_long, too_short = set(), {}, {}
    for key, vals in holds.items():
        if len(vals) < MIN_RUNS_FOR_GATE:
            continue
        m = st.median(vals)
        bars = m * BARS_PER_DAY[key[1]]
        if bars < MIN_HOLD_BARS:
            too_short[key] = bars
        elif m < MAX_HOLD_DAYS:
            eligible.add(key)
        else:
            too_long[key] = m
    return eligible, too_long, too_short


def label_regimes(runs):
    """Assign each (ticker, timeframe, depth) window a regime, using only
    asset-side columns, cut on percentiles within its (timeframe, depth)
    cohort so windows of different lengths stay comparable."""
    perf, vol = defaultdict(list), defaultdict(list)
    for r in runs:
        w = (r["ticker"], r["timeframe"], r["depth"])
        perf[w].append(r["asset_perf"])
        if r["r_vol_asset"] is not None:
            vol[w].append(r["r_vol_asset"])

    windows = {}
    for w, vals in perf.items():
        windows[w] = {"asset_perf": st.median(vals),
                      "r_vol_asset": st.median(vol[w]) if vol.get(w) else None}

    cohorts = defaultdict(list)
    for w in windows:
        cohorts[(w[1], w[2])].append(w)

    for cohort, ws in cohorts.items():
        perf_sorted = sorted(windows[w]["asset_perf"] for w in ws)
        vol_vals = [windows[w]["r_vol_asset"] for w in ws if windows[w]["r_vol_asset"] is not None]
        vol_sorted = sorted(vol_vals)
        for w in ws:
            p = pct_rank(perf_sorted, windows[w]["asset_perf"])
            trend = next(name for name, lo, hi in TREND_CUTS if lo <= p < hi or hi == 1.0 and p >= lo)
            av = windows[w]["r_vol_asset"]
            if av is None or not vol_sorted:
                volname = None
            else:
                q = pct_rank(vol_sorted, av)
                volname = next(n for n, lo, hi in VOL_CUTS if lo <= q < hi or hi == 1.0 and q >= lo)
            windows[w]["trend"] = trend
            windows[w]["vol"] = volname
            windows[w]["regime"] = (f"{trend.lower()}-{volname.lower().replace(' ', '-')}"
                                    if volname else None)
    return windows


def rank_within_windows(runs, windows, eligible):
    """Percentile-rank every eligible strategy against its peers on the
    same window. Same ticker, same bars, same everything but the rules."""
    by_window = defaultdict(list)
    for r in runs:
        if (r["strategy_name"], r["timeframe"]) not in eligible:
            continue
        w = (r["ticker"], r["timeframe"], r["depth"])
        if windows.get(w, {}).get("regime") is None:
            continue
        by_window[w].append(r)

    ranked = []
    for w, rs in by_window.items():
        if len(rs) < MIN_PEERS_PER_WINDOW:
            continue
        excess_sorted = sorted(r["excess"] for r in rs)
        for r in rs:
            r["window_rank"] = pct_rank(excess_sorted, r["excess"]) * 100.0
            r["regime"] = windows[w]["regime"]
            r["window_asset_perf"] = windows[w]["asset_perf"]
            ranked.append(r)
    return ranked


def score_cells(ranked, ticker_tags, strat_class):
    """One cell per (ticker type, regime); rank strategies inside it."""
    buckets = defaultdict(list)
    for r in ranked:
        for tag in ticker_tags.get(r["ticker"], ()):
            buckets[(tag, r["regime"])].append(r)

    cells = []
    for (tag, regime), rs in sorted(buckets.items()):
        by_strategy = defaultdict(list)
        for r in rs:
            by_strategy[r["strategy_name"]].append(r)

        entries = []
        for name, srs in by_strategy.items():
            tickers = {r["ticker"] for r in srs}
            n_runs, n_tickers = len(srs), len(tickers)
            if n_runs < TIER_RULES[-1][1] or n_tickers < TIER_RULES[-1][2]:
                continue

            # Per-ticker medians first, so a ticker with more windows in
            # this cell cannot dominate the strategy's profile.
            per_ticker = defaultdict(list)
            for r in srs:
                per_ticker[r["ticker"]].append(r["excess"])
            breadth = sum(1 for v in per_ticker.values() if st.median(v) > 0) / n_tickers

            rank_score = st.median([r["window_rank"] for r in srs])
            beat_rate = sum(1 for r in srs if r["excess"] > 0) / n_runs
            pos_rate = sum(1 for r in srs if r["net_profit_pct"] > 0) / n_runs
            med_sharpe = med([r["sharpe"] for r in srs])
            sharpe_component = min(max((med_sharpe or 0.0) / 3.0, 0.0), 1.0)

            # Relative edge dominates, but absolute profitability carries
            # real weight so a strategy cannot score well purely by sitting
            # in cash while the asset falls.
            score = (0.35 * (rank_score / 100.0)
                     + 0.20 * beat_rate
                     + 0.20 * breadth
                     + 0.15 * pos_rate
                     + 0.10 * sharpe_component) * 100.0

            sc = strat_class.get(name) or {}
            entries.append({
                "strategy": name,
                "family": sc.get("family"),
                "setup": sc.get("setup"),
                "score": r2(score, 1),
                "rank_score": r2(rank_score, 1),
                "beat_bh_rate": r2(beat_rate, 3),
                "positive_rate": r2(pos_rate, 3),
                "ticker_breadth": r2(breadth, 3),
                "median_excess_pct": r2(med([r["excess"] for r in srs])),
                "median_net_profit_pct": r2(med([r["net_profit_pct"] for r in srs])),
                "median_asset_perf_pct": r2(med([r["window_asset_perf"] for r in srs])),
                "median_sharpe": r2(med_sharpe),
                "median_max_dd": r2(med([r["max_drawdown"] for r in srs])),
                "median_asset_max_dd": r2(med([r["max_dd_asset"] for r in srs])),
                "median_win_rate": r2(med([r["win_rate"] for r in srs])),
                "median_trades": r2(med([r["trade_count"] for r in srs]), 0),
                "median_trades_per_day": r2(med([r["trades_per_day"] for r in srs])),
                "median_exposure_pct": r2(med([r["exposure"] for r in srs]), 1),
                "median_hold_days": r2(med([r["hold_days"] for r in srs])),
                "timeframes": sorted({r["timeframe"] for r in srs},
                                     key=lambda t: list(BARS_PER_DAY).index(t)),
                "n_runs": n_runs,
                "n_tickers": n_tickers,
            })
            entries[-1]["confidence"] = tier_for(entries[-1])

        entries.sort(key=lambda e: -e["score"])
        if not entries:
            continue

        usable = [e for e in entries if e["confidence"] != "NO EDGE"]
        asset_perf = med([r["window_asset_perf"] for r in rs])

        # When nothing clears the bar the honest answer depends on what the
        # asset itself did: in a rising tape the recommendation is to hold
        # it rather than trade it, in a flat/falling one it is to stay out.
        if usable:
            verdict = "trade"
        elif asset_perf is not None and asset_perf > 0:
            verdict = "hold_asset"
        else:
            verdict = "stay_flat"

        cells.append({
            "ticker_type": tag,
            "regime": regime,
            "verdict": verdict,
            "n_runs": len(rs),
            "n_tickers": len({r["ticker"] for r in rs}),
            "n_strategies_evaluated": len(by_strategy),
            "median_asset_perf_pct": r2(asset_perf),
            "n_strategies_beating_bh": sum(1 for e in entries if (e["median_excess_pct"] or 0) > 0),
            "primary": usable[0] if usable else None,
            "backup": next((e for e in usable[1:]
                            if e["family"] != usable[0]["family"]), usable[1] if len(usable) > 1 else None)
                      if usable else None,
            # Shown even when nothing qualifies, labelled as "closest thing",
            # so a no-edge cell still says what came nearest.
            "best_available": entries[0],
            "top": entries[:8],
        })
    return cells


def tier_for(e):
    # A recommendation has to clear both bars: beat buy & hold AND stand on
    # its own. Excess alone would crown strategies whose only virtue in a
    # falling market is being flat, on a near-zero equity curve.
    if (e["median_excess_pct"] or 0) <= 0:
        return "NO EDGE"
    if (e["median_net_profit_pct"] or 0) <= 0:
        return "NO EDGE"
    if (e["median_sharpe"] or -1) <= 0:
        return "NO EDGE"
    if e["positive_rate"] < 0.5:
        return "NO EDGE"
    if e["rank_score"] < 50.0:
        return "NO EDGE"
    for label, min_runs, min_tk, min_score, min_beat in TIER_RULES:
        if (e["n_runs"] >= min_runs and e["n_tickers"] >= min_tk
                and e["score"] >= min_score and e["beat_bh_rate"] >= min_beat):
            return label
    return "NO EDGE"


def family_matrix(ranked, strat_class):
    """Regime x strategy-family rollup — the headline 'what works when'."""
    buckets = defaultdict(list)
    for r in ranked:
        fam = (strat_class.get(r["strategy_name"]) or {}).get("family")
        if fam:
            buckets[(r["regime"], fam)].append(r)
    out = []
    for (regime, fam), rs in sorted(buckets.items()):
        if len(rs) < 40:
            continue
        out.append({
            "regime": regime,
            "family": fam,
            "n_runs": len(rs),
            "n_strategies": len({r["strategy_name"] for r in rs}),
            "rank_score": r2(st.median([r["window_rank"] for r in rs]), 1),
            "median_excess_pct": r2(med([r["excess"] for r in rs])),
            "beat_bh_rate": r2(sum(1 for r in rs if r["excess"] > 0) / len(rs), 3),
            "median_sharpe": r2(med([r["sharpe"] for r in rs])),
        })
    return out


def main():
    raw, strat_class, ticker_class = load_inputs()
    runs = build_runs(raw)
    print(f"intraday runs clearing basic quality bars: {len(runs):,}")

    eligible, too_long, too_short = day_trade_gate(runs)
    print(f"day-trade-eligible strategy+timeframe pairs: {len(eligible)} "
          f"(rejected {len(too_long)} for holding overnight, "
          f"{len(too_short)} for sub-{MIN_HOLD_BARS:.0f}-bar intrabar fills)")
    if too_short:
        print("  intrabar-artifact pairs excluded: "
              + ", ".join(sorted(f"{s} ({tf})" for s, tf in too_short)))

    windows = label_regimes(runs)
    labelled = [w for w in windows.values() if w["regime"]]
    unlabelled = len(windows) - len(labelled)
    print(f"windows labelled: {len(labelled)}/{len(windows)} "
          f"({unlabelled} dropped for missing asset volatility)")
    print("regime spread:", Counter(w["regime"] for w in labelled).most_common())

    ranked = rank_within_windows(runs, windows, eligible)
    print(f"ranked runs: {len(ranked):,}")

    tag_members = defaultdict(set)
    for tk, meta in ticker_class.items():
        for tag in {norm_tag(t) for t in meta.get("secondary_tags", [])}:
            tag_members[tag].add(tk)
    tag_members = {t: v for t, v in tag_members.items() if len(v) >= MIN_TICKERS_PER_TAG}
    ticker_tags = defaultdict(list)
    for tag, members in tag_members.items():
        for tk in members:
            ticker_tags[tk].append(tag)
    print(f"ticker types kept: {len(tag_members)}")

    cells = score_cells(ranked, ticker_tags, strat_class)
    print(f"cells: {len(cells)}  "
          f"with a recommendation: {sum(1 for c in cells if c['primary'])}")
    print("primary confidence:", Counter(c["primary"]["confidence"] for c in cells if c["primary"]).most_common())

    regime_meta = []
    for trend, _, _ in TREND_CUTS:
        for volname, _, _ in VOL_CUTS:
            key = f"{trend.lower()}-{volname.lower().replace(' ', '-')}"
            ws = [w for w in labelled if w["regime"] == key]
            if not ws:
                continue
            perfs = sorted(w["asset_perf"] for w in ws)
            vols = sorted(w["r_vol_asset"] for w in ws if w["r_vol_asset"] is not None)
            regime_meta.append({
                "key": key, "label": f"{trend} · {volname}", "trend": trend, "vol": volname,
                "description": REGIME_BLURBS.get(key, ""),
                "n_windows": len(ws),
                "asset_perf_p25": r2(perfs[len(perfs) // 4], 1),
                "asset_perf_median": r2(st.median(perfs), 1),
                "asset_perf_p75": r2(perfs[3 * len(perfs) // 4], 1),
                "asset_vol_median": r2(st.median(vols), 1) if vols else None,
            })

    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "n_intraday_runs": len(runs),
            "n_ranked_runs": len(ranked),
            "n_day_trade_strategies": len({s for s, _ in eligible}),
            "n_windows": len(labelled),
            "n_windows_dropped_no_asset_vol": unlabelled,
            "timeframes": list(BARS_PER_DAY),
            "min_trades_per_run": MIN_TRADES,
            "max_hold_days": MAX_HOLD_DAYS,
            "min_hold_bars": MIN_HOLD_BARS,
            "excluded_intrabar": sorted(f"{s} ({tf})" for s, tf in too_short),
            "method": [
                "Intraday timeframes only (5m/15m/1H), and only strategies whose measured median holding period is under one trading session.",
                "Market conditions are labelled per backtest window from asset-side columns alone (buy & hold return and asset volatility), so no strategy result influences its own regime label.",
                "Trend and volatility are cut on percentiles within each (timeframe, depth) cohort, because 1000-bar and 4000-bar windows are not directly comparable.",
                "Every run is scored on excess return over buy & hold, not raw return — in a bull tape raw return is mostly beta.",
                "Strategies are ranked against each other on the same window (same ticker, same bars), and a strategy's cell score is the median of those paired ranks.",
                "To be recommended a strategy must both beat buy & hold and be profitable on its own terms (positive median return, positive Sharpe, profitable in most runs) — otherwise a strategy that merely sits in cash during a decline would win every bear cell on a flat equity curve.",
            ],
            "caveats": [
                "Every backtest in this dataset is LONG-only, so the bear-regime answers are 'which long strategy lost least', not 'what to short'.",
                "The export carries no backtest dates, so regimes are relative to the rest of this dataset rather than to named historical periods.",
                "Results come from one vendor's fill and cost model on 89 US equity-style tickers; they are not a substitute for forward or paper testing.",
                "Ticker types overlap — a ticker can be both 'high volatility' and 'growth', so cells are not independent samples.",
                "Windows whose asset volatility is missing from the export are dropped rather than guessed: asset max-drawdown correlates with it at only rho=0.50, too weak to substitute.",
            ],
        },
        "regimes": regime_meta,
        "ticker_types": sorted(
            ({"tag": t, "n_tickers": len(v), "tickers": sorted(v)} for t, v in tag_members.items()),
            key=lambda x: -x["n_tickers"]),
        "cells": cells,
        "family_matrix": family_matrix(ranked, strat_class),
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"wrote {OUT_PATH} ({os.path.getsize(OUT_PATH)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
