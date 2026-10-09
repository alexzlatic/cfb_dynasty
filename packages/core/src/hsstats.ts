import { addDays, daysBetween, type ISODate } from "./dates.ts";
import type { Pos } from "./players.ts";
import { hashGauss, truthAt, type Grade, type Prospect } from "./recruiting.ts";

/**
 * High school stats for recruits. Every prospect plays a high school season each fall (on varsity if he's good
 * enough for his age), and his production follows his TRUE ability at the time, not what scouts or the service
 * think of him, with a fair bit of noise on top:
 *
 * - his situation: the level of competition, how good his team is and the scheme, the same every year (a kid at
 *   a small school against weak teams piles up numbers; one at a powerhouse shares the ball);
 * - the season itself: health, role, luck;
 * - his body clock: production follows where he is NOW (his true potential plus his own form), so an early
 *   bloomer dominates high school and a late bloomer's numbers undersell him.
 *
 * So stats are a real but noisy signal: across a class they line up with true potential about as well as a
 * junior's scouting read, and a prospect whose stats run well ahead of his scouted potential is worth a look,
 * because sometimes the scouts are the ones who are wrong. Everything is drawn from hashes of the league seed
 * and the prospect, never a stream, so stats are the same however a league is replayed and need no storage.
 *
 * The production sizes are a judgment call: there is no public table of high school stats for college
 * recruits. They are set so an average starter in a recruiting class has a normal good varsity season (a
 * quarterback about 1,900 yards and 17 touchdowns, a back about 900 rushing yards, a linebacker about 80
 * tackles) and the best in a class reach the numbers the top recruits post (4,000 passing yards, 2,000 rushing
 * yards, 150 tackles, 17 sacks).
 */

/** The center and spread of true potential within a recruiting class (all four grades are close to this). */
const HS_MU = 75.5;
const HS_SD = 5.5;
/** How production depends on true ability now (per class SD), and the two noises on top (per class SD). */
const P_TALENT = 0.7, P_SITUATION = 0.8, P_SEASON = 0.6;
/** Regular-season games, the first game of the season (month-day) and the most playoff games (a state title run). */
const REGULAR = 10, KICKOFF = "08-28", MAX_PLAYOFF = 5;
/** How likely he is to be on varsity by grade (normal-CDF shift; plus 0.9 per class SD of ability now). */
const VARSITY = [-1.1, 0.3, 1.7, 2.6];
/** How far below his senior-year production a younger player runs (production index, by grade). */
const YOUTH = [0.6, 0.35, 0.15, 0];

const phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
/** A seeded draw for this prospect: `k` names what it's for, `g` the season (99 for things that stay with him). */
const draw = (seed: number, p: Prospect, g: number, k: number) => hashGauss(seed, p.id, g, k, 4401);
const uni = (seed: number, p: Prospect, g: number, k: number) => phi(draw(seed, p, g, k));

export type HsLevel = "varsity" | "backup" | "jv";

export interface HsSeason {
  /** The fall he played it (his class year minus four plus his grade). */
  year: number;
  grade: Grade;
  level: HsLevel;
  /** Games played so far, and whether the season is over. */
  g: number;
  final: boolean;
  /** Missed games through injury (season-ending when he played only part of it). */
  injured: number;
  /** His team's playoff run: games played in the playoffs, and whether it won it all. */
  playoffs: number;
  champion: boolean;
  /** The season's line (see HS_COLS for each position's columns); empty on JV. */
  stats: Record<string, number>;
}

/** One stat column: its key, its header and what it means. */
export interface HsCol { key: string; label: string; title: string }
const c = (key: string, label: string, title: string): HsCol => ({ key, label, title });
const PASS = [c("cmp", "Cmp", "Completions"), c("att", "Att", "Pass attempts"), c("pass_yds", "Pass Yds", "Passing yards"), c("pass_td", "Pass TD", "Passing touchdowns"), c("int_thrown", "Int", "Interceptions thrown")];
const RUSH = [c("rush", "Car", "Carries"), c("rush_yds", "Rush Yds", "Rushing yards"), c("rush_td", "Rush TD", "Rushing touchdowns")];
const REC = [c("rec", "Rec", "Receptions"), c("rec_yds", "Rec Yds", "Receiving yards"), c("rec_td", "Rec TD", "Receiving touchdowns")];
const DEF = [c("tackles", "Tkl", "Tackles"), c("tfl", "TFL", "Tackles for loss"), c("sacks", "Sacks", "Sacks")];
const COVER = [c("ints", "Int", "Interceptions"), c("pd", "PD", "Passes defended")];
/** The stat columns for each position. */
export const HS_COLS: Record<Pos, HsCol[]> = {
  QB: [...PASS, ...RUSH],
  RB: [...RUSH, ...REC],
  WR: REC, TE: REC,
  OL: [c("pancakes", "Pancakes", "Pancake blocks"), c("sacks_allowed", "Sacks allowed", "Sacks allowed")],
  DE: [...DEF, c("ff", "FF", "Forced fumbles")], DT: [...DEF, c("ff", "FF", "Forced fumbles")],
  LB: [...DEF, ...COVER], CB: [c("tackles", "Tkl", "Tackles"), ...COVER], S: [c("tackles", "Tkl", "Tackles"), c("tfl", "TFL", "Tackles for loss"), ...COVER],
  K: [c("fgm", "FGM", "Field goals made"), c("fga", "FGA", "Field goals tried"), c("fg_long", "Long", "Longest field goal"), c("xpm", "XPM", "Extra points made"), c("xpa", "XPA", "Extra points tried")],
  P: [c("punts", "Punts", "Punts"), c("punt_avg", "Avg", "Yards a punt"), c("punt_long", "Long", "Longest punt")],
  LS: [],
};
/** The one number that sums up a season at each position (for lists and sorting). */
export const HS_LEAD: Record<Pos, string> = {
  QB: "pass_yds", RB: "rush_yds", WR: "rec_yds", TE: "rec_yds", OL: "pancakes", DE: "sacks", DT: "tfl", LB: "tackles", CB: "pd", S: "tackles", K: "fgm", P: "punt_avg", LS: "g",
};
/** Stats that are rates or bests, not totals (they don't grow game by game). */
const NOT_TOTALS = new Set(["punt_avg", "fg_long", "punt_long"]);

/** His ability now against his class, in class SDs: true potential plus his own form (early or late bloomer). */
function abilityZ(p: Prospect, date: ISODate): number {
  return (truthAt(p, date) - HS_MU + p.form) / Math.hypot(HS_SD, 2.5);
}

/** Varsity starter, backup or JV in a grade: once he makes varsity (or starts) he stays there. */
function levelOf(seed: number, p: Prospect, g: Grade): HsLevel {
  let onVarsity = false, starts = false;
  for (let k = 0; k <= g; k++) {
    const zC = abilityZ(p, `${p.cls - 4 + k}-10-01`);
    onVarsity ||= uni(seed, p, k, 3) < phi(VARSITY[k] + 0.9 * zC);
    starts ||= onVarsity && uni(seed, p, k, 4) < phi(VARSITY[k] + 0.9 + 0.9 * zC);
  }
  return !onVarsity ? "jv" : starts ? "varsity" : "backup";
}

/** How a season went: level, production index, games, injury and playoff run (everything but the stat line). */
function seasonShape(seed: number, p: Prospect, g: Grade) {
  const year = p.cls - 4 + g;
  const zC = abilityZ(p, `${year}-10-01`);
  const situation = draw(seed, p, 99, 1);
  // Younger players line up against older ones, so the same talent produces less as a freshman.
  const perf = P_TALENT * zC + P_SITUATION * situation + P_SEASON * draw(seed, p, g, 2) - YOUTH[g];
  const level = levelOf(seed, p, g);
  // His team: how good it is (it moves a little year to year), helped some by him.
  const team = 0.8 * draw(seed, p, 99, 5) + 0.35 * draw(seed, p, g, 6) + (level === "varsity" ? 0.25 * zC : 0);
  let playoffs = 0, champion = false;
  if (team + 0.6 * draw(seed, p, g, 7) > -0.25) {
    playoffs = 1;
    while (playoffs <= MAX_PLAYOFF) {
      if (team + draw(seed, p, g, 10 + playoffs) < 0.25 + 0.2 * playoffs) break;
      if (playoffs === MAX_PLAYOFF) { champion = true; break; }
      playoffs++;
    }
  }
  const scheduled = REGULAR + playoffs;
  // Injuries: about 7% lose most of a season, 13% miss a game to three.
  const u = uni(seed, p, g, 20);
  const injured = u < 0.07 ? Math.max(1, Math.round(scheduled * (1 - 0.8 * uni(seed, p, g, 21)))) : u < 0.2 ? 1 + Math.floor(3 * uni(seed, p, g, 22)) : 0;
  return { year, zC, perf, level, playoffs, champion, scheduled, injured: Math.min(injured, scheduled - 1) };
}

/** A count around its expected value: about Poisson in spread, never below zero. */
function count(seed: number, p: Prospect, g: number, k: number, mu: number): number {
  return Math.max(0, Math.round(mu + Math.sqrt(Math.max(mu, 0.25)) * draw(seed, p, g, k)));
}

/**
 * A full season's line for his position: per-game rates at his production index (an average starter in a
 * recruiting class at 0) times the games he played, with the season's own scatter on every count. Some of
 * his style is his school's (a passing or running team, a back who catches the ball), the same every year.
 */
function seasonLine(seed: number, p: Prospect, g: Grade, perf: number, games: number, role: number): Record<string, number> {
  // Production saturates: the best season in a class is a state record, not a video game.
  const P = 2.5 * Math.tanh(perf / 2.5), n = games * role;
  const lean = draw(seed, p, 99, 30), legs = draw(seed, p, 99, 31);
  const k = (i: number, mu: number) => count(seed, p, g, 40 + i, mu);
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const made = (tries: number, pct: number) => Math.min(tries, Math.round(tries * pct));
  const out: Record<string, number> = {};
  const rush = (car: number, ypc: number, tdRate: number) => {
    out.rush = k(1, car * n);
    out.rush_yds = Math.round(out.rush * clamp(ypc + 0.8 * draw(seed, p, g, 50), 1.5, 12));
    out.rush_td = k(2, out.rush * tdRate);
  };
  const rec = (per: number, ypr: number, tdRate: number) => {
    out.rec = k(3, per * n);
    out.rec_yds = Math.round(out.rec * clamp(ypr + 1.5 * draw(seed, p, g, 51), 5, 28));
    out.rec_td = k(4, out.rec * tdRate);
  };
  switch (p.pos) {
    case "QB": {
      out.att = k(5, 24 * Math.exp(0.08 * P + 0.2 * lean) * n);
      const pct = clamp(0.58 + 0.035 * P + 0.02 * draw(seed, p, g, 52), 0.38, 0.76);
      out.cmp = made(out.att, pct);
      out.pass_yds = Math.round(out.cmp * clamp(13.5 * Math.exp(0.06 * P) + 0.8 * draw(seed, p, g, 53), 8, 20));
      out.pass_td = k(6, out.att * 0.07 * Math.exp(0.2 * P));
      out.int_thrown = k(7, out.att * 0.03 * Math.exp(-0.2 * P));
      rush(6 * Math.exp(0.35 * legs - 0.15 * lean), 4.5 + 0.7 * P + 0.6 * legs, 0.07);
      break;
    }
    case "RB":
      rush(15 * Math.exp(0.12 * P - 0.1 * lean), 5.5 + 0.9 * P, 0.08 * Math.exp(0.15 * P));
      rec(1.2 * Math.exp(0.3 * lean + 0.2 * P), 10 + 0.8 * P, 0.08);
      break;
    case "WR": rec(3.5 * Math.exp(0.2 * P + 0.2 * lean), 15 + 1.2 * P, 0.14 * Math.exp(0.1 * P)); break;
    case "TE": rec(2 * Math.exp(0.2 * P + 0.2 * lean), 12 + 0.8 * P, 0.13); break;
    case "OL":
      out.pancakes = k(8, 3 * Math.exp(0.25 * P) * n);
      out.sacks_allowed = k(9, 0.3 * Math.exp(-0.3 * P) * n);
      break;
    case "DE": case "DT": {
      const de = p.pos === "DE";
      out.tackles = k(10, (de ? 5 : 4.5) * Math.exp(0.12 * P) * n);
      out.tfl = Math.min(out.tackles, k(11, (de ? 1 : 0.8) * Math.exp(0.3 * P) * n));
      out.sacks = Math.min(out.tfl, k(12, (de ? 0.55 : 0.35) * Math.exp(0.35 * P) * n));
      out.ff = k(13, 0.1 * Math.exp(0.2 * P) * n);
      break;
    }
    case "LB":
      out.tackles = k(10, 8 * Math.exp(0.15 * P) * n);
      out.tfl = Math.min(out.tackles, k(11, 1 * Math.exp(0.25 * P) * n));
      out.sacks = Math.min(out.tfl, k(12, 0.3 * Math.exp(0.3 * P) * n));
      out.ints = k(14, 0.08 * Math.exp(0.2 * P) * n);
      out.pd = k(15, 0.3 * Math.exp(0.2 * P) * n);
      break;
    case "CB": case "S": {
      const cb = p.pos === "CB";
      out.tackles = k(10, (cb ? 3.5 : 5.5) * Math.exp((cb ? 0.05 : 0.1) * P) * n);
      if (!cb) out.tfl = k(11, 0.4 * Math.exp(0.2 * P) * n);
      out.ints = k(14, 0.25 * Math.exp(0.3 * P) * n);
      out.pd = k(15, (cb ? 0.8 : 0.6) * Math.exp(0.25 * P) * n);
      break;
    }
    case "K":
      out.fga = k(16, 1 * Math.exp(0.1 * P) * n);
      out.fgm = out.fga ? made(out.fga, clamp(0.65 + 0.07 * P + 0.05 * draw(seed, p, g, 54), 0.3, 0.97)) : 0;
      out.fg_long = out.fgm ? Math.round(clamp(38 + 5 * P + 4 * draw(seed, p, g, 55), 22, 60)) : 0;
      out.xpa = k(17, 3.5 * n);
      out.xpm = made(out.xpa, clamp(0.88 + 0.03 * P, 0.7, 1));
      break;
    case "P":
      out.punts = k(18, 4 * n);
      out.punt_avg = out.punts ? Math.round(clamp(36 + 2.5 * P + 1.5 * draw(seed, p, g, 56), 26, 48) * 10) / 10 : 0;
      out.punt_long = out.punts ? Math.round(out.punt_avg + 12 + 4 * Math.abs(draw(seed, p, g, 57))) : 0;
      break;
  }
  return out;
}

/** The date of game `k` (0-based) of a season: Fridays from late August, playoffs into November and December. */
const gameDate = (year: number, k: number) => addDays(`${year}-${KICKOFF}`, 7 * k);

/** Games he has played in a season by a date (whole games; the first is on kickoff day). */
function gamesBy(shape: ReturnType<typeof seasonShape>, date: ISODate): number {
  const days = daysBetween(`${shape.year}-${KICKOFF}`, date);
  if (days < 0) return 0;
  const onCalendar = Math.min(shape.scheduled, Math.floor(days / 7) + 1);
  return Math.max(0, Math.min(onCalendar, shape.scheduled - shape.injured));
}

/** One high school season as of a date, or null if it hasn't started (or he isn't in high school that year). */
export function hsSeason(seed: number, p: Prospect, g: Grade, date: ISODate): HsSeason | null {
  const shape = seasonShape(seed, p, g);
  if (date < gameDate(shape.year, 0)) return null;
  const final = date >= gameDate(shape.year, shape.scheduled - 1);
  const base = { year: shape.year, grade: g, level: shape.level, final, playoffs: final ? shape.playoffs : 0, champion: final && shape.champion };
  if (shape.level === "jv") return { ...base, g: 0, injured: 0, stats: {} };
  const played = shape.scheduled - shape.injured;
  const g0 = gamesBy(shape, date);
  const full = seasonLine(seed, p, g, shape.perf, played, shape.level === "varsity" ? 1 : 0.3);
  // Partway through a season his totals are the share of the season he has played so far.
  const share = played ? g0 / played : 0;
  const stats: Record<string, number> = { g: g0 };
  for (const [key, v] of Object.entries(full)) stats[key] = NOT_TOTALS.has(key) ? (g0 ? v : 0) : Math.round(v * share);
  if (stats.cmp > stats.att) stats.cmp = stats.att;
  if (stats.fgm > stats.fga) stats.fgm = stats.fga;
  if (stats.xpm > stats.xpa) stats.xpm = stats.xpa;
  return { ...base, g: g0, injured: final ? shape.injured : Math.max(0, Math.min(shape.injured, gamesOnCalendar(shape, date) - g0)), stats };
}
const gamesOnCalendar = (shape: ReturnType<typeof seasonShape>, date: ISODate) =>
  Math.max(0, Math.min(shape.scheduled, Math.floor(daysBetween(`${shape.year}-${KICKOFF}`, date) / 7) + 1));

/** Every high school season he has started by a date, freshman year first. */
export function hsSeasons(seed: number, p: Prospect, date: ISODate): HsSeason[] {
  const out: HsSeason[] = [];
  for (const g of [0, 1, 2, 3] as Grade[]) {
    const s = hsSeason(seed, p, g, date);
    if (s) out.push(s);
  }
  return out;
}

/**
 * His latest season (in progress or done) by a date, or null before his first. Everyone in a class is on the
 * same season, so lists compare like with like (this fall's games so far, or last fall's full season).
 */
export function hsLatest(seed: number, p: Prospect, date: ISODate): HsSeason | null {
  const ss = hsSeasons(seed, p, date);
  return ss[ss.length - 1] ?? null;
}

/**
 * What a staff takes from his production: an estimate of his true potential and how far to trust it. Scouts
 * know numbers lie (competition, scheme, an early growth spurt) and trust them less than they should, about
 * 60% wider than the real noise, so his stats move their read only a little: a lot for a freshman or an
 * unknown, hardly at all for a senior they've watched for years. Seasons count as he plays them, game by game,
 * so nothing jumps on any date. Null before he has played varsity.
 */
export function statRead(seed: number, p: Prospect, date: ISODate): { est: number; sd: number } | null {
  let sw = 0, sw2 = 0, sp = 0;
  for (const g of [0, 1, 2, 3] as Grade[]) {
    const shape = seasonShape(seed, p, g);
    if (shape.level === "jv") continue;
    const start = `${shape.year}-${KICKOFF}`, days = daysBetween(start, date);
    if (days <= 0) continue;
    // Smoothly with the calendar: the share of his season played so far (a backup counts a third).
    const span = 7 * (shape.scheduled - 1) + 1;
    const w = Math.min(1, days / span) * (1 - shape.injured / shape.scheduled) * (shape.level === "varsity" ? 1 : 0.33);
    if (w <= 0) continue;
    sw += w; sw2 += w * w; sp += w * (shape.perf + YOUTH[g]);
  }
  if (sw <= 0) return null;
  const perf = sp / sw;
  // Noise in production, in class SDs of ability: his situation (it doesn't average out) and the seasons (it does).
  const noise = Math.sqrt((P_SITUATION ** 2 + P_SEASON ** 2 * sw2 / (sw * sw)) / Math.min(1, sw));
  const scale = Math.hypot(HS_SD, 2.5) / P_TALENT;
  return { est: HS_MU + perf * scale, sd: 1.6 * Math.hypot(noise * scale, 2.5) };
}

/** A season's line in a few words for lists: "2,850 pass yds, 31 TD". */
export function hsSummary(pos: Pos, s: HsSeason | null): string {
  if (!s) return "";
  if (s.level === "jv") return "JV";
  const x = s.stats, n = (v: number | undefined) => (v ?? 0).toLocaleString("en-US");
  switch (pos) {
    case "QB": return `${n(x.pass_yds)} pass yds, ${n(x.pass_td)} TD, ${n(x.rush_yds)} rush`;
    case "RB": return `${n(x.rush_yds)} rush yds, ${n((x.rush_td ?? 0) + (x.rec_td ?? 0))} TD`;
    case "WR": case "TE": return `${n(x.rec)} rec, ${n(x.rec_yds)} yds, ${n(x.rec_td)} TD`;
    case "OL": return `${n(x.pancakes)} pancakes`;
    case "DE": case "DT": return `${n(x.tackles)} tkl, ${n(x.tfl)} TFL, ${n(x.sacks)} sacks`;
    case "LB": return `${n(x.tackles)} tkl, ${n(x.tfl)} TFL, ${n(x.sacks)} sacks`;
    case "CB": return `${n(x.ints)} INT, ${n(x.pd)} PD, ${n(x.tackles)} tkl`;
    case "S": return `${n(x.tackles)} tkl, ${n(x.ints)} INT, ${n(x.pd)} PD`;
    case "K": return `${n(x.fgm)}/${n(x.fga)} FG, long ${n(x.fg_long)}`;
    case "P": return `${n(x.punts)} punts, ${x.punt_avg ?? 0} avg`;
    default: return `${n(x.g)} games`;
  }
}
