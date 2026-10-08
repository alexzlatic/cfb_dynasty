"""Money inputs for a seed bundle (M2): each school's home crowds from the season before, and its
football finances.

    python3 importer/build_finances.py [--season 2026]

Writes data/seed/<season>wk1/finances.json:

    {"season": 2026, "source": {...}, "teams": {"<team id>": {"attendance": 101_000, "home_games": 7,
      "lines": {...} | null, "roster_budget": 51_500_000 | null}}}

Attendance is the average home crowd (not neutral sites) in the previous season's CFBD games. `lines`
are the school's real football revenue and expenses from the Knight-Newhouse College Athletics Database
when a CSV export is in importer/.cache/knight_newhouse.csv (public schools only); otherwise null, and
the game estimates them from conference and prestige (packages/core/src/finance.ts).

`roster_budget` is what a power-conference program (or Notre Dame) spends on its roster in 2026, revenue
share and program-controlled NIL together: the middle of The Athletic's estimate in
importer/roster_budgets_2026.csv, or for schools it doesn't list, the rest of their conference's average
spread by prestige. The game scales it to the season's year (packages/core/src/money.ts).
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "importer/.cache"

# Knight-Newhouse football columns we read, by the line they feed (dollars, latest fiscal year).
KN_LINES = {
    "media": ["Media Rights", "Conference Distributions"],
    "tickets": ["Ticket Sales"],
    "donors": ["Donor Contributions"],
    "support": ["Institutional/Government Support", "Student Fees"],
    "other": ["Royalties, Licensing, Advertising & Sponsorships", "Other Revenue"],
    "coaches": ["Coaching Salaries, Benefits & Bonuses", "Support Staff Salaries, Benefits & Bonuses"],
    "operations": ["Recruiting", "Team Travel", "Equipment, Uniforms & Supplies", "Game Expenses", "Other Expenses"],
    "facilities": ["Facilities, Debt Service & Leases"],
}


def knight_newhouse(teams: list[dict]) -> tuple[dict[int, dict], str | None]:
    """Football lines by team id from a Knight-Newhouse CSV export, matched by school name."""
    path = CACHE / "knight_newhouse.csv"
    if not path.exists():
        return {}, None
    by_school = {t["school"].lower(): t["id"] for t in teams}
    out: dict[int, dict] = {}
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            tid = by_school.get((row.get("School") or row.get("Institution") or "").strip().lower())
            if tid is None or (row.get("Sport") or "Football") != "Football":
                continue
            lines = {}
            for k, cols in KN_LINES.items():
                vals = [float(str(row[c]).replace("$", "").replace(",", "")) for c in cols if row.get(c) not in (None, "")]
                if vals:
                    lines[k] = round(sum(vals))
            if lines:
                out[tid] = lines
    return out, path.name


# The Athletic's 2026 conference averages (middle of each range), for schools without their own estimate.
CONF_ROSTER = {"SEC": 35.5, "Big Ten": 29.0, "ACC": 23.0, "Big 12": 20.0}
ROSTER_FLOOR = 8.0


def roster_budgets(teams: list[dict]) -> dict[int, float]:
    """2026 roster budgets in dollars for power-conference schools and Notre Dame."""
    known: dict[str, float] = {}
    with (ROOT / "importer/roster_budgets_2026.csv").open(newline="") as f:
        for row in csv.DictReader(line for line in f if not line.startswith("#")):
            known[row["school"]] = (float(row["low"]) + float(row["high"])) / 2
    out: dict[int, float] = {}
    for conf, avg in CONF_ROSTER.items():
        members = [t for t in teams if t.get("conference") == conf]
        have = [t for t in members if t["school"] in known]
        rest = [t for t in members if t["school"] not in known]
        for t in have:
            out[t["id"]] = known[t["school"]]
        if rest:
            # What the conference's average leaves for the others, spread by prestige.
            each = (avg * len(members) - sum(out[t["id"]] for t in have)) / len(rest)
            pbar = statistics.mean(t.get("prestige") or 0 for t in rest)
            for t in rest:
                out[t["id"]] = max(ROSTER_FLOOR, each * (1 + 1.5 * ((t.get("prestige") or 0) - pbar) / 100))
    for t in teams:
        if t["school"] in known and t["id"] not in out:
            out[t["id"]] = known[t["school"]]
    return {k: round(v * 1_000_000, -4) for k, v in out.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    args = ap.parse_args()
    out_dir = ROOT / f"data/seed/{args.season}wk1"
    teams = json.loads((out_dir / "teams.json").read_text())
    by_name = {t["school"]: t["id"] for t in teams}
    games = json.loads((CACHE / f"games__year-{args.season - 1}.json").read_text())
    crowds: dict[int, list[int]] = defaultdict(list)
    for g in games:
        tid = by_name.get(g.get("homeTeam"))
        if tid is not None and not g.get("neutralSite") and g.get("attendance"):
            crowds[tid].append(int(g["attendance"]))
    kn, kn_src = knight_newhouse(teams)
    rb = roster_budgets(teams)
    out = {}
    for t in teams:
        c = crowds.get(t["id"], [])
        out[str(t["id"])] = {"attendance": round(statistics.mean(c)) if c else None, "home_games": len(c), "lines": kn.get(t["id"]), "roster_budget": rb.get(t["id"])}
    doc = {"season": args.season, "source": {"attendance": f"CFBD games {args.season - 1}", "lines": kn_src or "estimated in the game", "roster_budget": "The Athletic 2026 estimates (importer/roster_budgets_2026.csv)"}, "teams": out}
    (out_dir / "finances.json").write_text(json.dumps(doc, separators=(",", ":")))
    have = sum(1 for v in out.values() if v["attendance"])
    print(f"finances.json: attendance for {have} of {len(out)} teams; real lines for {len(kn)}; roster budgets for {len(rb)}")


if __name__ == "__main__":
    main()
