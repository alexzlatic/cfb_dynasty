"""Leak-free team-level engine ratings for every FBS team as of the 2026 preseason (before Week 1).

Runs the backtest's own pipeline from the CFB Sim project: prep_cutoff (preseason mode, prior v2)
writes a pre-Week-1 copy of the CFBD inputs, then cfb_sim.data.cfbd.build() builds each team's
TeamRatings from it. This is the same path the 1,505-game backtest used (tag *_v3), extended to all
138 FBS teams instead of only the teams playing in Week 1.

Usage: python3 importer/build_team_ratings.py --cfb-sim /mnt/project-files/cfb-sim --out data/seed/2026wk1/team_ratings.json
"""
import argparse
import json
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

YEAR = 2026


def build_one(job):
    cfb_sim, data_dir, team = job
    sys.path.insert(0, cfb_sim)
    from cfb_sim.data import cfbd
    cfbd.DATA = Path(data_dir)
    try:
        r, _ = cfbd.build(team, team[:4].upper(), YEAR, "sp")
        return team, json.loads(r.to_json()), None
    except Exception as e:  # noqa: BLE001
        return team, None, f"{type(e).__name__}: {e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cfb-sim", required=True, help="path to the CFB Sim project (engine + backtest)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--work", help="scratch dir for the cutoff data (default: a temp dir)")
    args = ap.parse_args()
    cfb_sim = str(Path(args.cfb_sim).resolve())
    sys.path.insert(0, str(Path(cfb_sim) / "backtest"))
    import prep_cutoff
    work = Path(args.work or tempfile.mkdtemp(prefix="cutoff_w1_"))
    prep_cutoff.main(week=1, out=str(work), year=YEAR, tag="dynasty_w1")
    teams = sorted(t["school"] for t in json.loads((Path(cfb_sim) / "app/pull/teams_fbs_2026.json").read_text()))
    out, failed = {}, {}
    with Pool() as pool:
        for team, r, err in pool.imap_unordered(build_one, [(cfb_sim, str(work), t) for t in teams]):
            if r:
                out[team] = r
            else:
                failed[team] = err
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps({"season": YEAR, "as_of": "2026-08-24", "source": "cfb-sim backtest prep_cutoff week 1 (prior v2) + cfbd.build level sp",
                                          "teams": dict(sorted(out.items())), "failed": failed}, indent=1))
    print(f"built {len(out)} teams, failed {len(failed)}: {failed}")


if __name__ == "__main__":
    main()
