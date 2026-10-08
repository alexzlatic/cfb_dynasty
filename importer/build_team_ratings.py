"""Leak-free team-level engine ratings for every FBS team as of a season's preseason (before Week 1).

Runs the backtest's own pipeline from the CFB Sim project: prep_cutoff (preseason mode, prior v2)
writes a pre-Week-1 copy of the CFBD inputs, then cfb_sim.data.cfbd.build() builds each team's
TeamRatings from it. This is the same path the 1,505-game backtest used (tag *_v3), extended to all
FBS teams instead of only the teams playing in Week 1.

Usage:
  python3 importer/build_team_ratings.py --cfb-sim /mnt/project-files/cfb-sim --out data/seed/2026wk1/team_ratings.json
  python3 importer/build_team_ratings.py --cfb-sim /mnt/project-files/cfb-sim --year 2025 --out data/seed/2025wk1/team_ratings.json

Seasons before 2026 first assemble the per-team CFBD inputs from the backtest's bulk pulls with
backtest/tools/make_src.py, as the backtest does. Every file this writes (cutoff data, per-team inputs,
the strength diagnostics prep_cutoff saves) goes to a scratch dir, never into the CFB Sim project.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

AS_OF = {2026: "2026-08-24", 2025: "2025-08-18"}


def build_one(job):
    cfb_sim, data_dir, team, year = job
    sys.path.insert(0, cfb_sim)
    from cfb_sim.data import cfbd
    cfbd.DATA = Path(data_dir)
    try:
        r, _ = cfbd.build(team, team[:4].upper(), year, "sp")
        return team, json.loads(r.to_json()), None
    except Exception as e:  # noqa: BLE001
        return team, None, f"{type(e).__name__}: {Path(e.filename).name if getattr(e, 'filename', None) else e}"


def fbs_teams(cfb_sim: Path, year: int) -> list[str]:
    listed = cfb_sim / f"app/pull/teams_fbs_{year}.json"
    if listed.exists():
        return sorted(t["school"] for t in json.loads(listed.read_text()))
    games = json.loads((cfb_sim / f"backtest/data_raw/games_{year}_all.json").read_text())
    return sorted({g["homeTeam"] for g in games if g["homeClassification"] == "fbs"} |
                  {g["awayTeam"] for g in games if g["awayClassification"] == "fbs"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cfb-sim", required=True, help="path to the CFB Sim project (engine + backtest)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--work", help="scratch dir for the cutoff data (default: a temp dir)")
    args = ap.parse_args()
    year = args.year
    cfb_sim = Path(args.cfb_sim).resolve()
    work = Path(args.work or tempfile.mkdtemp(prefix=f"cutoff_{year}_w1_"))
    work.mkdir(parents=True, exist_ok=True)
    src = None
    if year != 2026:  # 2026 inputs live in the project's data/cfbd; earlier seasons are assembled like the backtest does
        src = work / "src"
        subprocess.run([sys.executable, str(cfb_sim / "backtest/tools/make_src.py"), str(src), str(year)], check=True)
    sys.path[:0] = [str(cfb_sim / "backtest"), str(cfb_sim / "tools"), str(cfb_sim)]
    import prep_cutoff
    prep_cutoff.HERE = work  # its strength diagnostics file goes to the scratch dir (RAW and SRC are bound at import)
    cut = work / "cut"
    prep_cutoff.main(week=1, out=str(cut), year=year, tag="dynasty_w1" if year == 2026 else f"dynasty_{year}_w1",
                     src=str(src) if src else None)
    teams = fbs_teams(cfb_sim, year)
    out, failed = {}, {}
    with Pool() as pool:
        for team, r, err in pool.imap_unordered(build_one, [(str(cfb_sim), str(cut), t, year) for t in teams]):
            if r:
                out[team] = r
            else:
                failed[team] = err
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps({"season": year, "as_of": AS_OF.get(year, f"{year}-08-24"),
                                          "source": "cfb-sim backtest prep_cutoff week 1 (prior v2) + cfbd.build level sp",
                                          "teams": dict(sorted(out.items())), "failed": failed}, indent=1))
    print(f"built {len(out)} teams, failed {len(failed)}: {failed}")


if __name__ == "__main__":
    main()
