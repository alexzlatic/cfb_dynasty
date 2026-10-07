"""Generate engine parity fixtures: the Python reference engine plays games with SharedRng and the
TypeScript port must reproduce every play. Run from the repo root:

    python3 reference/make_fixtures.py            # writes fixtures/engine/parity.json
"""
from __future__ import annotations

import json
import random
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "reference"))

from cfb_sim.engine import GameSim  # noqa: E402
from cfb_sim.ratings import TeamRatings  # noqa: E402
from cfb_sim.shared_rng import SharedRng  # noqa: E402

PLAY_FIELDS = ["quarter", "clock", "offense", "down", "distance", "yardline", "play_type", "description",
               "yards", "home_score", "away_score", "drive", "yards_to_goal"]


def main(n_games: int = 60) -> None:
    teams = json.loads((ROOT / "data/seed/2026wk1/team_ratings.json").read_text())["teams"]
    names = sorted(teams)
    pick = random.Random(2026)
    games = []
    for i in range(n_games):
        h, a = pick.sample(names, 2)
        neutral = i % 10 == 9
        seed = 1000 + i
        home, away = TeamRatings.from_dict(teams[h]), TeamRatings.from_dict(teams[a])
        sim = GameSim(home, away, neutral=neutral, rng=SharedRng(seed)).play()
        games.append({
            "seed": seed, "home": h, "away": a, "neutral": neutral,
            "final": [sim.home.score, sim.away.score], "overtime": sim.overtime,
            "home_box": sim.home.stats.as_dict(), "away_box": sim.away.stats.as_dict(),
            "plays": [[getattr(p, f) for f in PLAY_FIELDS] for p in sim.plays],
        })
    out = ROOT / "fixtures/engine/parity.json"
    out.write_text(json.dumps({"play_fields": PLAY_FIELDS, "games": games}, separators=(",", ":")))
    print(f"wrote {out} ({n_games} games, {sum(len(g['plays']) for g in games)} plays)")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 60)
