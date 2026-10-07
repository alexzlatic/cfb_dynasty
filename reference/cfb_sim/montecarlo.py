"""Run many games and summarize the distribution of outcomes and stats."""
from __future__ import annotations

import statistics as st
from collections import defaultdict
from dataclasses import dataclass, field

from .engine import GameSim
from .ratings import TeamRatings

TEAM_KEYS = ["total_yards", "rush_yards", "rush_att", "pass_yards", "pass_att", "completions", "sacks_taken",
             "turnovers", "first_downs", "scrimmage_plays", "ypp", "success_rate", "explosive", "third_conv",
             "third_att", "red_zone_trips", "red_zone_tds", "fgm", "fga", "punts", "penalties", "top_seconds"]
PLAYER_KEYS = ["cmp", "att", "pass_yds", "pass_td", "int", "car", "rush_yds", "rush_td", "rec", "tgt",
               "rec_yds", "rec_td", "fgm"]


def pct(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, max(0, int(q * len(xs))))]


@dataclass
class MCResult:
    home: str
    away: str
    n: int
    home_pts: list[int] = field(default_factory=list)
    away_pts: list[int] = field(default_factory=list)
    ot_games: int = 0
    team: dict = field(default_factory=lambda: {"home": defaultdict(list), "away": defaultdict(list)})
    players: dict = field(default_factory=lambda: {"home": defaultdict(lambda: defaultdict(list)),
                                                   "away": defaultdict(lambda: defaultdict(list))})

    @property
    def margins(self) -> list[int]:  # home minus away
        return [h - a for h, a in zip(self.home_pts, self.away_pts)]

    @property
    def totals(self) -> list[int]:
        return [h + a for h, a in zip(self.home_pts, self.away_pts)]

    def home_win_prob(self) -> float:
        return sum(m > 0 for m in self.margins) / self.n

    def cover_prob(self, home_spread: float) -> float:
        """P(home covers) for a home line like +2.5 (home getting points)."""
        res = [m + home_spread for m in self.margins]
        decided = [r for r in res if r != 0]
        return sum(r > 0 for r in decided) / max(1, len(decided))

    def over_prob(self, total: float) -> float:
        decided = [t for t in self.totals if t != total]
        return sum(t > total for t in decided) / max(1, len(decided))

    def summary(self) -> dict:
        m, t = self.margins, self.totals
        out = {
            "games": self.n,
            "home": self.home, "away": self.away,
            "home_win_prob": round(self.home_win_prob(), 4),
            "away_win_prob": round(1 - self.home_win_prob(), 4),
            "overtime_rate": round(self.ot_games / self.n, 4),
            "home_points": {"mean": round(st.mean(self.home_pts), 1), "median": st.median(self.home_pts)},
            "away_points": {"mean": round(st.mean(self.away_pts), 1), "median": st.median(self.away_pts)},
            "margin_home": {"mean": round(st.mean(m), 2), "median": st.median(m), "sd": round(st.pstdev(m), 1),
                            "p10": pct(m, .1), "p90": pct(m, .9)},
            "total": {"mean": round(st.mean(t), 1), "median": st.median(t), "sd": round(st.pstdev(t), 1),
                      "p10": pct(t, .1), "p90": pct(t, .9)},
            "teams": {}, "players": {},
        }
        for side, name in (("home", self.home), ("away", self.away)):
            out["teams"][name] = {k: round(st.mean(v), 2) for k, v in self.team[side].items()}
            pl = {}
            for pname, stats in self.players[side].items():
                row = {}
                for k, v in stats.items():
                    vals = v + [0] * (self.n - len(v))
                    if sum(vals) == 0:
                        continue
                    row[k] = {"mean": round(st.mean(vals), 1), "p10": pct(vals, .1), "p90": pct(vals, .9)}
                if row:
                    pl[pname] = row
            out["players"][name] = pl
        return out


def run(home: TeamRatings, away: TeamRatings, n: int = 10000, seed: int = 0) -> MCResult:
    res = MCResult(home.name, away.name, n)
    for i in range(n):
        g = GameSim(home, away, seed=seed + i, record=False).play()
        res.home_pts.append(g.home.score)
        res.away_pts.append(g.away.score)
        res.ot_games += g.quarter > 4
        for key, side in (("home", g.home), ("away", g.away)):
            d = side.stats.as_dict()
            for k in TEAM_KEYS:
                res.team[key][k].append(d[k])
            for pname, row in side.players.as_dict().items():
                for k in PLAYER_KEYS:
                    if k in row:
                        res.players[key][pname][k].append(row[k])
    return res
