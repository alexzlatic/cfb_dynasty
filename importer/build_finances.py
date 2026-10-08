"""Money inputs for a seed bundle (M2): each school's home crowds from the season before, and its
football finances.

    python3 importer/build_finances.py [--season 2026]

Writes data/seed/<season>wk1/finances.json:

    {"season": 2026, "source": {...}, "teams": {"<team id>": {"attendance": 101_000, "home_games": 7,
      "lines": {...} | null}}}

Attendance is the average home crowd (not neutral sites) in the previous season's CFBD games. `lines`
are the school's real football revenue and expenses from the Knight-Newhouse College Athletics Database
when a CSV export is in importer/.cache/knight_newhouse.csv (public schools only); otherwise null, and
the game estimates them from conference and prestige (packages/core/src/finance.ts).
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
    out = {}
    for t in teams:
        c = crowds.get(t["id"], [])
        out[str(t["id"])] = {"attendance": round(statistics.mean(c)) if c else None, "home_games": len(c), "lines": kn.get(t["id"])}
    doc = {"season": args.season, "source": {"attendance": f"CFBD games {args.season - 1}", "lines": kn_src or "estimated in the game"}, "teams": out}
    (out_dir / "finances.json").write_text(json.dumps(doc, separators=(",", ":")))
    have = sum(1 for v in out.values() if v["attendance"])
    print(f"finances.json: attendance for {have} of {len(out)} teams; real lines for {len(kn)}")


if __name__ == "__main__":
    main()
