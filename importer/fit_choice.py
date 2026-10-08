"""Fit how real recruits and transfers chose schools (M3 valuation).

    python3 importer/fit_choice.py [--years 2024 2025]

A conditional logit over each player's plausible suitors: for a recruit, the FBS schools whose signing class
that year spans his rating (between its 10th and 95th percentile recruit, a stand-in for offers, which CFBD
doesn't have). Features are what the game knows about a school before
signing day: prestige, last season, distance from home, home state, power conference. Money and playing time
aren't in the data; the game sets those weights and checks them against the M3 gates.

Writes data/valuation/choice_fit.json and prints the weights with how often the model's top school was right.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "importer/.cache"
P4 = {"SEC", "Big Ten", "ACC", "Big 12"}
FEATURES = ["prestige", "prestige_x_quality", "log_distance", "home_state", "win_pct", "power", "power_x_quality"]


def miles(a: float, b: float, c: float, d: float) -> float:
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 2 * 3959 * math.asin(math.sqrt(h))


def win_pcts(year: int) -> dict[str, float]:
    f = CACHE / f"records__year-{year}.json"
    if not f.exists():
        return {}
    return {r["team"]: r["total"]["wins"] / max(1, r["total"]["games"]) for r in json.loads(f.read_text())}


def rows(year: int, fbs: dict[str, dict]) -> list[tuple[np.ndarray, int, str]]:
    """(feature matrix over suitors, index of the real choice, kind) per player who signed with an FBS school."""
    wp = win_pcts(year - 1)
    out = []
    recruits = json.loads((CACHE / f"recruiting_players__year-{year}_classification-HighSchool.json").read_text())
    signed = [r for r in recruits if r.get("committedTo") in fbs and r.get("rating") and (r.get("hometownInfo") or {}).get("latitude") is not None]
    cls = defaultdict(list)
    for r in signed:
        cls[r["committedTo"]].append(r["rating"])
    band = {s: (float(np.quantile(v, 0.1)), float(np.quantile(v, 0.95))) for s, v in cls.items()}
    for r in signed:
        suitors = [s for s, (lo, hi) in band.items() if lo - 0.005 <= r["rating"] <= hi + 0.005]
        if r["committedTo"] not in suitors:
            suitors.append(r["committedTo"])
        h = r["hometownInfo"]
        q = (r["rating"] - 0.86) / 0.04
        out.append((feats(suitors, fbs, wp, float(h["latitude"]), float(h["longitude"]), r.get("stateProvince"), q), suitors.index(r["committedTo"]), "recruit"))
    return out


TRANSFER_FEATURES = ["prestige", "prestige_up", "log_distance", "same_conference", "win_pct", "power"]


def transfer_rows(year: int, fbs: dict[str, dict]) -> list[tuple[np.ndarray, int, str]]:
    """Rated transfers who left one FBS school for another, over the schools that took comparable transfers."""
    wp = win_pcts(year - 1)
    moves = [m for m in json.loads((CACHE / f"player_portal__year-{year}.json").read_text())
             if m.get("origin") in fbs and m.get("destination") in fbs and m.get("rating")]
    took = defaultdict(list)
    for m in moves:
        took[m["destination"]].append(m["rating"])
    band = {s: (float(np.quantile(v, 0.1)), float(np.quantile(v, 0.95))) for s, v in took.items() if len(v) >= 3}
    out = []
    for m in moves:
        suitors = [s for s, (lo, hi) in band.items() if lo - 0.005 <= m["rating"] <= hi + 0.005 and s != m["origin"]]
        if m["destination"] not in suitors:
            suitors.append(m["destination"])
        o = fbs[m["origin"]]
        ov = o["venue"]
        po = (o.get("prestige") or 0) / 100
        x = []
        for s in suitors:
            t = fbs[s]
            v = t["venue"]
            p = (t.get("prestige") or 0) / 100
            x.append([p, max(0.0, p - po), math.log1p(miles(ov["lat"], ov["lon"], v["lat"], v["lon"]) / 50),
                      1.0 if t["conference"] == o["conference"] else 0.0, wp.get(s, 0.5), 1.0 if t["conference"] in P4 or s == "Notre Dame" else 0.0])
        out.append((np.array(x), suitors.index(m["destination"]), "transfer"))
    return out


def feats(suitors: list[str], fbs: dict[str, dict], wp: dict[str, float], lat: float, lon: float, state: str | None, q: float) -> np.ndarray:
    m = []
    for s in suitors:
        t = fbs[s]
        v = t.get("venue") or {}
        p = (t.get("prestige") or 0) / 100
        power = 1.0 if t["conference"] in P4 or s == "Notre Dame" else 0.0
        d = miles(lat, lon, v["lat"], v["lon"]) if v.get("lat") is not None else 800
        m.append([p, p * q, math.log1p(d / 50), 1.0 if state and v.get("state") == state else 0.0, wp.get(s, 0.5), power, power * q])
    return np.array(m)


def fit(data: list[tuple[np.ndarray, int, str]]) -> tuple[np.ndarray, float, float]:
    def nll(w: np.ndarray) -> float:
        total = 0.0
        for x, y, _ in data:
            u = x @ w
            u -= u.max()
            total -= u[y] - math.log(np.exp(u).sum())
        return total
    res = minimize(nll, np.zeros(data[0][0].shape[1]), method="L-BFGS-B")
    w = res.x
    hit = sum(int(np.argmax(x @ w) == y) for x, y, _ in data) / len(data)
    base = sum(1 / len(x) for x, _, _ in data) / len(data)
    return w, hit, base


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="+", default=[2024, 2025])
    args = ap.parse_args()
    teams = json.loads((ROOT / "data/seed/2026wk1/teams.json").read_text())
    fbs = {t["school"]: t for t in teams if t["level"] == "fbs" and (t.get("venue") or {}).get("lat") is not None}
    data = [r for y in args.years for r in rows(y, fbs)]
    w, hit, base = fit(data)
    print(f"{len(data)} recruits, {sum(len(x) for x, _, _ in data) / len(data):.0f} suitors each")
    for k, v in zip(FEATURES, w):
        print(f"  {k:20s} {v:+.3f}")
    print(f"top school right {hit:.1%} (chance {base:.1%})")
    tdata = [r for y in args.years for r in transfer_rows(y, fbs)]
    tw, thit, tbase = fit(tdata)
    print(f"{len(tdata)} transfers, {sum(len(x) for x, _, _ in tdata) / len(tdata):.0f} suitors each")
    for k, v in zip(TRANSFER_FEATURES, tw):
        print(f"  {k:20s} {v:+.3f}")
    print(f"top school right {thit:.1%} (chance {tbase:.1%})")
    out = ROOT / "data/valuation"
    out.mkdir(parents=True, exist_ok=True)
    (out / "choice_fit.json").write_text(json.dumps({"years": args.years, "recruits": len(data), "features": FEATURES,
        "recruit": {k: round(float(v), 4) for k, v in zip(FEATURES, w)}, "top_hit": round(hit, 4), "chance": round(base, 4),
        "transfers": len(tdata), "transfer_features": TRANSFER_FEATURES, "transfer": {k: round(float(v), 4) for k, v in zip(TRANSFER_FEATURES, tw)},
        "transfer_top_hit": round(thit, 4), "transfer_chance": round(tbase, 4)}, indent=1))


if __name__ == "__main__":
    main()
