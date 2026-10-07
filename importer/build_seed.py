"""Build the 2026 Week 1 seed bundle (data/seed/2026wk1/) from CollegeFootballData.

The bundle is what a new league is created from: teams, venues, conferences, rosters, coaches,
the 2026 schedule, team-level engine ratings as of Aug 24, 2026, the 2027 recruiting class and
history pulls for later milestones. Nothing from a 2026 game result feeds the sim; the real
results are stored separately for the "what really happened" screen.

Run from the repo root (CFBD auth is injected by the network proxy, or set CFBD_API_KEY):

    python3 importer/build_seed.py                 # uses importer/.cache for raw pulls
    python3 importer/build_seed.py --refresh       # re-pull everything

team_ratings.json (FBS engine ratings) is built first by importer/build_team_ratings.py.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "importer/.cache"
OUT = ROOT / "data/seed/2026wk1"
API = "https://api.collegefootballdata.com"
SEASON = 2026
EASTERN = ZoneInfo("America/New_York")

sys.path.insert(0, str(ROOT / "reference"))


# ---- CFBD pulls -------------------------------------------------------------------------------
def pull(path: str, refresh: bool = False):
    """GET an endpoint, cached under importer/.cache (never committed)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    fn = CACHE / (path.strip("/").replace("/", "_").replace("?", "__").replace("&", "_").replace("=", "-") + ".json")
    if fn.exists() and not refresh:
        return json.loads(fn.read_text())
    req = urllib.request.Request(API + path, headers={"Accept": "application/json"})
    key = os.environ.get("CFBD_API_KEY")
    if key:
        req.add_header("Authorization", f"Bearer {key}")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            break
        except Exception:  # noqa: BLE001 - retry transient network errors
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    fn.write_text(json.dumps(data))
    return data


def write(name: str, obj) -> None:
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    print(f"  {name}: {p.stat().st_size / 1e6:.2f} MB")


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ---- teams, venues, conferences ----------------------------------------------------------------
def build_teams(refresh: bool):
    raw = [t for t in pull(f"/teams?year={SEASON}", refresh) if t["classification"] in ("fbs", "fcs")]
    teams = []
    for t in raw:
        loc = t.get("location") or {}
        logos = t.get("logos") or []
        pick = lambda size, dark: next((u for u in logos if f"/{size}/" in u and ("logos-dark" in u) == dark), None)  # noqa: E731
        teams.append({
            "id": t["id"], "school": t["school"], "mascot": t.get("mascot"), "abbr": t.get("abbreviation") or t["school"][:4].upper(),
            "conference": t.get("conference"), "division": t.get("division"), "level": t["classification"],
            "color": t.get("color") or "#444444", "alt_color": t.get("alternateColor") or "#ffffff",
            "logo": pick(128, False), "logo_dark": pick(128, True),
            "venue": {
                "id": loc.get("id"), "name": loc.get("name"), "city": loc.get("city"), "state": loc.get("state"),
                "timezone": loc.get("timezone"), "lat": num(loc.get("latitude")), "lon": num(loc.get("longitude")),
                "elevation_m": num(loc.get("elevation")), "capacity": loc.get("capacity"),
                "grass": loc.get("grass"), "dome": loc.get("dome"), "built": loc.get("constructionYear"),
            },
        })
    teams.sort(key=lambda t: (t["level"], t["school"]))
    confs = pull("/conferences", refresh)
    used = {t["conference"] for t in teams}
    levels = {(t["conference"], t["level"]) for t in teams}  # CFBD repeats a name per division level
    conferences = [{"id": c["id"], "name": c["name"], "short": c.get("shortName") or c["name"], "abbr": c.get("abbreviation"),
                    "level": c.get("classification")} for c in confs if (c["name"], c.get("classification")) in levels]
    for name in sorted(used - {c["name"] for c in conferences}):
        lvl = next(t["level"] for t in teams if t["conference"] == name)
        conferences.append({"id": None, "name": name, "short": name, "abbr": name, "level": lvl})
    return teams, conferences


# ---- rosters --------------------------------------------------------------------------------
POS_MAP = {"OT": "OL", "G": "OL", "C": "OL", "DE": "EDGE", "NT": "DL", "DT": "DL", "FB": "RB", "PK": "K"}
CLASS = {1: "FR", 2: "SO", 3: "JR", 4: "SR"}


def build_rosters(teams, refresh: bool):
    raw = pull(f"/roster?year={SEASON}", refresh)
    by_school = {t["school"]: t for t in teams}
    rosters: dict[int, list] = defaultdict(list)
    seen = set()
    for p in raw:
        t = by_school.get(p.get("team"))
        if not t or p["id"] in seen:
            continue
        seen.add(p["id"])
        pos = POS_MAP.get(p.get("position"), p.get("position")) or "ATH"
        yr = p.get("year")
        rosters[t["id"]].append({
            "id": int(p["id"]) if str(p["id"]).isdigit() else p["id"],
            "first": p.get("firstName") or "", "last": p.get("lastName") or "", "pos": pos,
            "class": CLASS.get(yr, "FR"), "jersey": p.get("jersey"), "height": p.get("height"), "weight": p.get("weight"),
            "home": {"city": p.get("homeCity"), "state": p.get("homeState"), "lat": p.get("homeLatitude"), "lon": p.get("homeLongitude")},
            "recruit_ids": p.get("recruitIds") or [],
        })
    return rosters


# ---- coaches --------------------------------------------------------------------------------
def build_coaches(teams, rosters, refresh: bool, coord_csv: Path | None):
    raw = pull(f"/coaches?year={SEASON}", refresh)
    by_id = {t["id"]: t for t in teams}
    history = {(c["firstName"], c["lastName"]): c for c in pull("/coaches?minYear=2000&maxYear=2026", refresh)}
    coaches = []
    have = set()
    for c in raw:
        s26 = next((s for s in c["seasons"] if s["year"] == SEASON), None)
        if not s26 or s26.get("teamId") not in by_id:
            continue
        full = history.get((c["firstName"], c["lastName"]), c)
        career = [{"year": s["year"], "team_id": s.get("teamId"), "school": s["school"], "wins": s["wins"], "losses": s["losses"],
                   "ties": s.get("ties", 0)} for s in full["seasons"] if s["year"] < SEASON]
        coaches.append({"team_id": s26["teamId"], "role": "HC", "first": c["firstName"], "last": c["lastName"],
                        "hire_date": (c.get("hireDate") or "")[:10] or None, "career": career, "source": "cfbd"})
        have.add(s26["teamId"])
    # Coordinators: researched list when present, otherwise generated in M1.
    if coord_csv and coord_csv.exists():
        import csv
        names = {t["school"].lower(): t["id"] for t in teams}
        for row in csv.DictReader(coord_csv.open()):
            tid = names.get((row.get("school") or "").strip().lower())
            if not tid:
                continue
            for role, col in (("OC", "offensive_coordinator"), ("DC", "defensive_coordinator"), ("STC", "special_teams_coordinator")):
                for full in (row.get(col) or "").split(";"):
                    full = full.strip()
                    if not full or full.upper() in ("TBD", "UNKNOWN", "VACANT"):
                        continue
                    first, _, last = full.partition(" ")
                    coaches.append({"team_id": tid, "role": role, "first": first, "last": last, "hire_date": None, "career": [],
                                    "source": "researched", "source_url": (row.get("source_url") or "").split(" | ")[0] or None,
                                    "note": row.get("notes") or None})
    # FCS head coaches are not in CFBD: generated names from the national name pool.
    firsts = Counter(p["first"] for r in rosters.values() for p in r if p["first"])
    lasts = Counter(p["last"] for r in rosters.values() for p in r if p["last"])
    fpool, lpool = [n for n, k in firsts.items() if k >= 8], [n for n, k in lasts.items() if k >= 4]
    rng = random.Random(20260824)
    for t in teams:
        if t["id"] not in have:
            coaches.append({"team_id": t["id"], "role": "HC", "first": rng.choice(fpool), "last": rng.choice(lpool),
                            "hire_date": None, "career": [], "source": "generated"})
    return coaches


# ---- schedule and real results ----------------------------------------------------------------
def build_schedule(teams, refresh: bool):
    ids = {t["id"]: t for t in teams}
    games = pull(f"/games?year={SEASON}&seasonType=regular", refresh)
    sched, real = [], []
    for g in games:
        h, a = ids.get(g["homeId"]), ids.get(g["awayId"])
        if not h or not a or "fbs" not in (h["level"], a["level"]):
            continue
        utc = datetime.fromisoformat(g["startDate"].replace("Z", "+00:00"))
        local = utc.astimezone(EASTERN)
        sched.append({
            "id": g["id"], "week": g["week"], "date": local.date().isoformat(),
            "kickoff_et": None if g.get("startTimeTBD") else local.strftime("%H:%M"),
            "home_id": h["id"], "away_id": a["id"], "neutral": bool(g.get("neutralSite")),
            "conference_game": bool(g.get("conferenceGame")), "venue_id": g.get("venueId"), "venue": g.get("venue"),
            "notes": g.get("notes"),
        })
        if g.get("completed"):
            real.append({"id": g["id"], "home_points": g.get("homePoints"), "away_points": g.get("awayPoints")})
    sched.sort(key=lambda x: (x["date"], x["kickoff_et"] or "99", x["id"]))
    return sched, real


# ---- FCS and missing-FBS team strength ---------------------------------------------------------
def team_strength_points(teams, refresh: bool):
    """Points vs an average FBS team on a neutral field for teams that were FCS in 2025.

    A ridge-regressed rating over every 2025 game between FBS and FCS teams: FBS opponents are fixed at
    their 2025 SP+ rating, FCS teams are linked through their games with each other, margins are capped
    at 35 and every team is shrunk toward the FCS mean with 3 games of prior weight (M0 spec: tuned in
    M1 so FCS upsets happen at real rates)."""
    sp = {r["team"]: r["rating"] for r in pull("/ratings/sp?year=2025", refresh) if r.get("rating") is not None}
    games = pull("/games?year=2025", refresh)
    fcs = set()
    edges = []
    for g in games:
        if g.get("homePoints") is None:
            continue
        cls = {g["homeTeam"]: g.get("homeClassification"), g["awayTeam"]: g.get("awayClassification")}
        for t, c in cls.items():
            if c == "fcs":
                fcs.add(t)
        if not all(c in ("fbs", "fcs") for c in cls.values()):
            continue
        hfa = 0 if g.get("neutralSite") else 2.5
        margin = max(-35, min(35, g["homePoints"] - g["awayPoints"])) - hfa
        edges.append((g["homeTeam"], g["awayTeam"], margin))
    vs_fbs = [m + sp[a] if h in fcs else -m + sp[h] for h, a, m in edges
              if (h in fcs) != (a in fcs) and (a in sp if h in fcs else h in sp)]
    mean = statistics.mean(vs_fbs) if vs_fbs else -25.0
    r = {t: mean for t in fcs}
    val = lambda t: r[t] if t in fcs else sp.get(t)  # noqa: E731
    k = 3.0
    for _ in range(300):
        acc = defaultdict(lambda: [k * mean, k])
        for h, a, m in edges:
            if h in fcs and val(a) is not None:
                acc[h][0] += m + val(a); acc[h][1] += 1
            if a in fcs and val(h) is not None:
                acc[a][0] += val(h) - m; acc[a][1] += 1
        r = {t: acc[t][0] / acc[t][1] if t in acc else mean for t in fcs}
    out = {t["school"]: r.get(t["school"], mean) for t in teams}
    return out, mean, len(vs_fbs)


def scaled_team(points: float, school: str, abbr: str, roster: list):
    """An engine TeamRatings dict worth roughly `points` vs an average FBS team (neutral field).
    About 0.8 points of margin per 1% of yardage and 0.04 logit on rates (fit in calibrate_scale)."""
    from cfb_sim.ratings import LEAGUE
    import math
    s = points / 2.0  # split evenly between offense and defense
    yd = 1 + s * SCALE_YD
    lg = lambda p, k: 1 / (1 + math.exp(-(math.log(p / (1 - p)) + k)))  # noqa: E731
    k = s * SCALE_LOGIT
    off = {"rush_ypc": LEAGUE.rush_ypc * yd, "rush_explosive": lg(LEAGUE.rush_explosive, k), "rush_stuff": lg(LEAGUE.rush_stuff, -k),
           "comp_pct": lg(LEAGUE.comp_pct, k), "yds_per_comp": LEAGUE.yds_per_comp * yd, "sack_rate": lg(LEAGUE.sack_rate, -k),
           "int_rate": lg(LEAGUE.int_rate, -k), "fumble_lost_rate": LEAGUE.fumble_lost_rate, "third_down_bonus": 0.0}
    dfn = {"rush_ypc": LEAGUE.rush_ypc / yd, "rush_explosive": lg(LEAGUE.rush_explosive, -k), "rush_stuff": lg(LEAGUE.rush_stuff, k),
           "comp_pct": lg(LEAGUE.comp_pct, -k), "yds_per_comp": LEAGUE.yds_per_comp / yd, "sack_rate": lg(LEAGUE.sack_rate, k),
           "int_rate": lg(LEAGUE.int_rate, k), "fumble_lost_rate": LEAGUE.fumble_lost_rate, "third_down_bonus": 0.0}
    pick = lambda pos, n: [p for p in roster if p["pos"] == pos][:n]  # noqa: E731
    nm = lambda p: f"{p['first']} {p['last']}".strip()  # noqa: E731
    qbs, rbs, wrs, tes = pick("QB", 1), pick("RB", 2), pick("WR", 3), pick("TE", 1)
    ks, ps = pick("K", 1), pick("P", 1)
    rushers = [{"name": nm(p), "pos": "RB", "share": sh, "catch_mult": 1.0, "ypc_mult": 1.0} for p, sh in zip(rbs, (0.55, 0.3))]
    if qbs:
        rushers.append({"name": nm(qbs[0]), "pos": "QB", "share": 0.15, "catch_mult": 1.0, "ypc_mult": 1.0})
    receivers = [{"name": nm(p), "pos": "WR", "share": sh, "catch_mult": 1.0, "ypc_mult": 1.0} for p, sh in zip(wrs, (0.25, 0.2, 0.15))]
    receivers += [{"name": nm(p), "pos": "TE", "share": 0.12, "catch_mult": 1.0, "ypc_mult": 1.0} for p in tes]
    receivers += [{"name": nm(p), "pos": "RB", "share": 0.08, "catch_mult": 1.0, "ypc_mult": 1.0} for p in rbs[:1]]
    return {
        "name": school, "abbr": abbr, "offense": off, "defense": dfn, "plays_per_game": 69.0, "pass_rate": 0.42,
        "penalty_rate": 0.045, "fg_skill": -1.0 if points < -10 else 0.0, "punt_gross": 41.0, "kick_touchback": 0.45,
        "kick_return_avg": 21.0, "punt_return_avg": 8.0, "aggressiveness": 0.0, "scramble_rate": 0.0, "scramble_scale": 0.0,
        "pass_tendency": {}, "qb": nm(qbs[0]) if qbs else "QB1", "kicker": nm(ks[0]) if ks else "K",
        "punter": nm(ps[0]) if ps else "P", "rushers": rushers, "receivers": receivers,
        "notes": f"scaled league-average team, {points:+.1f} pts vs average FBS (2025 games vs FBS, shrunk)",
    }


SCALE_YD = 0.0125
SCALE_LOGIT = 0.05


def calibrate_scale(games: int = 3000) -> float:
    """Measured points of margin per point of `scaled_team` input against an average team."""
    from cfb_sim.engine import GameSim
    from cfb_sim.ratings import TeamRatings
    from cfb_sim.shared_rng import SharedRng
    avg = TeamRatings(name="Avg", abbr="AVG")
    out = {}
    for pts in (-20.0, 20.0):
        t = TeamRatings.from_dict(scaled_team(pts, "X", "X", []))
        m = 0
        for i in range(games):
            g = GameSim(t, avg, neutral=True, record=False, rng=SharedRng(i)).play()
            m += g.home.score - g.away.score
        out[pts] = m / games
    return (out[20.0] - out[-20.0]) / 40.0


# ---- brand prestige -------------------------------------------------------------------------
def add_prestige(teams, refresh: bool) -> None:
    """0-100 brand score that poll voters lean on: 2021-25 win % and 2022-26 recruiting class points,
    each as a percentile among FBS teams, weighted 45/55. FCS programs sit at 5-25 by win %."""
    wins, recs = defaultdict(lambda: [0, 0]), defaultdict(list)
    for y in range(2021, 2026):
        for r in pull(f"/records?year={y}", refresh):
            wins[r.get("teamId")][0] += r["total"]["wins"]
            wins[r.get("teamId")][1] += r["total"]["games"]
    for y in range(2022, 2027):
        for r in pull(f"/recruiting/teams?year={y}", refresh):
            recs[r["team"]].append(r["points"])
    wp = {t["id"]: wins[t["id"]][0] / max(1, wins[t["id"]][1]) for t in teams}
    rp = {t["id"]: statistics.mean(recs[t["school"]]) if recs[t["school"]] else 0.0 for t in teams}
    fbs = [t for t in teams if t["level"] == "fbs"]
    pct = lambda vals, v: sum(1 for x in vals if x < v) / max(1, len(vals) - 1)  # noqa: E731
    wv, rv = [wp[t["id"]] for t in fbs], [rp[t["id"]] for t in fbs]
    for t in teams:
        if t["level"] == "fbs":
            t["prestige"] = round(100 * (0.45 * pct(wv, wp[t["id"]]) + 0.55 * pct(rv, rp[t["id"]])), 1)
        else:
            t["prestige"] = round(5 + 20 * wp[t["id"]], 1)


# ---- main -------------------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--coordinators", type=Path, default=ROOT / "importer/coordinators_2026.csv")
    ap.add_argument("--skip-history", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    print("teams, conferences, venues")
    teams, conferences = build_teams(args.refresh)
    print(Counter(t["level"] for t in teams))
    print("rosters")
    rosters = build_rosters(teams, args.refresh)
    print("coaches")
    coaches = build_coaches(teams, rosters, args.refresh, args.coordinators)
    print(Counter((c["role"], c["source"]) for c in coaches))
    print("schedule")
    sched, real = build_schedule(teams, args.refresh)
    print(f"  {len(sched)} games, {sum(1 for g in sched if g['home_id'] in {t['id'] for t in teams if t['level']=='fcs'} or g['away_id'] in {t['id'] for t in teams if t['level']=='fcs'})} vs FCS")

    print("team ratings")
    tr_path = OUT / "team_ratings.json"
    tr = json.loads(tr_path.read_text())
    fbs_built = tr["teams"]
    by_school = {t["school"]: t for t in teams}
    for name, r in list(fbs_built.items()):
        if name in by_school:
            r["abbr"] = by_school[name]["abbr"]
    slope = calibrate_scale()
    print(f"  scale: {slope:.3f} pts margin per input point")
    strength, fcs_mean, n_obs = team_strength_points(teams, args.refresh)
    print(f"  FCS mean {fcs_mean:.1f} pts vs average FBS from {n_obs} games")
    ratings = {}
    for t in teams:
        if t["level"] == "fbs" and t["school"] in fbs_built:
            ratings[t["id"]] = {"source": "preseason_prior_v2", **{"ratings": fbs_built[t["school"]]}}
        else:  # FCS teams, and 2026 FBS newcomers rated from their 2025 FCS season
            pts = strength[t["school"]] / slope
            ratings[t["id"]] = {"source": "fcs_2025_vs_fbs_shrunk", "points": round(strength[t["school"]], 1),
                                "ratings": scaled_team(pts, t["school"], t["abbr"], rosters.get(t["id"], []))}
    write("team_ratings_all.json", {"season": SEASON, "as_of": "2026-08-24", "teams": ratings})

    add_prestige(teams, args.refresh)
    write("teams.json", teams)
    write("conferences.json", conferences)
    write("rosters.json", {str(k): v for k, v in rosters.items()})
    write("coaches.json", coaches)
    write("schedule.json", sched)
    write("real_results_2026.json", {"note": "Real 2026 scores. Comparison screen only; never fed to the sim.", "games": real})

    print("recruits and history")
    rec = pull("/recruiting/players?year=2027&classification=HighSchool", args.refresh)
    write("recruits_2027.json", [{
        "id": r["id"], "name": r["name"], "pos": r.get("position"), "stars": r.get("stars"), "rating": r.get("rating"),
        "rank": r.get("ranking"), "height": r.get("height"), "weight": r.get("weight"), "school": r.get("school"),
        "city": r.get("city"), "state": r.get("stateProvince"), "lat": (r.get("hometownInfo") or {}).get("latitude"),
        "lon": (r.get("hometownInfo") or {}).get("longitude"), "committed_to": r.get("committedTo"),
    } for r in rec])
    if not args.skip_history:
        hist_rec, hist_team = [], []
        for y in range(2019, 2027):
            for r in pull(f"/recruiting/players?year={y}&classification=HighSchool", args.refresh):
                hist_rec.append([y, r.get("athleteId"), r["name"], r.get("position"), r.get("stars"), r.get("rating"), r.get("committedTo")])
            hist_team += [[y, r["team"], r["rank"], r["points"]] for r in pull(f"/recruiting/teams?year={y}", args.refresh)]
        write("history/recruits_2019_2026.json", {"fields": ["year", "athlete_id", "name", "pos", "stars", "rating", "committed_to"], "rows": hist_rec})
        write("history/recruiting_team_ranks_2019_2026.json", {"fields": ["year", "team", "rank", "points"], "rows": hist_team})
        portal = []
        for y in range(2024, 2027):
            portal += [[y, f"{p['firstName']} {p['lastName']}", p.get("position"), p.get("origin"), p.get("destination"),
                        (p.get("transferDate") or "")[:10], p.get("stars"), p.get("rating"), p.get("eligibility")]
                       for p in pull(f"/player/portal?year={y}", args.refresh)]
        write("history/portal_2024_2026.json", {"fields": ["year", "name", "pos", "origin", "destination", "date", "stars", "rating", "eligibility"], "rows": portal})
        draft = []
        for y in range(2020, 2027):
            draft += [[y, d["round"], d["pick"], d["overall"], d["name"], d.get("position"), d.get("collegeTeam"), d.get("nflTeam"),
                       d.get("preDraftGrade")] for d in pull(f"/draft/picks?year={y}", args.refresh)]
        write("history/draft_2020_2026.json", {"fields": ["year", "round", "pick", "overall", "name", "pos", "college", "nfl_team", "grade"], "rows": draft})
        recs = []
        for y in range(2021, 2026):
            recs += [[y, r.get("teamId"), r["team"], r.get("conference"), r["total"]["wins"], r["total"]["losses"],
                      r["conferenceGames"]["wins"], r["conferenceGames"]["losses"]]
                     for r in pull(f"/records?year={y}", args.refresh) if r.get("classification") in ("fbs", "fcs")]
        write("history/records_2021_2025.json", {"fields": ["year", "team_id", "team", "conference", "wins", "losses", "conf_wins", "conf_losses"], "rows": recs})

    write("manifest.json", {
        "season": SEASON, "start_date": "2026-08-24", "built": datetime.now(EASTERN).isoformat(timespec="seconds"),
        "counts": {"teams": Counter(t["level"] for t in teams), "players": sum(len(r) for r in rosters.values()),
                   "games": len(sched), "recruits_2027": len(rec), "coaches": len(coaches)},
        "notes": [
            "FCS rosters are the real CFBD 2026 rosters (the M0 spec planned generated ones).",
            "FCS head coaches are generated; CFBD covers FBS coaches only.",
            "2027 commitments are as of the pull date, not Aug 24, 2026.",
            "Logos are hotlinked from the CFBD CDN and cached by the server, not committed.",
        ],
    })


if __name__ == "__main__":
    main()
