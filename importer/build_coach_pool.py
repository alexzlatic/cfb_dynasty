"""Former FBS head coaches out of work when the dynasty starts (data/seed/2026wk1/coach_pool.json), and the
real coaching-carousel rates the carousel is calibrated to (printed; see docs/staff.md).

Every FBS head coach since 2000 comes from CFBD's /coaches. The pool is everyone who was an FBS head coach in
the last seven seasons and isn't one in the dynasty's first season: fired coaches, coaches who stepped down
and coaches now coordinating somewhere (they are still candidates for head jobs, as in real life).

    python3 importer/build_coach_pool.py            # uses importer/.cache
    python3 importer/build_coach_pool.py --rates    # also print the carousel rates (2006-2024 offseasons)
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict

from build_seed import OUT, SEASON, pull

POWER = {"SEC", "Big Ten", "Big 12", "ACC", "Pac-12", "Big East"}


def is_power(conf: str, school: str, year: int) -> bool:
    if school == "Notre Dame":
        return True
    if conf == "Pac-12" and year >= 2024:
        return False
    if conf == "Big East" and year >= 2013:
        return False
    return conf in POWER


def seasons_of(c):
    return [s for s in c["seasons"] if s.get("games")]


def build_pool(coaches):
    teams = {t["school"]: t["id"] for t in json.loads((OUT / "teams.json").read_text())}
    now = {(c["firstName"], c["lastName"]) for c in coaches if any(s["year"] == SEASON for s in c["seasons"])}
    pool = []
    for c in coaches:
        name = (c["firstName"], c["lastName"])
        played = seasons_of(c)
        if name in now or not played:
            continue
        last = max(s["year"] for s in played)
        if last < SEASON - 7:
            continue
        pool.append({"first": c["firstName"], "last": c["lastName"],
                     "career": [{"year": s["year"], "team_id": teams.get(s["school"]), "school": s["school"], "wins": s["wins"],
                                 "losses": s["losses"], "ties": s.get("ties", 0)} for s in sorted(played, key=lambda s: s["year"])]})
    pool.sort(key=lambda p: (p["last"], p["first"]))
    return pool


def rates(coaches):
    """Each offseason 2006-2024: who changed head coaches, why, and where the new coach came from."""
    main = defaultdict(list)
    for c in coaches:
        for s in seasons_of(c):
            main[(s["school"], s["year"])].append(((c["firstName"], c["lastName"]), s))
    for v in main.values():
        v.sort(key=lambda x: -x[1]["games"])
    at = defaultdict(dict)
    for (school, y), v in main.items():
        for name, _ in v:
            at[name][y] = school
    power = {(school, y): is_power(v[0][1]["conference"], school, y) for (school, y), v in main.items()}
    wp = lambda s: s["wins"] / max(1, s["wins"] + s["losses"])
    n = changes = moved = 0
    by_tier = Counter()
    tier_n = Counter()
    dirs = Counter()
    buckets = defaultdict(lambda: [0, 0])
    for (school, y), v in main.items():
        if not 2006 <= y <= 2024 or (school, y + 1) not in main:
            continue
        name, s = v[0]
        p = power[(school, y)]
        n += 1
        tier_n[p] += 1
        stayed = main[(school, y + 1)][0][0] == name
        b = min(5, int(wp(s) * 5))
        if not stayed:
            changes += 1
            by_tier[p] += 1
            to = at[name].get(y + 1)
            if to and to != school:
                moved += 1
                dirs[("P4" if p else "G5") + ">" + ("P4" if power[(to, y + 1)] else "G5")] += 1
            else:
                buckets[b][0] += 1
        if stayed or not (at[name].get(y + 1) and at[name].get(y + 1) != school):
            buckets[b][1] += 1
    print(f"FBS head-coach changes a year: {changes / n:.3f} (power {by_tier[True] / tier_n[True]:.3f}, G5 {by_tier[False] / tier_n[False]:.3f})")
    print(f"share of changes that were the coach leaving for another FBS head job: {moved / changes:.3f}; moves {dict(dirs)}")
    print("let go (fired, retired, left for the NFL) by win pct:", {f"{k / 5:.1f}+": round(a / b, 3) for k, (a, b) in sorted(buckets.items())})
    src = defaultdict(Counter)
    for (school, y), v in main.items():
        if not 2007 <= y <= 2025 or (school, y - 1) not in main:
            continue
        name, prev = v[0][0], main[(school, y - 1)]
        if name == prev[0][0] or any(x == name for x, _ in prev):
            continue
        last = at[name].get(y - 1)
        kind = (f"sitting FBS head coach ({'P4' if power[(last, y - 1)] else 'G5'})" if last
                else "former FBS head coach" if any(yy < y - 1 for yy in at[name]) else "first FBS head job")
        src["P4" if power[(school, y)] else "G5"][kind] += 1
    for tier, c in src.items():
        tot = sum(c.values())
        print(f"new head coaches at {tier} schools ({tot}):", {k: round(x / tot, 3) for k, x in c.most_common()})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--rates", action="store_true")
    args = ap.parse_args()
    coaches = pull("/coaches?minYear=2000&maxYear=2026", args.refresh)
    pool = build_pool(coaches)
    (OUT / "coach_pool.json").write_text(json.dumps(pool, separators=(",", ":")) + "\n")
    print(f"coach_pool.json: {len(pool)} former FBS head coaches")
    if args.rates:
        rates(coaches)


if __name__ == "__main__":
    main()
