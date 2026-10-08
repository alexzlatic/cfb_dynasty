"""Each school's roster-building style (M3), from where its real newcomers came from.

    python3 importer/build_styles.py [--season 2026]

Writes data/seed/<season>wk1/styles.json: {"<team id>": {"portal_share": 0.36, "style": "win_now", "newcomers": 122}}.
portal_share is transfers as a share of FBS newcomers (high school signees plus incoming transfers) over the
three seasons through the seed season (CFBD portal data starts in 2024, so the 2025 seed uses 2024 and 2025).
Styles: build and develop under 33%, portal heavy over 55%, balanced between; a balanced or develop school
with a $40M+ roster budget (finances.json) that still takes a third or more from the portal is win now.
Schools with fewer than 20 newcomers in the window get their conference's median.
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "importer/.cache"


def style(share: float, budget: float | None) -> str:
    if share > 0.55:
        return "portal"
    if budget and budget >= 40_000_000 and share >= 0.33:
        return "win_now"
    return "develop" if share < 0.33 else "balanced"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    args = ap.parse_args()
    out_dir = ROOT / f"data/seed/{args.season}wk1"
    teams = json.loads((out_dir / "teams.json").read_text())
    fin = json.loads((out_dir / "finances.json").read_text())["teams"]
    fbs = {t["school"]: t for t in teams if t["level"] == "fbs"}
    years = [y for y in range(args.season - 2, args.season + 1) if (CACHE / f"player_portal__year-{y}.json").exists()]
    inc, hs = Counter(), Counter()
    for y in years:
        for m in json.loads((CACHE / f"player_portal__year-{y}.json").read_text()):
            if m.get("destination") in fbs:
                inc[m["destination"]] += 1
        for r in json.loads((CACHE / f"recruiting_players__year-{y}_classification-HighSchool.json").read_text()):
            if r.get("committedTo") in fbs:
                hs[r["committedTo"]] += 1
    share = {s: inc[s] / (inc[s] + hs[s]) for s in fbs if inc[s] + hs[s] >= 20}
    conf_med = {}
    for t in fbs.values():
        xs = [share[s] for s, u in fbs.items() if u["conference"] == t["conference"] and s in share]
        conf_med[t["conference"]] = statistics.median(xs) if xs else 0.45
    out = {}
    for s, t in fbs.items():
        sh = share.get(s, conf_med[t["conference"]])
        budget = (fin.get(str(t["id"])) or {}).get("roster_budget")
        out[str(t["id"])] = {"portal_share": round(sh, 3), "style": style(sh, budget), "newcomers": inc[s] + hs[s]}
    doc = {"season": args.season, "source": f"CFBD portal and recruiting {years[0]}-{years[-1]}", "teams": out}
    (out_dir / "styles.json").write_text(json.dumps(doc, separators=(",", ":")))
    c = Counter(v["style"] for v in out.values())
    print(f"styles.json ({years[0]}-{years[-1]}): {dict(c)}")
    for s in ("Miami", "Iowa", "Ohio State", "Georgia", "Colorado", "Texas", "Texas A&M", "Oregon", "LSU"):
        if s in fbs:
            print(f"  {s}: {out[str(fbs[s]['id'])]}")


if __name__ == "__main__":
    main()
