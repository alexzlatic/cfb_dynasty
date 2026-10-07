"""Team ratings: the per-play rates the engine samples from.

A TeamRatings holds an offensive profile (what the team does with the ball)
and a defensive profile (what it allows). Rates are expressed per play type
so the matchup layer can blend offense vs. defense against a league baseline.

College stat convention: sacks count as rushes in box scores. Everything in
here is *sack-adjusted*: rushing excludes sacks, and the sack rate is per
dropback (pass attempts + sacks).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class UnitRates:
    """Rates for one side of the ball (offense produced or defense allowed)."""
    rush_ypc: float = 4.8          # yards per rush incl. scrambles, sacks excluded
    rush_explosive: float = 0.105  # share of rushes gaining 12+
    rush_stuff: float = 0.17       # share of rushes for <= 0 yards
    comp_pct: float = 0.62         # completions / attempts
    yds_per_comp: float = 11.8     # yards per completion
    sack_rate: float = 0.065       # sacks / dropbacks
    int_rate: float = 0.023        # INTs / attempts
    fumble_lost_rate: float = 0.007  # lost fumbles / (rushes + receptions)
    third_down_bonus: float = 0.0  # small situational tweak, + is better for the offense

    @property
    def ypa(self) -> float:
        return self.comp_pct * self.yds_per_comp


# FBS-wide baseline (roughly 2023-2025 averages, sack-adjusted).
LEAGUE = UnitRates()
LEAGUE_PLAYS_PER_GAME = 69.0
LEAGUE_PASS_RATE = 0.42  # early-down neutral pass rate; situational logic raises the overall share
LEAGUE_PENALTY_RATE = 0.042  # accepted penalties per scrimmage play, per team


@dataclass
class Player:
    name: str
    pos: str
    share: float  # carry share (RB/QB runs) or target share (WR/TE/RB)
    catch_mult: float = 1.0  # receiver completion multiplier vs team rate
    ypc_mult: float = 1.0    # yards per carry/catch multiplier vs team rate


@dataclass
class TeamRatings:
    name: str
    abbr: str
    offense: UnitRates = field(default_factory=UnitRates)
    defense: UnitRates = field(default_factory=UnitRates)
    plays_per_game: float = LEAGUE_PLAYS_PER_GAME
    pass_rate: float = LEAGUE_PASS_RATE
    penalty_rate: float = LEAGUE_PENALTY_RATE
    fg_skill: float = 0.0       # shifts the FG make curve, in yards (+ = longer range)
    punt_gross: float = 43.0
    kick_touchback: float = 0.55
    kick_return_avg: float = 21.0
    punt_return_avg: float = 8.0
    aggressiveness: float = 0.0  # 4th-down tendency shift, -1 conservative .. +1 aggressive
    # Starting QB's scrambles: share of non-sack dropbacks and gamma scale of the gain (0 = engine default).
    # Measured from play-by-play by data/qb_scramble.py since 2026-10-07.
    scramble_rate: float = 0.0
    scramble_scale: float = 0.0
    # Per-situation pass-call offsets (log-odds vs the engine's FBS-average caller), keyed by
    # engine.situation_bucket. Empty = use pass_rate with FBS-typical situational logic.
    pass_tendency: dict = field(default_factory=dict)
    qb: str = "QB1"
    kicker: str = "K"
    punter: str = "P"
    rushers: list[Player] = field(default_factory=list)
    receivers: list[Player] = field(default_factory=list)
    notes: str = ""

    # ---- persistence -------------------------------------------------
    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json())

    @classmethod
    def from_dict(cls, d: dict) -> "TeamRatings":
        d = dict(d)
        d["offense"] = UnitRates(**d.get("offense", {}))
        d["defense"] = UnitRates(**d.get("defense", {}))
        d["rushers"] = [Player(**p) for p in d.get("rushers", [])]
        d["receivers"] = [Player(**p) for p in d.get("receivers", [])]
        known = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in known})

    @classmethod
    def load(cls, path: str | Path) -> "TeamRatings":
        return cls.from_dict(json.loads(Path(path).read_text()))


# ---- matchup blending ---------------------------------------------------

def _logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def _inv_logit(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def blend_rate(off: float, dfn: float, lg: float) -> float:
    """log5 / odds-ratio blend: offense rate adjusted by how far the defense is from league."""
    return _inv_logit(_logit(off) + _logit(dfn) - _logit(lg))


def blend_yards(off: float, dfn: float, lg: float) -> float:
    """Multiplicative blend for yardage averages."""
    return off * dfn / lg


@dataclass
class Matchup:
    """Effective per-play rates for one offense against one defense."""
    rush_ypc: float
    rush_explosive: float
    rush_stuff: float
    comp_pct: float
    yds_per_comp: float
    sack_rate: float
    int_rate: float
    fumble_lost_rate: float
    third_down_bonus: float


def build_matchup(offense: TeamRatings, defense: TeamRatings, home_edge: float = 0.0) -> Matchup:
    """home_edge is a multiplicative yardage bump (e.g. +0.025 for the home offense)."""
    o, d, lg = offense.offense, defense.defense, LEAGUE
    m = 1.0 + home_edge
    return Matchup(
        rush_ypc=blend_yards(o.rush_ypc, d.rush_ypc, lg.rush_ypc) * m,
        rush_explosive=blend_rate(o.rush_explosive, d.rush_explosive, lg.rush_explosive),
        rush_stuff=blend_rate(o.rush_stuff, d.rush_stuff, lg.rush_stuff),
        comp_pct=min(0.85, blend_rate(o.comp_pct, d.comp_pct, lg.comp_pct) * (1 + home_edge / 2)),
        yds_per_comp=blend_yards(o.yds_per_comp, d.yds_per_comp, lg.yds_per_comp) * m,
        sack_rate=blend_rate(o.sack_rate, d.sack_rate, lg.sack_rate) * (1 - home_edge),
        int_rate=blend_rate(o.int_rate, d.int_rate, lg.int_rate) * (1 - home_edge),
        fumble_lost_rate=blend_rate(o.fumble_lost_rate, d.fumble_lost_rate, lg.fumble_lost_rate),
        third_down_bonus=o.third_down_bonus - d.third_down_bonus,
    )
