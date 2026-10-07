"""Team and player stat accumulators plus box-score formatting."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, fields


@dataclass
class TeamStats:
    plays: int = 0
    first_downs: int = 0
    penalty_first_downs: int = 0
    rush_att: int = 0
    rush_yards: int = 0
    pass_att: int = 0
    completions: int = 0
    pass_yards: int = 0
    sacks_taken: int = 0
    sack_yards: int = 0
    sacks: int = 0
    ints_thrown: int = 0
    turnovers: int = 0
    takeaways: int = 0
    third_att: int = 0
    third_conv: int = 0
    fourth_att: int = 0
    fourth_conv: int = 0
    red_zone_trips: int = 0
    red_zone_tds: int = 0
    penalties: int = 0
    penalty_yards: int = 0
    punts: int = 0
    punt_yards: int = 0
    fga: int = 0
    fgm: int = 0
    xpa: int = 0
    xpm: int = 0
    two_pt_att: int = 0
    two_pt_made: int = 0
    tds: int = 0
    return_tds: int = 0
    def_tds: int = 0
    kick_return_yards: int = 0
    punt_return_yards: int = 0
    explosive: int = 0
    success: int = 0
    top_seconds: int = 0

    @property
    def net_pass_yards(self) -> int:
        return self.pass_yards - self.sack_yards

    @property
    def total_yards(self) -> int:
        return self.rush_yards + self.net_pass_yards

    @property
    def scrimmage_plays(self) -> int:
        return self.rush_att + self.pass_att + self.sacks_taken

    @property
    def ypp(self) -> float:
        return self.total_yards / max(1, self.scrimmage_plays)

    @property
    def success_rate(self) -> float:
        return self.success / max(1, self.scrimmage_plays)

    def as_dict(self) -> dict:
        d = {f.name: getattr(self, f.name) for f in fields(self)}
        d.update(net_pass_yards=self.net_pass_yards, total_yards=self.total_yards,
                 scrimmage_plays=self.scrimmage_plays, ypp=round(self.ypp, 2),
                 success_rate=round(self.success_rate, 3))
        return d


def _player_row() -> dict:
    return defaultdict(int)


class PlayerBook:
    """Per-player counting stats keyed by name."""

    def __init__(self) -> None:
        self.p: dict[str, dict] = defaultdict(_player_row)

    def rush(self, name, yds, td):
        r = self.p[name]
        r["car"] += 1
        r["rush_yds"] += yds
        r["rush_td"] += int(td)
        r["rush_long"] = max(r["rush_long"], yds)

    def pass_(self, name, comp, yds, td, intc):
        r = self.p[name]
        r["att"] += 1
        r["cmp"] += int(comp)
        r["pass_yds"] += yds
        r["pass_td"] += int(td)
        r["int"] += int(intc)

    def sacked(self, name):
        self.p[name]["sacked"] += 1

    def target(self, name):
        self.p[name]["tgt"] += 1

    def catch(self, name, yds, td):
        r = self.p[name]
        r["tgt"] += 1
        r["rec"] += 1
        r["rec_yds"] += yds
        r["rec_td"] += int(td)
        r["rec_long"] = max(r["rec_long"], yds)

    def fumble(self, name):
        self.p[name]["fum_lost"] += 1

    def kick(self, name, dist, made):
        r = self.p[name]
        if made:
            r["fgm"] += 1
            r["fg_long"] = max(r["fg_long"], dist)
        else:
            r["fga"] += 1

    def pat(self, name, made):
        r = self.p[name]
        r["xpa"] += 1
        r["xpm"] += int(made)

    def as_dict(self) -> dict:
        return {k: dict(v) for k, v in self.p.items()}


def fmt_clock(secs: int) -> str:
    return f"{secs // 60}:{secs % 60:02d}"


def team_box(abbr_a: str, a: TeamStats, abbr_b: str, b: TeamStats) -> str:
    rows = [
        ("First downs", a.first_downs, b.first_downs),
        ("Total plays", a.scrimmage_plays, b.scrimmage_plays),
        ("Total yards", a.total_yards, b.total_yards),
        ("Yards per play", f"{a.ypp:.1f}", f"{b.ypp:.1f}"),
        ("Rushing (att-yds)", f"{a.rush_att}-{a.rush_yards}", f"{b.rush_att}-{b.rush_yards}"),
        ("Passing (cmp-att-yds)", f"{a.completions}-{a.pass_att}-{a.pass_yards}",
         f"{b.completions}-{b.pass_att}-{b.pass_yards}"),
        ("Sacks taken (yds)", f"{a.sacks_taken} ({a.sack_yards})", f"{b.sacks_taken} ({b.sack_yards})"),
        ("Turnovers", a.turnovers, b.turnovers),
        ("3rd down", f"{a.third_conv}/{a.third_att}", f"{b.third_conv}/{b.third_att}"),
        ("4th down", f"{a.fourth_conv}/{a.fourth_att}", f"{b.fourth_conv}/{b.fourth_att}"),
        ("Red zone (TD/trips)", f"{a.red_zone_tds}/{a.red_zone_trips}", f"{b.red_zone_tds}/{b.red_zone_trips}"),
        ("Success rate", f"{a.success_rate:.0%}", f"{b.success_rate:.0%}"),
        ("Explosive plays", a.explosive, b.explosive),
        ("Penalties (yds)", f"{a.penalties} ({a.penalty_yards})", f"{b.penalties} ({b.penalty_yards})"),
        ("Field goals", f"{a.fgm}/{a.fga}", f"{b.fgm}/{b.fga}"),
        ("Punts (avg)", f"{a.punts} ({a.punt_yards / max(1, a.punts):.1f})",
         f"{b.punts} ({b.punt_yards / max(1, b.punts):.1f})"),
        ("Time of possession", fmt_clock(a.top_seconds), fmt_clock(b.top_seconds)),
    ]
    w = max(len(r[0]) for r in rows) + 2
    out = [f"{'':<{w}}{abbr_a:>14}{abbr_b:>14}"]
    out += [f"{r[0]:<{w}}{str(r[1]):>14}{str(r[2]):>14}" for r in rows]
    return "\n".join(out)


def player_box(abbr: str, book: PlayerBook) -> str:
    p = book.as_dict()
    out = [f"{abbr} passing:   CMP/ATT  YDS  TD INT SCK"]
    for n, r in sorted(p.items(), key=lambda kv: -kv[1].get("att", 0)):
        if r.get("att"):
            out.append(f"  {n:<22}{r.get('cmp',0):>3}/{r['att']:<3}{r.get('pass_yds',0):>5}{r.get('pass_td',0):>4}"
                       f"{r.get('int',0):>4}{r.get('sacked',0):>4}")
    out.append(f"{abbr} rushing:   CAR  YDS  AVG  TD LONG")
    for n, r in sorted(p.items(), key=lambda kv: -kv[1].get("rush_yds", 0)):
        if r.get("car"):
            out.append(f"  {n:<22}{r['car']:>3}{r['rush_yds']:>5}{r['rush_yds']/r['car']:>5.1f}"
                       f"{r.get('rush_td',0):>4}{r.get('rush_long',0):>5}")
    out.append(f"{abbr} receiving: REC TGT  YDS  TD LONG")
    for n, r in sorted(p.items(), key=lambda kv: -kv[1].get("rec_yds", 0)):
        if r.get("tgt"):
            out.append(f"  {n:<22}{r.get('rec',0):>3}{r['tgt']:>4}{r.get('rec_yds',0):>5}"
                       f"{r.get('rec_td',0):>4}{r.get('rec_long',0):>5}")
    for n, r in p.items():
        if r.get("fga") or r.get("fgm") or r.get("xpa"):
            fga = r.get("fga", 0)
            out.append(f"{abbr} kicking:   {n}  FG {r.get('fgm',0)}/{fga} (long {r.get('fg_long',0)}), "
                       f"XP {r.get('xpm',0)}/{r.get('xpa',0)}")
    return "\n".join(out)
