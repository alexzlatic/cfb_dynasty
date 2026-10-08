import { Rng, type TeamRatings, type UnitRates } from "@cfb/engine";
import { mixSeed } from "./hash.ts";
import { daysBetween, type ISODate } from "./dates.ts";
import type { RatedPlayer } from "./players.ts";

/**
 * What nobody knows in August (M1 "true vs scouted ratings"). Every season some teams are much better or
 * worse than anyone projected, and the reasons already exist before the first game: players who developed,
 * a roster that fits (or fights) its coaches' system, and chemistry. The seed's ratings are the scouted
 * view (what media, polls, the AD and opponents' scouts see); the game plays the true one, which is the
 * scouted view plus three hidden scores built through spring and fall camp:
 *
 *   - development: each player's progress beyond what scouts expect. Young players progress fastest, and
 *     a team with good chemistry develops faster.
 *   - scheme fit: how the starters fit the coaches' system. New head coaches swing it most; adaptable
 *     players and good coaches raise it through camp.
 *   - chemistry: built from leaders (a leader at QB matters most), helped by scheme fit; continuity makes
 *     a good locker room better and a bad one worse, and it moves a little with how the season is going.
 *
 * Sizes are calibrated to real seasons (reports/surprise-sizes.md: 658 FBS team-seasons): a team's true
 * strength lands about 6.6 points from its preseason rating on average, 4.7 for a continuity team and 7.8
 * with a new head coach and a new QB. Offense and defense move independently. Everything is drawn from
 * the league seed, so a replay gives the same truth; nothing here changes the engine's random draws.
 */

export type Unit = "off" | "def";
export type LabArea = "technique" | "strength" | "film" | "leadership";
export const LAB_AREAS: Record<LabArea, string> = {
  technique: "Technique", strength: "Strength and speed", film: "Film study", leadership: "Leadership",
};
/** Players a staff can give individual development plans at once. */
export const LAB_SLOTS = 8;
export interface LabPlan { area: LabArea; from: ISODate }

/** A player's hidden makeup, drawn once per season from the league seed. */
export interface HiddenPlayer {
  /** Development beyond what scouts expect, in overall-rating points by the end of the season (before chemistry). */
  dev: number;
  /** Expected progress this season in overall points (scouts expect this much; young players most). */
  expected: number;
  /** 0-99: leadership, adaptability to a new system. */
  leadership: number;
  adaptability: number;
  /** How the player fits his coaches' system, in SDs (above 0 fits). */
  fit: number;
}

export interface TeamContext {
  new_coach: boolean;
  new_qb: boolean;
  /** Same coach, same QB and a mostly returning lineup. */
  continuity: boolean;
  /** Head coach quality from his record, in SDs. */
  coach: number;
}

/** The team's hidden scores in points of margin per unit, and each player's development contribution. */
export interface HiddenTeam {
  fit: Record<Unit, number>;
  chem: Record<Unit, number>;
  /** Points a player adds to his unit while he is on the field (his share of the unit's development). */
  dev: Map<number, number>;
  /** Development surprise by player, in overall points, at this point of the year (for the staff's view). */
  growth: Map<number, number>;
}

/** Overall points a player is expected to gain over a season, by seasons already in college (3-5x faster when young). */
const EXPECTED = [5, 4, 2.5, 1.5, 1];
/** Spread of each player's development surprise (overall points over a season). */
const DEV_SD = 3;
/**
 * Unit-level sizes (points of margin), calibrated so the three combine to the measured team surprise. A
 * unit's development spread grows with how young its lineup is (about 2.8 for a veteran unit, 3.5 young).
 */
const devUnit = (avgExpected: number) => clamp(2 + 0.42 * avgExpected, 2.4, 3.8);
const FIT_SD = { same: 1.4, new_coach: 3.2 };
const CHEM_SD = { continuity: 1.25, same_qb: 1.8, new_qb: 2.6 };
/** Weight of each position's development in its unit (the quarterback drives an offense). */
const DEV_W: Partial<Record<string, number>> = { QB: 3 };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** How much of a player's fit his ratings explain (schemes.ts: his scheme rating against his overall); the rest is unseen. */
export const FIT_FROM_RATINGS = 0.5;

/** `schemeFit`: his fit from his ratings in his coaches' schemes, in SDs (absent: all of his fit is unseen). */
export function hiddenPlayer(seed: number, year: number, p: RatedPlayer, schemeFit?: number): HiddenPlayer {
  const rng = new Rng(mixSeed(seed, year, p.id, "hidden"));
  const g = () => rng.gauss(0, 1);
  const trait = () => Math.round(clamp(50 + 15 * g(), 1, 99));
  const out = { dev: DEV_SD * g(), expected: EXPECTED[Math.min(EXPECTED.length - 1, Math.max(0, Math.floor(p.years)))], leadership: trait(), adaptability: trait(), fit: g() };
  if (schemeFit != null) out.fit = FIT_FROM_RATINGS * schemeFit + Math.sqrt(1 - FIT_FROM_RATINGS ** 2) * out.fit;
  return out;
}

/**
 * How far into this year's development we are: spring camp (Mar-Apr) builds to 40%, summer to 50%, fall
 * camp to 85% by the start of the season, and the rest comes by mid-November.
 */
export function progress(year: number, date: ISODate): number {
  const pts: [ISODate, number][] = [[`${year}-03-01`, 0], [`${year}-04-30`, 0.4], [`${year}-07-31`, 0.5], [`${year}-08-24`, 0.85], [`${year}-11-15`, 1]];
  if (date <= pts[0][0]) return 0;
  for (let i = 1; i < pts.length; i++) {
    const [d1, v1] = pts[i], [d0, v0] = pts[i - 1];
    if (date <= d1) return v0 + (v1 - v0) * daysBetween(d0, date) / daysBetween(d0, d1);
  }
  return 1;
}

const OFF_POS = new Set(["QB", "RB", "WR", "TE", "OL"]);
const DEF_POS = new Set(["DE", "DT", "LB", "CB", "S"]);
export const unitOf = (pos: string): Unit | null => (OFF_POS.has(pos) ? "off" : DEF_POS.has(pos) ? "def" : null);

/**
 * A team's hidden scores on a date. `starters` are its opening lineup by unit (what camp was built around);
 * `morale` is how its season is going against expectations; `lab` the user's development plans.
 */
export function hiddenTeam(o: {
  seed: number; year: number; team_id: number; date: ISODate; ctx: TeamContext;
  roster: RatedPlayer[]; starters: Record<Unit, RatedPlayer[]>; morale?: number; lab?: Record<number, LabPlan>;
  /** Chemistry from players' morale about pay and playing time, in points by unit (morale.ts). */
  mood?: Record<Unit, number>;
  /** Each player's fit from his ratings in the coaches' schemes, in SDs (see hiddenPlayer). */
  schemeFit?: Map<number, number>;
}): HiddenTeam {
  const { seed, year, ctx } = o;
  const phi = progress(year, o.date);
  const hp = new Map(o.roster.map((p) => [p.id, hiddenPlayer(seed, year, p, o.schemeFit?.get(p.id))]));
  const rng = new Rng(mixSeed(seed, year, o.team_id, "hidden-team"));
  const fit = { off: 0, def: 0 }, chem = { off: 0, def: 0 };
  const labDays = (pid: number) => {
    const l = o.lab?.[pid];
    // A plan's effect builds over about 80 days of work and tops out at 100 days in a year.
    return l && o.date > l.from ? Math.min(100, daysBetween(l.from, o.date)) : 0;
  };
  for (const u of ["off", "def"] as const) {
    const st = o.starters[u];
    const n = Math.max(1, st.length);
    // Scheme fit: the starters' average fit (adaptable players shrug off a poor fit), raised through camp by a good coach.
    // (Less 0.12, what that shrug adds on average, so the scouted view stays unbiased.)
    const pf = st.map((p) => { const h = hp.get(p.id)!; return (h.fit < 0 ? h.fit * (1 - 0.6 * h.adaptability / 99) : h.fit) - 0.12; });
    const adapt = st.reduce((a, p) => a + (hp.get(p.id)!.adaptability - 50) / 15, 0) / Math.sqrt(n);
    const fz = (pf.reduce((a, b) => a + b, 0) / Math.sqrt(n) + phi * (0.35 * ctx.coach + 0.3 * adapt)) / 1.1;
    fit[u] = r2(phi * (ctx.new_coach ? FIT_SD.new_coach : FIT_SD.same) * fz);
    // Chemistry: leaders (the quarterback counts three times), helped by fit, plus what can't be explained.
    const lw = st.map((p) => (p.pos === "QB" ? 3 : 1));
    const lead = st.reduce((a, p, i) => a + lw[i] * (hp.get(p.id)!.leadership - 50 + (o.lab?.[p.id]?.area === "leadership" ? 12 * labDays(p.id) / 80 : 0)) / 15, 0)
      / Math.sqrt(lw.reduce((a, b) => a + b * b, 0));
    let cz = 0.5 * lead + 0.35 * fz + 0.79 * rng.gauss(0, 1);
    // Continuity: a good locker room gets better and a bad one worse.
    if (ctx.continuity) cz *= 1.15;
    const sd = ctx.continuity ? CHEM_SD.continuity : u === "off" && ctx.new_qb ? CHEM_SD.new_qb : CHEM_SD.same_qb;
    chem[u] = r2(phi * sd * cz + 0.5 * (o.morale ?? 0) + (o.mood?.[u] ?? 0));
  }
  // Development: better chemistry, faster development (young players gain the most from it); a staff
  // development plan adds about 2 overall points over 80 days (2.5 at most).
  const dev = new Map<number, number>(), growth = new Map<number, number>();
  const rate = (u: Unit) => clamp(1 + 0.25 * chem[u] / Math.max(1, phi * 2.5), 0.5, 1.5);
  for (const p of o.roster) {
    const h = hp.get(p.id)!, u = unitOf(p.pos);
    const lab = o.lab?.[p.id] && o.lab[p.id].area !== "leadership" ? 2 * labDays(p.id) / 80 : 0;
    const g = phi * (h.expected * ((u ? rate(u) : 1) - 1) + h.dev) + lab;
    growth.set(p.id, r2(g));
  }
  for (const u of ["off", "def"] as const) {
    const st = o.starters[u];
    const w = st.map((p) => DEV_W[p.pos] ?? 1);
    const sw = w.reduce((a, b) => a + b, 0), sw2 = w.reduce((a, b) => a + b * b, 0);
    // Scale so a unit's development spreads devUnit points across teams when the year is done.
    const young = st.reduce((a, p) => a + hp.get(p.id)!.expected, 0) / Math.max(1, st.length);
    // A returning lineup has been scouted for years, so less of its development is a surprise.
    const k = (ctx.continuity ? 0.8 : 1) * devUnit(young) / (DEV_SD * Math.sqrt(sw2) / Math.max(1, sw));
    st.forEach((p, i) => dev.set(p.id, r2(k * w[i] / Math.max(1, sw) * growth.get(p.id)!)));
    // Backups who come on the field count at a starter's weight.
    for (const p of o.roster) if (unitOf(p.pos) === u && !dev.has(p.id)) dev.set(p.id, r2(k / Math.max(1, sw) * growth.get(p.id)!));
  }
  return { fit, chem, dev, growth };
}

/** Log-odds and log shifts per point of margin for an offense (a defense moves the other way). */
const PER_POINT: Partial<Record<keyof UnitRates, number>> = { comp_pct: 0.06, yds_per_comp: 0.014, sack_rate: -0.06, int_rate: -0.06, rush_ypc: 0.014, rush_stuff: -0.05, rush_explosive: 0.035 };
/** Measured: one hidden point moves a unit's scoring margin by this many points (packages/core/scripts/hidden-check.ts). */
export const POINTS_PER_UNIT = 1.38;
const RARE = new Set<keyof UnitRates>(["sack_rate", "int_rate"]);
const logit = (p: number) => Math.log(p / (1 - p));
const inv = (x: number) => 1 / (1 + Math.exp(-x));

/** Shift a unit by `x` points; `xc` is the same with the scoring correction (CONVEX) the rare rates don't need. */
function shiftUnit(u: UnitRates, x: number, xc: number): UnitRates {
  if (!x) return u;
  const out = { ...u };
  for (const [k, v] of Object.entries(PER_POINT) as [keyof UnitRates, number][]) {
    const d = (v * (RARE.has(k) ? x : xc)) / POINTS_PER_UNIT;
    // Sacks and interceptions are rare, and a log-odds shift would raise their average as teams spread
    // out; a proportional shift keeps it where the scouted ratings put it.
    out[k] = k === "yds_per_comp" || k === "rush_ypc" ? u[k] * Math.exp(d) : RARE.has(k) ? u[k] * Math.max(0.3, 1 + d) : inv(logit(u[k]) + d);
  }
  return out;
}

/**
 * Scoring rises faster for a good offense than it falls for a bad one, so spreading teams out would add
 * points to the average game (0.36 a game between average teams, about 0.8 across the 2025 replay's real
 * matchups). Taking CONVEX x points squared back off each unit keeps scoring where the scouted ratings put it.
 */
const CONVEX = 0.016;

/** A team's ratings with `off` points of hidden strength on offense and `def` on defense (positive = better). */
export function applyHidden(r: TeamRatings, off: number, def: number): TeamRatings {
  if (!off && !def) return r;
  return { ...r, offense: shiftUnit(r.offense, off, off - CONVEX * off * off), defense: shiftUnit(r.defense, -def, -(def + CONVEX * def * def)) };
}
