"""Play-by-play game engine.

Field position convention: `yl` is yards to the opponent's goal line
(100 = own goal line, 0 = touchdown). One `GameSim` simulates one game and
records every play plus team and player stats.
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path

from .ratings import TeamRatings, Matchup, build_matchup, LEAGUE_PLAYS_PER_GAME, LEAGUE_PASS_RATE, Player
from .boxscore import TeamStats, PlayerBook

QUARTER_SECONDS = 900
# Yardage bump for the home offense: ~5.0 points per game between equal teams (measured).
# Was 0.025 (~3.3 points) until 2026-10-05, when the 2026 Weeks 0-5 backtest found home teams
# underrated by ~1.8 points against the closing line. See backtest/REPORT_2026_wks0-5.md.
HOME_EDGE = 0.039
# Seconds of clock between snaps at league pace. Was 30 (tuned for ~69 plays/team) until 2026-10-07;
# 32 reproduces 2026's ~66 plays and ~27.3 s/play (backtest/players/REPORT_players_w5.md, follow-up 4-5).
BETWEEN_PLAYS_BASE = 32
# League-default QB scrambles (share of non-sack dropbacks) and gamma scale of the gain. Teams carry their
# own QB's values in TeamRatings.scramble_rate / scramble_scale (measured from play-by-play) since 2026-10-07.
SCRAMBLE_RATE = 0.12
SCRAMBLE_SCALE = 5.1   # max(-2, int(gamma(1.6, scale)) - 1) averages ~6.8 yds, the 2026 FBS passing-down QB run
# Raw-model corrections so league-average inputs reproduce league-average
# box-score output (goal-line truncation and clipping shave yards otherwise).
RUSH_CAL = 1.10
# 1.035 until 2026-10-07, then x1.07: completions ran 11.1 yds vs 11.8-12.0 real (2026 Wks 4-5)
COMP_YDS_CAL = 1.107
COMP_PCT_CAL = 1.01   # completion % ran ~1 point low in the same check
STICKS_RUN = 0.25   # extra conversion pull on 3rd/4th-and-short runs
STICKS_PASS = 0.30  # share of short completions on late downs that reach the sticks    # share of non-sack dropbacks that become QB scrambles
TWO_PT_BASE = 0.46
# Ordinary 4th-down decisions (Q1-Q3, Q2 before 2:00): real go/FG/punt mix by field zone and distance,
# CFBD 2024 + 2026 Wks 1-4 (backtest/players/fourth_down_table.py). Team aggressiveness shifts the go
# log-odds by AGGR_LOGIT per unit. Replaced a fixed distance-threshold rule on 2026-10-07: that rule kicked
# from long range on 4th-and-medium and punted near midfield where real teams go for it.
FOURTH_DOWN = json.loads((Path(__file__).resolve().parent / "data" / "fourth_down_table.json").read_text())
AGGR_LOGIT = 1.0
# FG make probability 1 / (1 + exp(FG_SLOPE * (dist - (FG_MID + fg_skill)))), fitted to 6,890 real FBS kicks
# (CFBD 2024 + 2025 + 2026 Wks 1-5, blocks count as misses): 93% from 20, 79% from 35, 53% from 50.
# Was 0.14 / 53 until 2026-10-07, which made 85% of kicks at the real distance mix vs 74.6% real.
FG_SLOPE, FG_MID = 0.082, 51.25
FG_MAX_EXTRA = 5  # a kick is "in range" up to 52 + fg_skill + this many yards; the table supplies the habits


# --------------------------------------------------------------------------
# situations (shared with the data layer that measures team play-calling)
# --------------------------------------------------------------------------

def situation_bucket(down: int, distance: int) -> str:
    if down == 1:
        return "1st"
    if down == 2:
        return "2nd_long" if distance >= 8 else "2nd_short" if distance <= 3 else "2nd_mid"
    return ("3rd_long" if distance >= 8 else "3rd_mid" if distance >= 5
            else "3rd_short" if distance >= 3 else "3rd_inches")


def is_neutral(quarter: int, clock: int, margin: int) -> bool:
    """Situations where play-calling reflects tendency, not game script."""
    return quarter <= 4 and abs(margin) <= 14 and not (quarter in (2, 4) and clock < 120)


def _logit(p: float) -> float:
    p = min(max(p, 1e-3), 1 - 1e-3)
    return math.log(p / (1 - p))


# --------------------------------------------------------------------------
# yardage samplers
# --------------------------------------------------------------------------

def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _clipped_mean(mu: float, sd: float, lo: int, hi: int) -> float:
    """Mean of round(N(mu, sd)) clipped to [lo, hi]."""
    total = 0.0
    for k in range(lo, hi + 1):
        a = -math.inf if k == lo else (k - 0.5 - mu) / sd
        b = math.inf if k == hi else (k + 0.5 - mu) / sd
        p = (1.0 if b == math.inf else _norm_cdf(b)) - (0.0 if a == -math.inf else _norm_cdf(a))
        total += k * p
    return total


@dataclass
class RushModel:
    """Mixture: stuffed run, ordinary gain, explosive run. Mid-mode mean is
    solved so the overall mean matches the matchup's yards per carry."""
    stuff: float
    explosive: float
    mid_mu: float
    STUFF_MEAN = -1.3
    EXPL_BASE = 12
    EXPL_TAIL = 11.0
    MID_SD = 2.7

    @classmethod
    def fit(cls, ypc: float, stuff: float, explosive: float) -> "RushModel":
        mid_share = 1 - stuff - explosive
        target = (ypc - stuff * cls.STUFF_MEAN - explosive * (cls.EXPL_BASE + cls.EXPL_TAIL)) / mid_share
        target = min(max(target, 1.2), 10.5)
        lo, hi = -5.0, 15.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if _clipped_mean(mid, cls.MID_SD, 1, 11) < target:
                lo = mid
            else:
                hi = mid
        return cls(stuff, explosive, (lo + hi) / 2)

    def sample(self, rng: random.Random) -> int:
        u = rng.random()
        if u < self.stuff:
            return -min(int(rng.expovariate(1 / 1.3)), 8)
        if u < self.stuff + self.explosive:
            return self.EXPL_BASE + int(rng.expovariate(1 / self.EXPL_TAIL))
        return int(min(max(round(rng.gauss(self.mid_mu, self.MID_SD)), 1), 11))


def sample_completion_yards(rng: random.Random, mean: float) -> int:
    shape = 1.35
    y = rng.gammavariate(shape, (mean + 1.5) / shape) - 1.5
    return max(-4, int(round(y)))


def _normalize(players: list[Player]) -> None:
    """Rescale player multipliers so the share-weighted mean is 1, keeping team rates intact."""
    tot = sum(p.share for p in players)
    if not tot:
        return
    for attr in ("ypc_mult", "catch_mult"):
        mean = sum(p.share * getattr(p, attr) for p in players) / tot
        for p in players:
            setattr(p, attr, getattr(p, attr) / mean)


# --------------------------------------------------------------------------
# game state
# --------------------------------------------------------------------------

@dataclass
class PlayRecord:
    quarter: int
    clock: int
    offense: str
    down: int
    distance: int
    yardline: str
    play_type: str
    description: str
    yards: int
    home_score: int
    away_score: int
    drive: int
    yards_to_goal: int = 0

    def clock_str(self) -> str:
        if self.quarter > 4:
            return "OT"
        return f"{self.clock // 60}:{self.clock % 60:02d}"


@dataclass
class Drive:
    num: int
    team: str
    quarter: int
    clock: int
    start_yl: int
    plays: int = 0
    yards: int = 0
    seconds: int = 0
    result: str = ""


@dataclass
class Side:
    ratings: TeamRatings
    is_home: bool
    score: int = 0
    timeouts: int = 3
    stats: TeamStats = field(default_factory=TeamStats)
    players: PlayerBook = field(default_factory=PlayerBook)


class GameSim:
    def __init__(self, home: TeamRatings, away: TeamRatings, seed: int | None = None,
                 neutral: bool = False, record: bool = True, rng: random.Random | None = None):
        # cfb_dynasty: `rng` lets parity tests pass shared_rng.SharedRng so Python and TypeScript draw identically.
        self.rng = rng if rng is not None else random.Random(seed)
        self.record = record
        self.home = Side(home, True)
        self.away = Side(away, False)
        edge = 0.0 if neutral else HOME_EDGE
        self.matchups = {
            id(self.home): build_matchup(home, away, edge),
            id(self.away): build_matchup(away, home, -edge),
        }
        for m in self.matchups.values():
            m.comp_pct = min(0.85, m.comp_pct * COMP_PCT_CAL)
        self.rush_models = {k: RushModel.fit(m.rush_ypc * RUSH_CAL, m.rush_stuff, m.rush_explosive)
                            for k, m in self.matchups.items()}
        for side in (self.home, self.away):
            _normalize(side.ratings.rushers)
            _normalize(side.ratings.receivers)
        self.plays: list[PlayRecord] = []
        self.drives: list[Drive] = []
        self.quarter = 1
        self.clock = QUARTER_SECONDS
        self.offense: Side = self.home
        self.down = 1
        self.distance = 10
        self.yl = 75
        self.drive: Drive | None = None
        self.game_over = False
        self.overtime = False
        self._pending_timeout = None
        self._rz_counted = False
        self._ot_round = 0
        self._ot_possession_over = False

    # ---- helpers ----------------------------------------------------------
    @property
    def defense(self) -> Side:
        return self.away if self.offense is self.home else self.home

    def other(self, side: Side) -> Side:
        return self.away if side is self.home else self.home

    @property
    def mu(self) -> Matchup:
        return self.matchups[id(self.offense)]

    def margin(self, side: Side | None = None) -> int:
        side = side or self.offense
        return side.score - self.other(side).score

    def half_seconds_left(self) -> int:
        if self.quarter in (1, 3):
            return self.clock + QUARTER_SECONDS
        return self.clock

    def game_seconds_left(self) -> int:
        if self.quarter > 4:
            return 0
        return self.clock + (4 - self.quarter) * QUARTER_SECONDS

    def spot_str(self, yl: int | None = None) -> str:
        yl = self.yl if yl is None else yl
        if yl == 50:
            return "50"
        if yl > 50:
            return f"{self.offense.ratings.abbr} {100 - yl}"
        return f"{self.defense.ratings.abbr} {yl}"

    def log(self, play_type: str, desc: str, yards: int = 0, down=None, dist=None, yl=None,
            quarter=None, clock=None, offense: Side | None = None) -> None:
        if self.drive and play_type not in ("KICKOFF", "PAT", "2PT", "TIMEOUT", "END"):
            self.drive.plays += 1
        if not self.record:
            return
        off = offense or self.offense
        self.plays.append(PlayRecord(
            quarter=self.quarter if quarter is None else quarter,
            clock=self.clock if clock is None else clock,
            offense=off.ratings.abbr,
            down=self.down if down is None else down,
            distance=self.distance if dist is None else dist,
            yardline=self.spot_str(yl) if off is self.offense else "",
            play_type=play_type, description=desc, yards=yards,
            home_score=self.home.score, away_score=self.away.score,
            drive=self.drive.num if self.drive else 0,
            yards_to_goal=self.yl if yl is None else yl,
        ))

    # ---- clock ------------------------------------------------------------
    def tempo_gap(self) -> int:
        """Seconds between snaps when the clock keeps running."""
        r = self.offense.ratings
        gap = BETWEEN_PLAYS_BASE * LEAGUE_PLAYS_PER_GAME / r.plays_per_game
        if self.hurry_up():
            return 12
        if self.milking():
            return 37
        return int(gap + self.rng.uniform(-4, 4))

    def hurry_up(self) -> bool:
        if self.overtime:
            return False
        if self.quarter == 2 and self.clock < 120:
            return True
        if self.quarter == 4 and self.margin() < 0 and (self.clock < 300 or self.margin() < -8 and self.clock < 600):
            return True
        return False

    def milking(self) -> bool:
        return (not self.overtime and self.quarter == 4 and self.margin() > 0 and self.clock < 480) or \
               (self.quarter == 3 and self.margin() > 17)

    def run_clock(self, play_secs: int, clock_stops: bool, inbounds_play: bool = True) -> None:
        """Advance the clock for one snap. clock_stops: incompletion, score, change
        of possession, out of bounds in a two-minute window, etc."""
        if self.overtime:
            return
        used = play_secs
        if not clock_stops:
            gap = self.tempo_gap()
            # Defense trailing late burns a timeout to stop the clock.
            dfn = self.defense
            if (self.quarter == 4 and self.clock - used < 210 and self.margin(dfn) < 0
                    and self.margin(dfn) >= -16 and dfn.timeouts > 0 and inbounds_play):
                dfn.timeouts -= 1
                gap = 0
                self._pending_timeout = dfn
            # Offense in a two-minute drill uses its own timeouts.
            elif self.hurry_up() and self.clock - used < 60 and self.offense.timeouts > 0 \
                    and (self.quarter == 2 or self.margin() < 0):
                self.offense.timeouts -= 1
                gap = 0
                self._pending_timeout = self.offense
            used += gap
        used = min(used, self.clock)
        self.clock -= used
        self.offense.stats.top_seconds += used
        if self.drive:
            self.drive.seconds += used

    # ---- possession changes ------------------------------------------------
    def new_drive(self, side: Side, yl: int) -> None:
        self.offense = side
        self.yl = yl
        self.down, self.distance = 1, min(10, yl)
        self.drive = Drive(len(self.drives) + 1, side.ratings.abbr, self.quarter, self.clock, yl)
        self.drives.append(self.drive)
        if yl <= 20:
            side.stats.red_zone_trips += 1
            self._rz_counted = True
        else:
            self._rz_counted = False

    def end_drive(self, result: str) -> None:
        if self.drive and not self.drive.result:
            self.drive.result = result
            self.drive.yards = self.drive.start_yl - self.yl

    def score(self, side: Side, pts: int) -> None:
        side.score += pts

    # ---- kicks ------------------------------------------------------------
    def kickoff(self, kicking: Side, from_yl_own: int = 35, onside: bool = False, free_kick: bool = False) -> None:
        recv = self.other(kicking)
        q, c = self.quarter, self.clock
        self.offense = kicking  # for logging perspective
        kr = kicking.ratings
        if onside:
            if self.rng.random() < 0.10:
                spot = 100 - (from_yl_own + 11)  # kicking team keeps it, yl from their view
                self.log("KICKOFF", f"{kr.abbr} onside kick recovered by {kr.abbr}!", quarter=q, clock=c,
                         down=0, dist=0)
                self.run_clock(4, True)
                self.new_drive(kicking, 100 - from_yl_own - 11)
                return
            self.log("KICKOFF", f"{kr.abbr} onside kick recovered by {recv.ratings.abbr}", quarter=q, clock=c,
                     down=0, dist=0)
            self.run_clock(4, True)
            self.new_drive(recv, 100 - (100 - from_yl_own - 11))  # recovered ~11 yds downfield
            return
        rr = recv.ratings
        if not free_kick and self.rng.random() < kr.kick_touchback:
            self.log("KICKOFF", f"{kr.abbr} kickoff, touchback.", down=0, dist=0, quarter=q, clock=c)
            self.new_drive(recv, 75)
            return
        land = 100 - from_yl_own - int(self.rng.gauss(62 if not free_kick else 45, 4))  # recv yards from own goal
        land = max(-5, land)
        if land <= 0 and self.rng.random() < 0.6:
            self.log("KICKOFF", f"{kr.abbr} kickoff into the end zone, touchback.", down=0, dist=0, quarter=q, clock=c)
            self.new_drive(recv, 75)
            return
        if land < 25 and self.rng.random() < 0.25:
            self.log("KICKOFF", f"{kr.abbr} kickoff, fair catch at the 25.", down=0, dist=0, quarter=q, clock=c)
            self.new_drive(recv, 75)
            return
        ret = max(0, int(self.rng.gauss(rr.kick_return_avg, 7)))
        if self.rng.random() < 0.06:
            ret += int(self.rng.expovariate(1 / 25))
        end = max(1, land) + ret  # yards from receiving team's own goal
        secs = 6
        if end >= 100:
            self.offense = recv
            self.run_clock(secs, True)
            self.score(recv, 6)
            recv.stats.return_tds += 1
            self.log("KICKOFF", f"{kr.abbr} kickoff, returned {ret} yards for a TOUCHDOWN by {rr.abbr}!",
                     down=0, dist=0, quarter=q, clock=c, offense=kicking)
            self.drive = None
            self.after_touchdown(recv)
            return
        recv.stats.kick_return_yards += ret
        self.log("KICKOFF", f"{kr.abbr} kickoff {65 if not free_kick else 45} yards, returned {ret} yards to the "
                 f"{rr.abbr} {end if end <= 50 else 100 - end}.", down=0, dist=0, quarter=q, clock=c, offense=kicking)
        self.offense = recv
        self.run_clock(secs, True)
        self.new_drive(recv, 100 - end)

    def punt(self) -> None:
        off, dfn = self.offense, self.defense
        r = off.ratings
        q, c, d, dist, yl0 = self.quarter, self.clock, self.down, self.distance, self.yl
        off.stats.punts += 1
        if self.rng.random() < 0.006:
            self.log("PUNT", f"{r.punter} punt BLOCKED, recovered by {dfn.ratings.abbr}.", 0)
            self.run_clock(5, True)
            self.end_drive("Blocked punt")
            self.new_drive(dfn, max(1, 100 - self.yl - 8))
            return
        gross = int(self.rng.gauss(r.punt_gross, 6.5))
        if self.yl < 55:  # short field: pooch toward the corner
            gross = min(gross, self.yl - 5 + int(self.rng.gauss(0, 4)))
        land = self.yl - gross  # yards from defense's goal (their view: land)
        if land <= 0:
            off.stats.punt_yards += self.yl - 20
            self.log("PUNT", f"{r.punter} punts {self.yl} yards into the end zone, touchback.", self.yl - 20)
            self.run_clock(6, True)
            self.end_drive("Punt")
            self.new_drive(dfn, 75)
            return
        off.stats.punt_yards += gross
        dr = dfn.ratings
        if self.rng.random() < 0.45 or land < 10:
            ret, txt = 0, "fair catch" if self.rng.random() < 0.6 else "downed"
        else:
            ret = int(self.rng.expovariate(1 / dr.punt_return_avg))
            txt = f"returned {ret} yards"
        new_from_goal = land + ret  # receiving team's distance from own goal
        if new_from_goal >= 100:
            self.log("PUNT", f"{r.punter} punts {gross} yards, returned for a TOUCHDOWN by {dr.abbr}!", gross)
            self.run_clock(8, True)
            self.end_drive("Punt return TD")
            dfn.stats.return_tds += 1
            self.score(dfn, 6)
            self.offense = dfn
            self.drive = None
            self.after_touchdown(dfn)
            return
        dfn.stats.punt_return_yards += ret
        self.log("PUNT", f"{r.punter} punts {gross} yards to the {self.spot_str(land)}, {txt}.", gross)
        self.run_clock(8, True)
        self.end_drive("Punt")
        self.new_drive(dfn, 100 - new_from_goal)

    def fg_make_prob(self, dist: int, side: Side) -> float:
        return 1 / (1 + math.exp(FG_SLOPE * (dist - (FG_MID + side.ratings.fg_skill))))

    def field_goal(self) -> None:
        off, dfn = self.offense, self.defense
        dist = self.yl + 17
        p = self.fg_make_prob(dist, off)
        if self.overtime:
            p = min(p, 0.97)
        off.stats.fga += 1
        off.players.kick(off.ratings.kicker, dist, False)
        if self.rng.random() < p:
            off.stats.fgm += 1
            off.players.kick(off.ratings.kicker, dist, True)
            self.score(off, 3)
            self.log("FG", f"{off.ratings.kicker} {dist}-yard field goal is GOOD.")
            self.run_clock(5, True)
            self.end_drive("Field goal")
            self.drive = None
            if not self.overtime:
                self.kickoff(off, onside=self.should_onside(off))
            return
        blocked = self.rng.random() < 0.06
        self.log("FG", f"{off.ratings.kicker} {dist}-yard field goal is {'BLOCKED' if blocked else 'NO GOOD'}.")
        self.run_clock(5, True)
        self.end_drive("Missed FG")
        if not self.overtime:
            self.new_drive(dfn, 100 - max(self.yl + 7, 20))

    # ---- scoring tries ------------------------------------------------------
    def two_point_prob(self) -> float:
        m = self.mu
        # Better offenses (vs this defense) convert more often.
        strength = (m.rush_ypc / 4.6 + m.comp_pct / 0.62) / 2
        return min(0.65, max(0.3, TWO_PT_BASE * strength))

    def go_for_two(self, side: Side) -> bool:
        if self.overtime:
            return self._ot_round >= 2
        m = self.margin(side)
        if self.quarter == 4 or (self.quarter == 3 and self.clock < 300):
            return m in (-10, -5, -2, 1, 5, -13, -16) or (m == -1 and self.clock < 60)
        return False

    def after_touchdown(self, side: Side) -> None:
        self.offense = side
        side.stats.tds += 1
        if self.overtime and self._ot_round >= 3:
            return  # TDs don't happen in 3OT+ (2-pt shootout); safety net
        if self.go_for_two(side):
            ok = self.rng.random() < self.two_point_prob()
            side.stats.two_pt_att += 1
            if ok:
                side.stats.two_pt_made += 1
                self.score(side, 2)
            self.log("2PT", f"{side.ratings.abbr} two-point conversion {'GOOD' if ok else 'FAILED'}.", down=0, dist=0)
        else:
            ok = self.rng.random() < 0.985
            side.stats.xpa += 1
            if ok:
                side.stats.xpm += 1
                self.score(side, 1)
            side.players.pat(side.ratings.kicker, ok)
            self.log("PAT", f"{side.ratings.kicker} extra point {'is GOOD' if ok else 'is NO GOOD'}.", down=0, dist=0)
        if not self.overtime and not self.game_over:
            self.kickoff(side, onside=self.should_onside(side))

    # ---- decisions -----------------------------------------------------------
    def should_onside(self, kicking: Side) -> bool:
        m = self.margin(kicking)
        return self.quarter == 4 and self.clock < 150 and -16 <= m < 0

    def fourth_down_call(self) -> str:
        """Return 'go', 'fg' or 'punt'."""
        yl, ytg = self.yl, self.distance
        r = self.offense.ratings
        aggr = r.aggressiveness
        m = self.margin()
        secs = self.game_seconds_left()
        fg_dist = yl + 17
        in_range = fg_dist <= 52 + r.fg_skill
        # end of half / game
        if self.quarter in (2, 4) and self.clock < 20:
            if in_range and (self.quarter == 2 or -3 <= m <= 0 or m > 0):
                return "fg"
            return "go" if self.quarter == 4 and m < 0 else ("fg" if in_range else "punt")
        if self.quarter == 4 and m < 0:
            if m >= -3 and in_range and secs < 240:
                return "fg"
            if secs < 300 or (m < -8 and secs < 600) or (m < -16 and secs < 900):
                return "go"
        if self.quarter == 4 and m > 0 and secs < 240:
            return "fg" if in_range else "punt"
        go, fg, punt = fourth_down_mix(yl, ytg)
        if fg_dist > 52 + r.fg_skill + FG_MAX_EXTRA:  # beyond this kicker's range: those kicks become punts
            punt, fg = punt + fg, 0.0
        if aggr:
            g = min(max(go, 1e-4), 1 - 1e-4)
            g2 = 1 / (1 + math.exp(-(math.log(g / (1 - g)) + AGGR_LOGIT * aggr)))
            rest = (1 - g2) / max(1e-9, fg + punt)
            go, fg, punt = g2, fg * rest, punt * rest
        u = self.rng.random()
        return "go" if u < go else "fg" if u < go + fg else "punt"

    def pass_prob(self) -> float:
        r = self.offense.ratings
        # With measured tendencies, the team's lean lives in per-situation offsets instead.
        p = LEAGUE_PASS_RATE if r.pass_tendency else r.pass_rate
        d, ytg, m = self.down, self.distance, self.margin()
        if d == 3:
            p = 0.86 if ytg >= 8 else 0.70 if ytg >= 5 else 0.52 if ytg >= 3 else 0.32
        elif d == 4:
            p = 0.75 if ytg >= 5 else 0.55 if ytg >= 3 else 0.3
        elif d == 2:
            p += 0.12 if ytg >= 8 else (-0.08 if ytg <= 3 else 0)
        elif d == 1 and ytg < 10:  # goal to go
            p -= 0.08
        if self.yl <= 3:
            p -= 0.15
        off = r.pass_tendency.get(situation_bucket(d, ytg)) if r.pass_tendency else None
        if off:
            p = min(0.97, max(0.03, p))
            p = 1 / (1 + math.exp(-(_logit(p) + off)))
        if self.hurry_up():
            p = max(p, 0.78)
        elif self.milking():
            p = min(p, 0.22)
        elif self.quarter >= 3 and m <= -14:
            p += 0.15
        elif self.quarter >= 3 and m >= 14:
            p -= 0.12
        return min(0.95, max(0.05, p))

    def should_kneel(self) -> bool:
        if self.overtime or self.margin() <= 0:
            return False
        if self.quarter == 2 and self.clock <= 40 and self.yl >= 60 and self.down < 4:
            return True
        if self.quarter != 4:
            return False
        downs_left = 4 - self.down  # kneels available before 4th down
        burn = downs_left * 42 - self.defense.timeouts * 40
        return self.clock <= burn

    # ---- the snap ---------------------------------------------------------------
    def scrimmage(self) -> None:
        off, dfn = self.offense, self.defense
        self._pending_timeout = None
        if not self.overtime and self.clock <= 8 and self.yl + 17 <= 55 + off.ratings.fg_skill and \
                (self.quarter == 2 or (self.quarter == 4 and -3 <= self.margin() <= 0)):
            self.field_goal()
            return
        if self.down == 4 and not self.overtime:
            call = self.fourth_down_call()
            if call == "punt":
                self.punt()
                return
            if call == "fg":
                self.field_goal()
                return
        if self.should_kneel():
            self.log("KNEEL", f"{off.ratings.qb} kneels.", -1)
            self.yl += 1
            off.stats.rush_att += 1
            off.stats.rush_yards -= 1
            off.stats.plays += 1
            self.run_clock(2, False)
            self.advance_down(-1)
            return

        # penalties replace the play (simplification)
        if self.rng.random() < (off.ratings.penalty_rate + dfn.ratings.penalty_rate):
            if self.handle_penalty():
                return

        down0, dist0, yl0 = self.down, self.distance, self.yl
        q0, c0 = self.quarter, self.clock
        off.stats.plays += 1
        is_pass = self.rng.random() < self.pass_prob()
        if is_pass:
            gained, stop, desc, turnover = self.pass_play()
        else:
            gained, stop, desc, turnover = self.run_play()
        self.post_play(gained, stop, desc, turnover, down0, dist0, yl0, q0, c0, "PASS" if is_pass else "RUN")

    def pick_player(self, players: list[Player], fallback: str) -> Player:
        if not players:
            return Player(fallback, "?", 1.0)
        tot = sum(p.share for p in players)
        u = self.rng.random() * tot
        for p in players:
            u -= p.share
            if u <= 0:
                return p
        return players[-1]

    def run_play(self):
        off = self.offense
        m = self.mu
        rusher = self.pick_player(off.ratings.rushers, "RB1")
        model = self.rush_models[id(off)]
        y = model.sample(self.rng)
        y = int(round(y * rusher.ypc_mult)) if y > 0 else y
        if self.down >= 3 and self.distance <= 2 and y < self.distance \
                and self.rng.random() < STICKS_RUN + m.third_down_bonus:
            y = self.distance  # short-yardage push
        y = min(y, self.yl)
        off.stats.rush_att += 1
        off.stats.rush_yards += y
        off.players.rush(rusher.name, y, y == self.yl)
        if y >= 12:
            off.stats.explosive += 1
        if self.rng.random() < m.fumble_lost_rate * 1.0 and y < self.yl:
            off.players.fumble(rusher.name)
            return y, True, f"{rusher.name} rush for {y} yard{'s' if abs(y) != 1 else ''}, FUMBLES, recovered by {self.defense.ratings.abbr}", "fumble"
        oob = self.rng.random() < (0.12 if self.hurry_up() else 0.06)
        two_min = self.quarter in (2, 4) and self.clock < 120
        desc = f"{rusher.name} rush {'for no gain' if y == 0 else f'for {y} yard' + ('s' if abs(y) != 1 else '')}"
        if oob:
            desc += ", out of bounds"
        return y, oob and two_min, desc, None

    def pass_play(self):
        off, dfn = self.offense, self.defense
        m = self.mu
        qb = off.ratings.qb
        if self.rng.random() < m.sack_rate:
            y = -max(1, int(self.rng.gauss(7, 3)))
            off.stats.sacks_taken += 1
            off.stats.sack_yards += -y
            dfn.stats.sacks += 1
            off.players.sacked(qb)
            if self.rng.random() < 0.05 and self.yl - y < 100:
                off.players.fumble(qb)
                return y, True, f"{qb} sacked for {-y} yards, FUMBLES, recovered by {dfn.ratings.abbr}", "fumble"
            return y, False, f"{qb} sacked for a loss of {-y} yards", None
        if self.rng.random() < (off.ratings.scramble_rate or SCRAMBLE_RATE):
            y = min(self.yl, max(-2, int(self.rng.gammavariate(1.6, off.ratings.scramble_scale or SCRAMBLE_SCALE)) - 1))
            off.stats.rush_att += 1
            off.stats.rush_yards += y
            off.players.rush(qb, y, y == self.yl)
            if y >= 12:
                off.stats.explosive += 1
            return y, False, f"{qb} scrambles for {y} yards", None
        tgt = self.pick_player(off.ratings.receivers, "WR1")
        off.stats.pass_att += 1
        if self.rng.random() < m.int_rate:
            off.stats.ints_thrown += 1
            off.players.pass_(qb, False, 0, False, True)
            off.players.target(tgt.name)
            air = max(1, int(self.rng.gauss(14, 7)))
            return min(air, self.yl - 1), True, f"{qb} pass intended for {tgt.name} INTERCEPTED by {dfn.ratings.abbr}", "int"
        comp_p = min(0.92, m.comp_pct * tgt.catch_mult + (m.third_down_bonus if self.down == 3 else 0))
        if self.distance >= 15:
            comp_p += 0.04  # defenses concede underneath
        if self.rng.random() >= comp_p:
            off.players.pass_(qb, False, 0, False, False)
            off.players.target(tgt.name)
            return 0, True, f"{qb} pass incomplete intended for {tgt.name}", None
        y = sample_completion_yards(self.rng, m.yds_per_comp * tgt.ypc_mult * COMP_YDS_CAL)
        if self.down >= 3 and y < self.distance and self.rng.random() < STICKS_PASS + m.third_down_bonus:
            y = self.distance + int(self.rng.expovariate(1 / 3))  # routes run past the sticks
        y = min(y, self.yl)
        td = y == self.yl
        off.stats.completions += 1
        off.stats.pass_yards += y
        if y >= 20:
            off.stats.explosive += 1
        off.players.pass_(qb, True, y, td, False)
        off.players.catch(tgt.name, y, td)
        if not td and self.rng.random() < m.fumble_lost_rate * 0.8:
            off.players.fumble(tgt.name)
            return y, True, f"{qb} pass complete to {tgt.name} for {y} yards, FUMBLES, recovered by {dfn.ratings.abbr}", "fumble"
        oob = self.rng.random() < (0.35 if self.hurry_up() else 0.15)
        two_min = self.quarter in (2, 4) and self.clock < 120
        desc = f"{qb} pass complete to {tgt.name} for {y} yard{'s' if abs(y) != 1 else ''}"
        if oob:
            desc += ", out of bounds"
        return y, oob and two_min, desc, None

    def post_play(self, gained, clock_stop, desc, turnover, down0, dist0, yl0, q0, c0, ptype):
        off, dfn = self.offense, self.defense
        new_yl = self.yl - gained
        success = gained >= (0.5 * dist0 if down0 == 1 else 0.7 * dist0 if down0 == 2 else dist0)
        off.stats.success += int(success and not turnover)
        if down0 == 3:
            off.stats.third_att += 1
        if down0 == 4:
            off.stats.fourth_att += 1
        if not self._rz_counted and new_yl <= 20 and not turnover:
            off.stats.red_zone_trips += 1
            self._rz_counted = True

        if turnover:
            off.stats.turnovers += 1
            dfn.stats.takeaways += 1
            self.yl = new_yl
            # return
            ret = int(self.rng.expovariate(1 / (12 if turnover == "int" else 4)))
            if self.rng.random() < (0.04 if turnover == "int" else 0.02):
                ret = 100
            spot_for_def = (100 - self.yl) - ret  # yards for defense to go after return
            self.log(ptype, desc + (f", returned {min(ret, 100 - self.yl)} yards" if ret else ""),
                     gained, down0, dist0, yl0, q0, c0)
            self.run_clock(7, True)
            self.end_drive("Interception" if turnover == "int" else "Fumble")
            if spot_for_def <= 0:
                self.offense = dfn
                self.drive = None
                dfn.stats.def_tds += 1
                self.score(dfn, 6)
                self.log(ptype, f"{dfn.ratings.abbr} defensive TOUCHDOWN!", 0, 0, 0, 0)
                self.after_touchdown(dfn)
                return
            self.new_drive(dfn, min(spot_for_def, 99))
            if self.overtime:
                self._ot_possession_over = True
            return

        if new_yl <= 0:  # touchdown
            self.yl = 0
            self.score(off, 6)
            self.log(ptype, desc + ", TOUCHDOWN.", gained, down0, dist0, yl0, q0, c0)
            if down0 == 3:
                off.stats.third_conv += 1
            if down0 == 4:
                off.stats.fourth_conv += 1
            off.stats.first_downs += 1
            if self._rz_counted:
                off.stats.red_zone_tds += 1
            self.run_clock(6, True)
            self.end_drive("Touchdown")
            self.drive = None
            self.after_touchdown(off)
            if self.overtime:
                self._ot_possession_over = True
            return

        if new_yl >= 100:  # safety
            self.yl = 100
            self.log(ptype, desc + f", tackled in the end zone. SAFETY.", gained, down0, dist0, yl0, q0, c0)
            self.score(dfn, 2)
            self.run_clock(6, True)
            self.end_drive("Safety")
            self.drive = None
            if not self.overtime:
                self.kickoff(off, from_yl_own=20, free_kick=True)
            return

        self.yl = new_yl
        first = gained >= dist0
        fd_txt = ""
        if first:
            off.stats.first_downs += 1
            fd_txt = ", 1ST DOWN"
            if down0 == 3:
                off.stats.third_conv += 1
            if down0 == 4:
                off.stats.fourth_conv += 1
        elif down0 == 4:
            fd_txt = ", turnover on downs"
        self.log(ptype, desc + fd_txt + ".", gained, down0, dist0, yl0, q0, c0)
        two_min_first = first and self.quarter in (2, 4) and self.clock < 120
        self.run_clock(6, clock_stop or two_min_first or (down0 == 4 and not first))
        if self._pending_timeout is not None:
            t = self._pending_timeout
            self.log("TIMEOUT", f"Timeout {t.ratings.abbr} ({t.timeouts} left).", 0, down=0, dist=0)
        self.advance_down(gained)

    def advance_down(self, gained: int) -> None:
        if gained >= self.distance:
            self.down = 1
            self.distance = min(10, self.yl)
            return
        self.distance -= gained
        self.down += 1
        if self.down > 4:
            self.end_drive("Downs")
            self.new_drive(self.defense, 100 - self.yl)
            if self.overtime:
                self._ot_possession_over = True

    def handle_penalty(self) -> bool:
        """Simulate a penalty in place of the play. Returns True if handled."""
        off, dfn = self.offense, self.defense
        rng = self.rng
        p_off = off.ratings.penalty_rate / (off.ratings.penalty_rate + dfn.ratings.penalty_rate)
        if rng.random() < p_off:
            u = rng.random()
            yards, name = (5, "False start") if u < 0.45 else (10, "Holding") if u < 0.85 else (15, "Personal foul")
            if self.yl + yards >= 100:
                yards = (100 - self.yl) // 2
            off.stats.penalties += 1
            off.stats.penalty_yards += yards
            self.log("PENALTY", f"PENALTY {off.ratings.abbr} {name}, {yards} yards.", -yards)
            self.yl += yards
            self.distance += yards
            self.run_clock(0 if name == "False start" else 5, True)
            return True
        u = rng.random()
        if u < 0.40:
            yards, name, auto = 5, "Offside", False
        elif u < 0.65:
            yards, name, auto = 10, "Holding", True
        elif u < 0.88:
            yards, name, auto = 15, "Pass interference", True
        else:
            yards, name, auto = 15, "Personal foul", True
        if yards >= self.yl:
            yards = self.yl // 2
        dfn.stats.penalties += 1
        dfn.stats.penalty_yards += yards
        d0, dist0, yl0 = self.down, self.distance, self.yl
        self.yl -= yards
        if auto or yards >= self.distance:
            off.stats.first_downs += 1
            off.stats.penalty_first_downs += 1
            self.log("PENALTY", f"PENALTY {dfn.ratings.abbr} {name}, {yards} yards, 1ST DOWN.", yards, d0, dist0, yl0)
            self.down, self.distance = 1, min(10, self.yl)
        else:
            self.log("PENALTY", f"PENALTY {dfn.ratings.abbr} {name}, {yards} yards.", yards, d0, dist0, yl0)
            self.distance -= yards
        if not self._rz_counted and self.yl <= 20:
            off.stats.red_zone_trips += 1
            self._rz_counted = True
        self.run_clock(5, True)
        return True

    # ---- flow ---------------------------------------------------------------
    def end_quarter(self) -> None:
        if self.quarter == 2:
            self.end_drive("End of half")
            self.home.timeouts = self.away.timeouts = 3
            self.quarter = 3
            self.clock = QUARTER_SECONDS
            self.log("END", "End of 1st half.", down=0, dist=0)
            self.kickoff(self.second_half_kicker)
            return
        if self.quarter == 4:
            self.end_drive("End of game")
            return
        self.quarter += 1
        self.clock = QUARTER_SECONDS

    def play(self) -> "GameSim":
        rng = self.rng
        toss_winner = self.home if rng.random() < 0.5 else self.away
        receiving = self.other(toss_winner)  # winner defers
        self.second_half_kicker = receiving
        self.kickoff(toss_winner)
        guard = 0
        while self.quarter <= 4:
            guard += 1
            if guard > 1000:
                raise RuntimeError("runaway game loop")
            if self.clock <= 0:
                q = self.quarter
                self.end_quarter()
                if q == 4:
                    break
                continue
            # last-second kicks
            self.scrimmage()
            # onside kick logic is folded into kickoffs after scores
        if self.home.score == self.away.score:
            self.play_overtime()
        self.game_over = True
        self.log("END", f"Final: {self.away.ratings.abbr} {self.away.score}, {self.home.ratings.abbr} {self.home.score}",
                 down=0, dist=0)
        return self

    def play_overtime(self) -> None:
        self.overtime = True
        self._ot_round = 0
        first = self.away if self.rng.random() < 0.5 else self.home
        while self.home.score == self.away.score:
            self._ot_round += 1
            self.quarter = 4 + self._ot_round
            if self._ot_round >= 3:
                for side in (first, self.other(first)):
                    self.offense = side
                    ok = self.rng.random() < self.two_point_prob()
                    side.stats.two_pt_att += 1
                    if ok:
                        side.stats.two_pt_made += 1
                        self.score(side, 2)
                    self.log("2PT", f"OT{self._ot_round}: {side.ratings.abbr} two-point play {'GOOD' if ok else 'FAILED'}.",
                             down=0, dist=0)
            else:
                for side in (first, self.other(first)):
                    self.ot_possession(side)
            if self._ot_round > 12:
                break

    def ot_possession(self, side: Side) -> None:
        self.new_drive(side, 25)
        self._ot_possession_over = False
        start_scores = (self.home.score, self.away.score)
        guard = 0
        while not self._ot_possession_over and guard < 60:
            guard += 1
            if self.down == 4:
                call = self.ot_fourth_down()
                if call == "fg":
                    self.field_goal()
                    return
            self.scrimmage()
            if (self.home.score, self.away.score) != start_scores:
                return
            if self.offense is not side:
                return

    def ot_fourth_down(self) -> str:
        m = self.margin()
        in_range = self.yl + 17 <= 55
        if m < -3 or (m < 0 and not in_range):
            return "go"
        if self.distance <= 1 and self.yl <= 5:
            return "go"
        return "fg" if in_range else "go"


def fourth_down_mix(yl: int, ytg: int) -> tuple[float, float, float]:
    """(go, fg, punt) probabilities for an ordinary 4th down from the measured table."""
    def find(labels, x):
        for lab in labels:
            lo, hi = map(int, lab.split("-"))
            if lo <= x <= hi:
                return lab
        return labels[-1]
    z = find(FOURTH_DOWN["zones"], max(1, yl))
    d = find(FOURTH_DOWN["dists"], max(1, ytg))
    go, fg, punt = FOURTH_DOWN["table"][f"{z}|{d}"]
    return go, fg, punt


def simulate(home: TeamRatings, away: TeamRatings, seed: int | None = None, record: bool = True) -> GameSim:
    return GameSim(home, away, seed=seed, record=record).play()
