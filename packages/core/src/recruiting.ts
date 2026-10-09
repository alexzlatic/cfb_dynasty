import { Rng } from "@cfb/engine";
import { addDays, daysBetween, type ISODate } from "./dates.ts";
import { mixSeed } from "./hash.ts";
import { ATTRS, POSITIONS, fromZ, overall, z, type Pos, type RatedPlayer } from "./players.ts";
import { RECRUIT_FIT, STARTERS, choose, miles, offerScore, persona, type Persona, type SchoolOffer } from "./valuation.ts";
import type { StaffTime } from "./staff.ts";
import { statRead } from "./hsstats.ts";

/**
 * High school recruiting (M3 step 3). Four classes are live at once: in August 2026 the 2027 class are
 * seniors finishing their commitments, 2028 juniors, 2029 sophomores and 2030 freshmen. Each signing day
 * the seniors leave for college and a new freshman class appears.
 *
 * Every prospect has a hidden true potential (the overall he is on course to reach in college) that is
 * genuinely unsettled while he is young: kids grow at different rates, so it moves a lot from year to year
 * as a freshman and sophomore and much less later, without ever being fully settled. Nobody sees it. The
 * national recruiting service (a composite in the style of 247Sports, On3 and Rivals) publishes stars,
 * a 0.80-1.00 rating and ranks for about 50 freshmen, about 500 sophomores and every junior and senior; each
 * school reads prospects through its own scouts, best in its own region, and can pay to scout further. Every
 * prospect exists from his freshman year, but a staff only knows the ones the service rates, the ones near
 * home its coaches have come across, and the ones its scouts find in regions it covers.
 *
 * The 2027 class is real (CFBD), with its real commitments as verbals that can still flip, completed with
 * generated prospects at the low end. 2028 to 2030 and every class after are generated from real
 * prospects of the 2024 to 2026 classes (hometown, position, size and how highly each was rated), so the
 * geography of talent, the position mix and the number of stars match real classes.
 */

// ---- truth ---------------------------------------------------------------------------------------
/** Grades: 0 freshman, 1 sophomore, 2 junior, 3 senior; the path's last entry is his potential on arrival at college. */
export type Grade = 0 | 1 | 2 | 3;
export const GRADE_WORDS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

/**
 * How much of a prospect's true potential carries from one year to the next (freshman to sophomore,
 * sophomore to junior, junior to senior, senior to college): the rest is new. Against a class spread of
 * about 6.5 points that is about 4.3, 3.4, 2.5 and 1.6 points of change a year, and a freshman's true
 * potential correlates about 0.57 with where he arrives, a sophomore's 0.76, a junior's 0.89 and a
 * senior's 0.97.
 */
export const CARRY = [0.75, 0.85, 0.92, 0.97];

/** Potential (overall points) for a national-service composite: a 0.98 five-star about 92, a 0.86 three-star 77. */
export function potentialFor(composite: number): number {
  const rz = (composite - 0.8684) / 0.0341;
  return 77.5 + 2.4 * rz + 2 * Math.max(0, rz);
}
/** Overall when he arrives at college, from his potential (the seed's freshmen: a five-star about 76, a typical three-star 63). */
export const arrivalOvr = (potential: number) => 62 + 0.77 * (potential - 75);
/** Overall points a high school player gains in a year. */
const HS_GAIN = 9.5;

export interface Prospect {
  id: number;
  /** CFBD recruit id for the real 2027 class. */
  ref: string | null;
  /** High school class (the year he signs and enrolls). */
  cls: number;
  first: string; last: string;
  pos: Pos;
  /** The position the services list (CFBD's: IOL, EDGE, ATH...). */
  listed: string;
  home: { city: string | null; state: string | null; lat: number; lon: number };
  ht: number | null; wt: number | null;
  /** True potential as a freshman, sophomore, junior and senior, and on arriving at college. */
  path: number[];
  /** Where his current overall runs against his potential (points), his own. */
  form: number;
  /** The national service: composite, national rank in his class, and its read of his potential. */
  svc: { r: number; rank: number; read: number; real?: boolean } | null;
  /** His commitment; `bond` is how firmly (logit points his school is ahead by on top of what it has earned, set on the first week of recruiting after he commits). */
  commit: { team: number; signed: boolean; date: ISODate; bond?: number } | null;
  /** Schools that have offered him, in the order they offered. */
  offers: number[];
  /** Contact hours each school has put into him (they fade when a school stops calling). */
  interest: Record<string, number>;
  /** The schools he has had his eye on from the start (empty: wide open), set the first week he's recruited. */
  fav?: number[];
}

export const gradeOf = (p: { cls: number }, year: number) => (year + 4 - p.cls) as Grade;

/** Years until he arrives at college (July 1 of his class year): about 3.9 for a freshman in August, 0.9 for a senior. */
export const yearsOut = (p: { cls: number }, date: ISODate) => daysBetween(date, `${p.cls}-07-01`) / 365;

/** A smooth curve through yearly points at x = 0, 1, 2... (Catmull-Rom), so values change a little every day, never in jumps. */
export function smoothAt(pts: number[], x: number): number {
  const n = pts.length;
  if (x <= 0) return pts[0];
  if (x >= n - 1) return pts[n - 1];
  const i = Math.floor(x), f = x - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}

/**
 * His true potential today. The path holds where it stands each July 1 (before his freshman, sophomore,
 * junior and senior years, and on arrival); in between it moves smoothly, so a change shows up a little at
 * a time as he's scouted. Year-to-year changes shrink as he gets older (CARRY), so the swings calm down
 * gradually rather than on any date.
 */
export const truthAt = (p: Prospect, date: ISODate) => smoothAt(p.path, 4 - yearsOut(p, date));

/** His overall right now: low as a freshman, near a college freshman's as a senior, rising every day. */
export function currentOvr(p: Prospect, date: ISODate): number {
  const t = Math.max(0, yearsOut(p, date));
  return Math.round(Math.max(15, Math.min(85, arrivalOvr(truthAt(p, date)) - HS_GAIN * t + p.form)));
}

/** A seeded error that drifts smoothly with his age (yearly draws, joined by the same smooth curve). */
export function smoothError(seed: number, a: number, b: number, t: number): number {
  return errorAt(errorPoints(seed, a, b), t);
}
/** The yearly draws behind a smoothError (kept by a week of recruiting so it draws them once). */
export function errorPoints(seed: number, a: number, b: number): number[] {
  const base = hashGauss(seed, a, b, 101);
  return [0, 1, 2, 3, 4, 5].map((k) => 0.6 * base + 0.8 * hashGauss(seed, a, b, k, 103));
}
export const errorAt = (pts: number[], t: number) => smoothAt(pts, Math.max(0, Math.min(5, 4.5 - t)));

// ---- the pool generated prospects come from ---------------------------------------------------------
export interface RecruitSeed {
  /** National composite by rank (rank 1 first), from real classes. */
  curve: number[];
  class_size: number;
  /** Real prospects: [CFBD position, composite or null, lat, lon, state, city, height, weight]. */
  pool: [string, number | null, number, number, string | null, string | null, number | null, number | null][];
  /** The real 2027 class. */
  real: { id: string; name: string; pos: string; stars: number | null; rating: number | null; rank: number | null; height: number | null; weight: number | null;
    city: string | null; state: string | null; lat: number | null; lon: number | null; committed_to: string | null }[];
  real_year: number;
  /** Real signing classes 2024-2026 by school name: composites (null unrated). */
  history: { year: number; rating: number | null; school: string }[];
}

/** Game position from the services' listing (athletes become skill players or defensive backs). */
export function gamePos(listed: string, weight: number | null, u: number): Pos {
  switch (listed) {
    case "QB": case "RB": case "WR": case "TE": case "LB": case "CB": case "S": case "K": case "P": case "LS": return listed;
    case "IOL": case "OT": case "OL": case "OG": case "OC": return "OL";
    case "EDGE": case "DE": return "DE";
    case "DL": case "DT": return (weight ?? 280) < 250 ? "DE" : "DT";
    case "DB": return (weight ?? 190) >= 198 ? "S" : "CB";
    case "APB": case "FB": return "RB";
    default: return u < 0.4 ? "WR" : u < 0.65 ? "CB" : u < 0.85 ? "S" : "RB";
  }
}

/** The class's center and spread of true potential at arrival (for the year-to-year carry). */
export function classShape(rs: RecruitSeed): { mu: number; sd: number } {
  const ps = rs.pool.map((r) => (r[1] != null ? potentialFor(r[1]) : 68));
  const mu = ps.reduce((a, b) => a + b, 0) / ps.length;
  return { mu, sd: Math.sqrt(ps.reduce((a, b) => a + (b - mu) ** 2, 0) / ps.length) };
}

/** A whole path from his potential at one grade: backward and forward with the year-to-year carry. */
function pathFrom(at: number, grade: number, shape: { mu: number; sd: number }, rng: Rng): number[] {
  const path: number[] = [];
  path[grade] = at;
  for (let g = grade; g < 4; g++) path[g + 1] = shape.mu + CARRY[g] * (path[g] - shape.mu) + shape.sd * Math.sqrt(1 - CARRY[g] ** 2) * rng.gauss(0, 1);
  // A stationary process runs the same backward, so earlier years are drawn the same way.
  for (let g = grade - 1; g >= 0; g--) path[g] = shape.mu + CARRY[g] * (path[g + 1] - shape.mu) + shape.sd * Math.sqrt(1 - CARRY[g] ** 2) * rng.gauss(0, 1);
  return path.map((x) => Math.round(Math.max(50, Math.min(99, x)) * 10) / 10);
}

const SENIOR_TRUE_SD = 2;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** A generated class: `n` prospects drawn from real ones, at `grade` in `year`. */
export function generateClass(o: { seed: number; cls: number; year: number; n: number; rs: RecruitSeed; shape: { mu: number; sd: number };
  firsts: string[]; lasts: string[]; startId: number; filter?: (row: RecruitSeed["pool"][number]) => boolean }): Prospect[] {
  const rng = new Rng(mixSeed(o.seed, o.cls, "class"));
  const grade = o.year + 4 - o.cls;
  const rows = o.filter ? o.rs.pool.filter(o.filter) : o.rs.pool;
  const out: Prospect[] = [];
  const pick = (xs: string[]) => xs[Math.floor(rng.random() * xs.length)] ?? "";
  for (let i = 0; i < o.n; i++) {
    const row = rows[Math.floor(rng.random() * rows.length)];
    const [listed, rating, lat, lon, state, city, ht, wt] = row;
    // Where he arrives at college: as good as the real prospect he's drawn from, give or take.
    const arrive = (rating != null ? potentialFor(rating) : 68) + (rating != null ? SENIOR_TRUE_SD : 3) * rng.gauss(0, 1);
    const path = pathFrom(arrive, 4, o.shape, rng);
    // Younger players are smaller.
    const younger = Math.max(0, 3 - grade);
    out.push({
      id: o.startId + i, ref: null, cls: o.cls, first: pick(o.firsts), last: pick(o.lasts), pos: gamePos(listed, wt, rng.random()), listed,
      home: { city, state, lat: Math.round((lat + 0.04 * rng.gauss(0, 1)) * 1000) / 1000, lon: Math.round((lon + 0.04 * rng.gauss(0, 1)) * 1000) / 1000 },
      ht: ht != null ? Math.round(ht - 0.7 * younger) : null, wt: wt != null ? Math.round(wt * (1 - 0.05 * younger)) : null,
      path, form: r3(2.5 * rng.gauss(0, 1)), svc: null, commit: null, offers: [], interest: {},
    });
  }
  return out;
}

/** The real senior class, its commitments as verbals, completed to a full class with generated prospects at the low end. */
export function realClass(o: { seed: number; rs: RecruitSeed; shape: { mu: number; sd: number }; teamIds: Map<string, number>; date: ISODate;
  firsts: string[]; lasts: string[]; startId: number }): Prospect[] {
  const rng = new Rng(mixSeed(o.seed, o.rs.real_year, "real-class"));
  const out: Prospect[] = [];
  let id = o.startId;
  for (const r of o.rs.real) {
    // The service's rating is a read of where he is now; the truth is near it.
    // The real services miss more the further down their lists a prospect is (svcMiss).
    const now = (r.rating != null ? potentialFor(r.rating) : 68) + (r.rating != null ? Math.max(SENIOR_TRUE_SD, svcMiss(r.rank)) : 3) * rng.gauss(0, 1);
    const [first, ...rest] = (r.name ?? "").split(" ");
    const team = r.committed_to ? o.teamIds.get(r.committed_to) ?? null : null;
    out.push({
      id: id++, ref: r.id, cls: o.rs.real_year, first, last: rest.join(" "), pos: gamePos(r.pos, r.weight, rng.random()), listed: r.pos,
      home: { city: r.city, state: r.state, lat: r.lat ?? 39, lon: r.lon ?? -95 }, ht: r.height, wt: r.weight,
      path: pathFrom(now, 3, o.shape, rng), form: r3(2.5 * rng.gauss(0, 1)),
      svc: r.rating != null ? { r: r.rating, rank: r.rank ?? 9999, read: Math.round(potentialFor(r.rating) * 10) / 10, real: true } : null,
      commit: team != null ? { team, signed: false, date: o.date } : null, offers: team != null ? [team] : [], interest: team != null ? { [team]: 60 } : {},
    });
  }
  // Real lists are incomplete until signing day: the rest of the class comes from the unrated and low end.
  const more = Math.max(0, o.rs.class_size - out.length);
  out.push(...generateClass({ seed: o.seed, cls: o.rs.real_year, year: o.rs.real_year - 1, n: more, rs: o.rs, shape: o.shape, firsts: o.firsts, lasts: o.lasts,
    startId: id, filter: (row) => row[1] == null || row[1] < 0.83 }));
  return out;
}

// ---- the national recruiting service ---------------------------------------------------------------
/** The service's read error (points of potential) by years until arrival (0 to 4+), before re-rates narrow it. */
const SVC_SD = [1.5, 2, 3, 4, 6];
const svcSd = (t: number) => smoothAt(SVC_SD, Math.max(0, Math.min(4, t)));
/**
 * The service's misses that never wash out, by where a prospect ranks (its last list; unrated is the bottom),
 * in points of potential: the top 100 go to every camp and are on film everywhere, a 700th-ranked kid at a
 * small school is seen once or twice. They add to its everyday error (svcSdFor). Calibrated to real drafts
 * (docs/recruiting.md): about 44% of first-rounders were outside the top 300 as recruits.
 */
export const SVC_MISS: [number, number][] = [[25, 2], [100, 2.6], [300, 3.6], [1000, 7], [Infinity, 8.5]];
export const svcMiss = (rank: number | null | undefined) => SVC_MISS.find(([r]) => (rank ?? Infinity) <= r)![1];
/** The service's error on a prospect `t` years from college at its `k`-th re-rate of the year, by his last rank. */
const svcSdFor = (t: number, rank: number | null | undefined, k = 0) => Math.hypot(svcSd(t) * RERATE[k], svcMiss(rank));
/**
 * The service's error on a prospect (points): its everyday error, narrowing with each re-rate, plus the miss
 * for his rank. Below its top 1,000 the miss runs mostly one way: a kid nobody has seen is far more often
 * underrated than overrated (an unknown doesn't get rated a five-star by mistake).
 */
function svcError(seed: number, p: Prospect, t: number, rank: number | null | undefined, k = 0): number {
  const miss = smoothError(seed, p.id, 1, t);
  return svcSd(t) * RERATE[k] * smoothError(seed, p.id, 0, t) + svcMiss(rank) * ((rank ?? Infinity) > 1000 && miss > 0 ? 0.35 * miss : miss);
}
/** How many each grade the service rates: about 50 freshmen, about 500 sophomores, every junior and senior. */
export const SVC_RATED = [50, 500, Infinity, Infinity];
/**
 * How deep into each class the schools recruit (by national rank): no freshmen, the top 50 sophomores and 500
 * juniors, every senior. Prospects on your board are always in play.
 */
export const IN_PLAY = [0, 50, 500, Infinity];
export const inPlay = (p: Prospect, g: number) => p.svc != null && g >= 1 && p.svc.rank <= IN_PLAY[g];
/** Re-rates through the year narrow its reads: start of the year, after spring camps, after the summer circuit, after the season. */
export const RERATE = [1, 0.85, 0.7, 0.55];
export const RERATE_DATES = (year: number): ISODate[] => [`${year}-05-15`, `${year}-08-01`, `${year}-12-15`];

/** The composite for a national rank, from the real curve (straight on past its end). */
export function compositeAt(curve: number[], rank: number): number {
  if (rank <= curve.length) return curve[rank - 1];
  return Math.max(0.6, curve[curve.length - 1] - 0.00004 * (rank - curve.length));
}
/** Stars from a composite (the services' cutoffs). */
export const starsOf = (c: number) => (c >= 0.9834 ? 5 : c >= 0.89 ? 4 : c >= 0.797 ? 3 : 2);

/** A seeded normal draw for a list of numbers, without a stream (cheap enough for every school and prospect). */
export function hashGauss(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const x of parts) { h = Math.imul(h ^ (x >>> 0), 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16; }
  const u1 = ((h >>> 0) + 1) / 4294967297;
  h = Math.imul(h ^ 0x27d4eb2d, 0x165667b1) >>> 0; h ^= h >>> 15;
  const u2 = (h >>> 0) / 4294967296;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * The service rates a year's classes: its read of each prospect is his true potential now plus an error that
 * shrinks with each re-rate (and is smaller for the prominent). Ranks and composites follow the reads; the real
 * class keeps its real ratings.
 */
export function rateClasses(ps: Prospect[], year: number, date: ISODate, rerate: number, seed: number, curve: number[]): void {
  const byCls = new Map<number, Prospect[]>();
  for (const p of ps) { const g = gradeOf(p, year); if (g >= 0 && g <= 3) (byCls.get(p.cls) ?? byCls.set(p.cls, []).get(p.cls)!).push(p); }
  for (const [cls, list] of byCls) {
    const g = year + 4 - cls;
    const reads = list.map((p) => {
      if (p.svc?.real) return { p, read: p.svc.read };
      // Its error drifts slowly; prominent prospects are watched more closely.
      const t = yearsOut(p, date);
      return { p, read: truthAt(p, date) + svcError(seed, p, t, p.svc?.rank, rerate) };
    }).sort((a, b) => b.read - a.read || a.p.id - b.p.id);
    // In the real class the rest rank among the real ratings by their reads (an unfinished real list is mostly the low end).
    let k = 0, rank = 0;
    for (const { p, read } of reads) {
      rank++;
      if (p.svc?.real) continue;
      k++;
      if (k > SVC_RATED[g]) { p.svc = null; continue; }
      const r = compositeAt(curve, rank);
      p.svc = { r: Math.round(r * 10000) / 10000, rank, read: Math.round(read * 10) / 10 };
    }
  }
}

// ---- scouting: each school's read --------------------------------------------------------------------
/**
 * A school's read error without the service (points of potential) by years until arrival, before it puts
 * any time into him: about ±16 for a freshman, ±5 for a senior (90% ranges), narrowing every day as he gets
 * older. Evaluations and contact narrow it a lot (readSd): a staff that works a senior hard reads him
 * within a point or two.
 */
export const READ_SD = [2.5, 4.5, 6, 7.5, 10];
/** How fast evaluations narrow a read (an evaluation's worth; contact hours count as a twentieth of one each). */
const EVAL_GAIN = 1.2;
/** Contact hours a school has put into a prospect count toward its evaluations: every 20 hours is one look. */
export const HOURS_PER_EVAL = 20;
export const readBase = (t: number) => smoothAt(READ_SD, Math.max(0, Math.min(4, t)));
/** Scouting regions a school can send scouts to (each is a set of states; California splits north and south). */
export type Region = "texas" | "florida" | "georgia" | "socal" | "west" | "mountain" | "deep_south" | "carolinas" | "mid_south" | "ohio_valley" | "midwest" | "northeast";
export const REGIONS: Record<Region, { name: string; states: string[] }> = {
  texas: { name: "Texas", states: ["TX"] },
  florida: { name: "Florida", states: ["FL"] },
  georgia: { name: "Georgia", states: ["GA"] },
  socal: { name: "Southern California", states: ["CA-S"] },
  west: { name: "Northern California and the Northwest", states: ["CA-N", "OR", "WA", "ID", "NV", "AK", "HI"] },
  mountain: { name: "Arizona and the Mountain West", states: ["AZ", "NM", "UT", "CO", "WY", "MT"] },
  deep_south: { name: "Alabama, Mississippi, Louisiana and Arkansas", states: ["AL", "MS", "LA", "AR"] },
  carolinas: { name: "The Carolinas, Virginia and Maryland", states: ["NC", "SC", "VA", "WV", "MD", "DC", "DE"] },
  mid_south: { name: "Tennessee and Kentucky", states: ["TN", "KY"] },
  ohio_valley: { name: "Ohio, Pennsylvania, Michigan and Indiana", states: ["OH", "PA", "MI", "IN"] },
  midwest: { name: "The Midwest and Plains", states: ["IL", "WI", "MN", "IA", "MO", "KS", "NE", "OK", "ND", "SD"] },
  northeast: { name: "The Northeast", states: ["NY", "NJ", "CT", "MA", "RI", "VT", "NH", "ME"] },
};
export function regionOf(home: { state: string | null; lat: number }): Region | null {
  const st = home.state === "CA" ? (home.lat < 35.5 ? "CA-S" : "CA-N") : home.state;
  return st ? REGION_OF.get(st) ?? null : null;
}
const REGION_OF = new Map(Object.entries(REGIONS).flatMap(([k, v]) => v.states.map((st) => [st, k as Region])));
/** What a regional scout costs for a year, and an evaluation trip (in and out of your region). */
export const SCOUT_COST = { region: 95_000, trip_near: 2_500, trip_far: 7_500 };
/** Staff hours an evaluation takes. */
export const TRIP_HOURS = { near: 6, far: 9 };

export interface SchoolEye {
  id: number; lat: number; lon: number; state: string | null;
  /** Regions it covers beyond its own (power programs scout nationally). */
  regions: Region[];
  national: boolean;
  /** Staff scouting width (staff.ts scoutWidth). */
  width: number;
}

/** How wide a school's read of a prospect runs (SD, points of potential) after `evals` evaluation trips. */
export function readSd(eye: SchoolEye, p: Prospect, date: ISODate, evals = 0, area = scoutArea(eye, p)): number {
  return readBase(yearsOut(p, date)) * area * eye.width / Math.sqrt(1 + EVAL_GAIN * evals);
}
/** How well a school's scouts cover where he lives: near home best, then a region it pays for, then national scouting. */
export function scoutArea(eye: SchoolEye, p: Prospect): number {
  const near = p.home.state === eye.state || miles(p.home, eye) <= 300;
  const reg = regionOf(p.home);
  const covered = reg != null && eye.regions.includes(reg);
  return near ? 0.7 : covered ? 0.75 : eye.national ? 0.85 : 1;
}

/**
 * What anyone can see of a prospect: the service's read (with how far to trust it) and his high school stats
 * (hsstats.ts, trusted only a little). The same for every school, so a week of recruiting works it out once.
 */
export interface PublicRead { svc: { est: number; sd: number } | null; stat: { est: number; sd: number } | null }
export function publicRead(p: Prospect, date: ISODate, seed: number): PublicRead {
  const t = yearsOut(p, date);
  let svc: PublicRead["svc"] = null;
  if (p.svc) {
    // What the staff takes from the service follows its evaluators day by day (the same error, at its
    // everyday width), so no publishing date moves every estimate at once.
    const ssd = svcSdFor(t, p.svc.rank);
    svc = { est: p.svc.real ? p.svc.read : truthAt(p, date) + svcError(seed, p, t, p.svc.rank), sd: ssd };
  }
  return { svc, stat: statRead(seed, p, date) };
}

/**
 * A school's estimate of a prospect's potential and how sure it is: its own read, combined with what his high
 * school stats say and with the service's when he's rated. Its own read is as good as the time it has put in
 * (evaluations, and contact hours: HOURS_PER_EVAL), so a school that works a prospect knows him far better
 * than the service does, and one that never looked leans on the service.
 */
export function schoolRead(eye: SchoolEye, p: Prospect, date: ISODate, seed: number, evals = 0, pub = publicRead(p, date, seed),
  /** The school's coverage of him and its error draws, when the caller keeps them. */
  own?: OwnRead): { est: number; sd: number } {
  const t = yearsOut(p, date);
  const sd = readSd(eye, p, date, evals, own?.area);
  // His error drifts with time, and each look adds what it saw, so the read narrows smoothly toward the truth.
  const mine = truthAt(p, date) + sd * (own ? errorAt(own.pts, t) : smoothError(seed, eye.id, p.id, t));
  let w = 1 / (sd * sd), est = mine * w;
  for (const x of [pub.stat, pub.svc]) if (x) { const wx = 1 / (x.sd * x.sd); est += x.est * wx; w += wx; }
  return { est: est / w, sd: 1 / Math.sqrt(w) };
}

/** What a school's read of a prospect is built on that never changes: its coverage of where he lives and its error draws. */
export interface OwnRead { area: number; pts: number[] }

/** How much a school's valuation of a prospect follows its own scouts rather than the service's stars. */
const OWN_WEIGHT = 0.65;

/** A school's looks at a prospect: its evaluation trips plus the contact hours it has put in. */
export const looksOf = (p: Prospect, schoolId: number, trips = 0) => trips + (p.interest[schoolId] ?? 0) / HOURS_PER_EVAL;

// ---- discovery: which prospects a staff knows about ----------------------------------------------------
/** Everyone knows the prospects the service rates and anyone who has committed somewhere. */
export const isPublic = (p: Prospect) => p.svc != null || p.commit != null;
/**
 * The weekly chance a staff comes across a prospect it doesn't know yet: high near home (his state or within
 * 300 miles), a little lower in regions where it pays a scout, rare elsewhere (word of mouth, for the best
 * only). Better prospects are found sooner: z is how far his true potential is above his class's average, in
 * class standard deviations. `effort` is the staff's scouting time against the usual 10% (square root).
 */
export function discoverRate(eye: SchoolEye, p: Prospect, z: number, effort: number,
  /** The rate your scouts' hours in his region give it this week (regionArea), when more than the usual. */
  extra = 0): number {
  const near = p.home.state === eye.state || miles(p.home, eye) <= 300;
  const reg = regionOf(p.home);
  const area = Math.max(extra, near ? 0.08 : reg != null && eye.regions.includes(reg) ? 0.06 : eye.national ? 0.004 : 0.002);
  const prom = Math.min(1, Math.exp(1.2 * (z - 1.5)));
  return area * prom * Math.max(0.5, Math.min(2, effort)) / eye.width;
}
/**
 * Your scouts' weekly hours in a region: they look there like a paid regional scout at 8 hours a week, and
 * half again at 12 or more. Every REGION_REPORT_HOURS hours they file a report on the best they've seen.
 */
export const regionArea = (hours: number) => 0.06 * Math.min(1.5, Math.max(0, hours) / 8);
export const REGION_REPORT_HOURS = 24;
/** The chance a region report turns up a prospect your staff didn't know (z as in discoverRate): about 40% for the best, few below them. */
export const reportSees = (hours: number, z: number) => 1 - Math.exp(-0.5 * (hours / REGION_REPORT_HOURS) * Math.min(1, Math.exp(1.5 * (z - 2))));
/** Trips an assignment to see a prospect takes when you don't say (each is a look: about 40% off his range after three). */
export const DEFAULT_TRIPS = 3;

/** Weeks of looking a staff has behind it when a league starts: a sophomore class has had a year, freshmen a few weeks. */
export const KNOWN_WEEKS = [3, 40, 80, 120];

// ---- schools ---------------------------------------------------------------------------------------
/** What the weekly recruiting needs to know about a school. */
export interface School extends SchoolEye {
  level: "fbs" | "fcs";
  prestige: number; power: boolean; win_pct: number;
  /** Development (facilities and staff) and scheme fit as a recruit sees them, about -1 to 1. */
  development: number; fit: number;
  /** Contact hours a week and what each is worth (staff recruiting). */
  hours: number; eff: number;
  /** The range of prospects it recruits (potential points), from its recent classes. */
  band: [number, number];
  /** Senior signees it wants by position this cycle. */
  target: Partial<Record<Pos, number>>;
  /** Its starters' overall by position (what a recruit would compete with). */
  starter: Partial<Record<Pos, number>>;
  /** The user's school with its own board (no AI). */
  manual: boolean;
  /** Its program cycle (added to how recruits see it). */
  buzz: number;
  /** What it can pay a top recruit against a typical power program (1), from its revenue-share budget. */
  wealth: number;
}

/**
 * A school's recruiting band in potential points: between its 10th and 95th percentile signee of its last
 * three classes, so programs keep recruiting at their level unless they win better or worse prospects.
 */
export function bandOf(classes: number[][] | undefined, level: "fbs" | "fcs"): [number, number] {
  const xs = (classes ?? []).flat().sort((a, b) => a - b);
  if (xs.length < 8) return level === "fbs" ? [72, 79] : [66, 75];
  const q = (f: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(f * (xs.length - 1))))];
  return [Math.round(potentialFor(q(0.1)) * 10) / 10, Math.round(potentialFor(q(0.95)) * 10) / 10];
}

/** Class position mix of real FBS signees (2025: CFBD's DL as DT, EDGE as DE, athletes split as gamePos does). */
export const CLASS_MIX: Record<Pos, number> = { QB: 0.06, RB: 0.08, WR: 0.15, TE: 0.06, OL: 0.17, DE: 0.08, DT: 0.1, LB: 0.1, CB: 0.1, S: 0.095, K: 0.01, P: 0.005, LS: 0.005 };

/**
 * How many high school signees a school wants this cycle, by position: its expected openings (seniors out
 * of eligibility, most fourth-year players, a few early NFL entries) less the share it fills from the
 * portal by its style, spread over positions by who is leaving and how thin each room is.
 */
export function classTarget(roster: { pos: Pos; years: number }[], portalShare: number, level: "fbs" | "fcs"): Partial<Record<Pos, number>> {
  const leave = (y: number) => (y >= 4 ? 1 : y >= 3 ? 0.6 : y >= 2 ? 0.05 : 0);
  const dep: Partial<Record<Pos, number>> = {}, stay: Partial<Record<Pos, number>> = {};
  let going = 0;
  for (const p of roster) { const l = leave(p.years); dep[p.pos] = (dep[p.pos] ?? 0) + l; stay[p.pos] = (stay[p.pos] ?? 0) + 1 - l; going += l; }
  const openings = Math.max(0, Math.min(40, 105 - (roster.length - going)));
  const total = level === "fbs" ? Math.round(Math.max(8, Math.min(32, 2 + openings * (1 - 0.25 * portalShare)))) : Math.round(Math.max(4, Math.min(24, openings * 0.5)));
  const w = POSITIONS.map((ps) => Math.max(0.01, (dep[ps] ?? 0) + 0.5 * Math.max(0, CLASS_MIX[ps] * 105 - (stay[ps] ?? 0))));
  const sw = w.reduce((a, b) => a + b, 0);
  // Largest remainder, so the positions add up to the class.
  const raw = w.map((x) => (x / sw) * total), base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; base[i]++; left--; }
  const out: Partial<Record<Pos, number>> = {};
  POSITIONS.forEach((ps, i) => { if (base[i] > 0) out[ps] = base[i]; });
  return out;
}

// ---- the weekly cycle ------------------------------------------------------------------------------
export interface UserRecruiting {
  /** Your staff works your board (on) or you set every hour and offer yourself (off). */
  auto: boolean;
  /** Weekly contact hours on each prospect, by prospect id (your board when auto is off). */
  hours: Record<string, number>;
  /** Prospects your scouts go to see, in order (each at most once a week). */
  scout: number[];
  /** Regions you pay a scout to cover. */
  regions: Region[];
  /** Evaluation trips made on each prospect. */
  evals: Record<string, number>;
  /** Scouting dollars spent this year. */
  spend: number;
  /** How your staff splits its week. */
  time: StaffTime;
  /** Prospects your staff has found beyond the public ones (rated by the service or committed), and for which school. */
  found?: number[];
  found_team?: number;
  /** Your big board: the prospects you're tracking, in your order. */
  board?: number[];
  /** Your commits already put on your board for you (so one you take off stays off). */
  board_added?: number[];
  /** Trips left on each prospect your scouts are assigned to (one on `scout` without a count is seen every week until taken off). */
  trips_left?: Record<string, number>;
  /** Your read of each assigned prospect when the assignment started, for the scouts' report. */
  scout_from?: Record<string, { est: number; sd: number }>;
  /** Your scouts' weekly hours on each region, and the hours put in toward each region's next report. */
  region_hours?: Partial<Record<Region, number>>;
  region_done?: Partial<Record<Region, number>>;
  /** What your scouts have reported, newest first (the last 60). */
  reports?: ScoutReport[];
  next_report?: number;
}

/** A prospect in a scouting report, as your staff read him that day. */
export interface ScoutLine {
  pid: number; name: string; pos: Pos; cls: number; city: string | null; state: string | null;
  /** Your staff's 90% range for his potential, and its best guess. */
  est: number; lo: number; hi: number;
  stars: number | null; rank: number | null;
  /** Why he's on the report (new to you, unrated, better than his stars, committed elsewhere). */
  note: string;
  /** Your staff didn't know about him before this report. */
  fresh: boolean;
  commit: number | null;
}
/** A report your scouts filed: on a region they worked (its best prospects and the ones nobody rates), or on a prospect they went to see. */
export interface ScoutReport {
  id: number; date: ISODate; kind: "region" | "player"; region?: Region; title: string; summary: string;
  /** Region reports: the best they saw, then the ones under the radar. Player reports: him. */
  lines: ScoutLine[];
  /** Player reports: your read when the assignment started, and the trips it took. */
  before?: { est: number; lo: number; hi: number }; trips?: number;
  /** Region reports: the hours behind it. */
  hours?: number;
}

export interface RecruitingState {
  prospects: Prospect[];
  next_id: number;
  /** Each school's last three signing classes (composites), oldest first. */
  classes: Record<string, number[][]>;
  /** Re-rates the service has made this year (0-3). */
  rerate: number;
  /** Each program's cycle: momentum with recruits from coaching and buzz, carried year to year (about -1 to 1). */
  cycle?: Record<string, number>;
  /**
   * How every school looks to recruits this year (record, development, money, band, class target,
   * starters), fixed on the first day of the recruiting year so a reopened league recruits the same way.
   */
  frozen?: { year: number; schools: Record<string, FrozenSchool> };
  /** 2 once the service rates freshmen, sophomores and every junior (older leagues are re-rated on open). */
  svc_v?: number;
  user: UserRecruiting;
}

/** The parts of a school that are set for the recruiting year. */
export type FrozenSchool = Pick<School, "prestige" | "win_pct" | "development" | "fit" | "band" | "target" | "starter" | "buzz" | "wealth">;

export interface RecruitEvent { kind: "commit" | "flip" | "decommit" | "signed"; pid: number; team: number; from?: number }

/** What a prospect weighs in a school, before contact and offers. */
function baseOffer(t: School, p: Prospect, read: number): SchoolOffer {
  const ovr = arrivalOvr(read) + 5;
  const st = t.starter[p.pos] ?? 70;
  return {
    team_id: t.id, prestige: t.prestige, power: t.power, win_pct: t.win_pct, miles: miles(p.home, t), home_state: p.home.state === t.state,
    money: 0, start_chance: Math.max(0.05, Math.min(0.95, 1 / (1 + Math.exp(-(ovr - st) / 4)))), development: t.development, fit: t.fit, chemistry: 0,
  };
}

/** How much he likes a school: its base score, the relationship its contact hours built, and an offer. */
const CONTACT = 0.35, OFFER_PULL = 0.45;
const contactPull = (hours: number) => CONTACT * Math.log1p(hours / 8);

/**
 * Favorites: some prospects know from the start which school or schools they want and focus on them. When
 * he's first recruited, about a third have one clear favorite and a quarter two or three, drawn from the
 * schools he'd like anyway (so mostly the home-state power or the blue blood, now and then a surprise); the
 * rest are wide open. A lone favorite pulls more than one of a few. Sizes are a judgment call (no public
 * data on early leaders); they put the leader of a typical senior's list at about a third.
 */
export const FAV_SHARE = { one: 0.35, few: 0.25 }, FAV_PULL = { one: 2.5, few: 1.5 };
/**
 * Commitments: a committed prospect's school gets a bond on top of what it has earned, set the week after he
 * commits so his school stands at a share he draws: most are locked in (88-97%), a fifth are listening
 * (70-88%) and a tenth are soft verbals (45-70%). The bond grows as the commitment ages, and other schools
 * can still work their way back in. Each week a commitment may come apart, with a chance of FLIP_RATE times
 * the other schools' combined share on his considering list, so flip threats are exactly the commits whose
 * list shows another school close: he flips to the school that drew him if it has offered, else reopens.
 * Calibrated so about 15-19% of commitments to power programs come apart in a cycle (247Sports: 18.8% of the
 * 2024 class's power-program commitments ended in a decommitment).
 */
export const BOND_FIRM: [number, number, number][] = [[0.7, 0.88, 0.97], [0.9, 0.7, 0.88], [1, 0.45, 0.7]];
export const BOND_GROW = 0.6, FLIP_RATE = 0.13;
const logit = (x: number) => Math.log(x / (1 - x));
/** The share his school starts at when he commits (drawn once per commitment). */
export function commitTarget(seed: number, p: Prospect): number {
  const c = p.commit!;
  const u = mixSeed(seed, p.id, c.team, c.date, "bond") / 4294967296, v = mixSeed(seed, p.id, c.team, c.date, "bond2") / 4294967296;
  const [, lo, hi] = BOND_FIRM.find(([q]) => u < q)!;
  return lo + (hi - lo) * v;
}
/** What a school has with him beyond its base score and his commitment: contact, an offer and being a favorite. */
export function pullFor(p: Prospect, id: number, fav: number[] | undefined): number {
  let u = contactPull(p.interest[id] ?? 0);
  if (p.offers.includes(id)) u += OFFER_PULL;
  if (fav?.includes(id)) u += fav.length === 1 ? FAV_PULL.one : FAV_PULL.few;
  return u;
}
/** What his commitment adds for his school: its bond, growing as the commitment ages. */
export const commitPull = (c: { date: ISODate }, bond: number, date: ISODate) => bond + BOND_GROW * Math.min(1, Math.max(0, daysBetween(c.date, date)) / 120);

/** Any prospect would rather play in FBS (scholarship level, exposure); the choice fit only saw FBS schools. */
const FBS_PULL = 1.2;
/**
 * Calibration to the M3 gates (docs/recruiting.md). The choice fit compared schools that already wanted a
 * prospect; in the game more schools are in his picture, so distance counts 60% as much and a
 * power program pulls a little more (real 2025: 48% of three-stars and 99% of four-stars signed with one).
 */
const DIST_SCALE = 0.45, POWER_PULL = 0.6, ELITE_PULL = 1.0;
/** How many schools work an uncommitted prospect at once: the ones he likes best. */
const TOP_K = 40, TIER_K = 12;
/** A class range topping out here or higher (about the top 15 programs) has no ceiling. */
const ELITE_BAND = 91;

/**
 * His base score for a school (offerScore, plus the FBS and power pulls, the program cycle and money). NIL
 * money matters most to the best prospects: a five-star weighs a school's budget fully, a typical three-star
 * two fifths as much.
 */
function baseScore(t: School, p: Prospect, read: number, me: { value: number; quality: number; persona: Persona }): number {
  const o = baseOffer(t, p, read);
  const money = Math.max(0, Math.min(1, (me.quality + 2) / 5)) * me.persona.money * Math.log(Math.max(0.05, t.wealth) + 0.05);
  const near = (1 - DIST_SCALE) * me.persona.home * -(RECRUIT_FIT.log_distance * Math.log1p(o.miles / 50) + RECRUIT_FIT.home_state * (o.home_state ? 1 : 0));
  // Elite prospects go where elite prospects go: a program's standing (its prestige and the talent of its
  // last three classes) pulls a four- or five-star harder than playing time pushes him away.
  const standing = Math.max(-1.5, Math.min(1.5, 0.5 * (t.prestige - 75) / 15 + 0.5 * (t.band[1] - 87) / 4));
  const elite = ELITE_PULL * Math.max(0, Math.min(1.2, me.quality / 3)) * standing;
  return offerScore(o, me) + near + (t.level === "fbs" ? FBS_PULL : 0) + (t.power ? POWER_PULL : 0) + t.buzz + money + elite;
}

/** Chance an uncommitted prospect with offers commits this week, by grade and month. */
export function commitHazard(grade: number, date: ISODate, offers: number): number {
  const m = Number(date.slice(5, 7));
  let h: number;
  if (grade >= 3) h = m === 2 || m === 3 || m === 4 ? 0.015 : m === 5 ? 0.03 : m === 6 ? 0.07 : m === 7 ? 0.06 : m === 12 ? 0.12 : m === 1 ? 0.1 : 0.05;
  else if (grade === 2) h = m === 6 ? 0.012 : 0.004;
  else h = 0.001;
  return h * (offers >= 3 ? 1.5 : 1);
}

/**
 * A week of recruiting, every Sunday. Schools spend their contact hours on their boards and offer the
 * prospects they want most that they think they can get; prospects with offers commit, a few committed ones
 * flip. Seniors, juniors the service rates and the sophomores it rates are in play; the AI recruits from the
 * service's lists (your own scouting can find others), but judges each prospect by its own scouts' read.
 */
/** The k-th largest of the first n values (quickselect; reorders them). */
function kthLargest(a: Float64Array, n: number, k: number): number {
  let lo = 0, hi = n - 1;
  const want = k - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] > pivot) i++;
      while (a[j] < pivot) j--;
      if (i <= j) { const x = a[i]; a[i] = a[j]; a[j] = x; i++; j--; }
    }
    if (want <= j) hi = j; else if (want >= i) lo = i; else return a[want];
  }
  return a[want];
}

/** The schools that would recruit a prospect (indexes into the week's school list), his base score for each, and where each sits. */
type Considered = { t: Int32Array; base: Float64Array; at: Map<number, number> };

export class RecruitWeek {
  /** Each prospect's base scores for the schools that would recruit him, kept for the year and re-rate. */
  private cache = new Map<string, Map<number, Considered>>();
  private personas = new Map<number, Persona>();
  /** Each school's fixed read parts for the prospects it works (cleared with the lists). */
  private owns = new Map<number, OwnRead>();
  constructor(private seed: number) {}

  private ownRead(s: School, p: Prospect): OwnRead {
    const key = p.id * 1e6 + s.id;
    let o = this.owns.get(key);
    if (!o) { o = { area: scoutArea(s, p), pts: errorPoints(this.seed, s.id, p.id) }; this.owns.set(key, o); }
    return o;
  }

  persona(id: number): Persona {
    let p = this.personas.get(id);
    if (!p) { p = persona(this.seed, id); this.personas.set(id, p); }
    return p;
  }

  /** The schools that would recruit him (his read inside their band) with his base score for each. */
  private considered(year: number, rerate: number, schools: School[], user: number | null, p: Prospect): Considered {
    // Everything a list depends on is fixed for the key: the year's frozen schools, the re-rate's reads, your school.
    const key = `${year}:${rerate}:${user}`;
    // Each school decides whether he's in its range by its own read as of the service's last list (a date fixed
    // by the key, so the lists don't depend on when they were first worked out).
    const ref: ISODate = rerate > 0 ? RERATE_DATES(year)[rerate - 1] : `${year}-02-15`;
    let c = this.cache.get(key);
    if (!c) { this.cache.clear(); this.owns.clear(); c = new Map(); this.cache.set(key, c); }
    const got = c.get(p.id);
    if (got) return got;
    const ts: number[] = [], bs: number[] = [];
    // What he thinks of himself (his playing time, his standing) is what the service says.
    const read = p.svc!.read, q = (p.svc!.r - 0.86) / 0.04, me = { value: 0, quality: q, persona: this.persona(p.id) };
    const pub = publicRead(p, ref, this.seed);
    const truth = truthAt(p, ref), base = readBase(yearsOut(p, ref));
    let pw = 0, pe = 0;
    for (const x of [pub.stat, pub.svc]) if (x) { pw += 1 / (x.sd * x.sd); pe += x.est / (x.sd * x.sd); }
    for (let i = 0; i < schools.length; i++) {
      const t = schools[i];
      // Schools recruit in their range by their own scouts' read; the elite programs chase anyone above it too
      // (nobody is too good for them). A school whose read can't come near its range (even six SDs off) is
      // skipped without working the read out.
      const lo = t.band[0] - 4, hi = t.band[1] < ELITE_BAND ? t.band[1] + 0.6 : Infinity;
      const sd = base * scoutArea(t, p) * t.width, w = 1 / (sd * sd);
      if ((pe + (truth + 6 * sd) * w) / (pw + w) < lo || (pe + (truth - 6 * sd) * w) / (pw + w) > hi) continue;
      const mine = schoolRead(t, p, ref, this.seed, 0, pub).est;
      if (mine < lo || mine > hi) continue;
      ts.push(i);
      bs.push(baseScore(t, p, read, me));
    }
    // Only the schools he likes best stay in his picture (and yours, so your board can always reach him).
    // His favorites by tier (power, other FBS, FCS) stay too, so the schools at his level still see him.
    if (ts.length > TOP_K) {
      const cut = kthLargest(Float64Array.from(bs), bs.length, TOP_K);
      const tier = (t: number) => (schools[t].level !== "fbs" ? 2 : schools[t].power ? 0 : 1);
      const tierCut = [0, 1, 2].map((g) => { const xs = bs.filter((_, k) => tier(ts[k]) === g); return xs.length > TIER_K ? kthLargest(Float64Array.from(xs), xs.length, TIER_K) : -Infinity; });
      const keep = ts.map((t, k) => bs[k] >= cut || bs[k] >= tierCut[tier(t)] || schools[t].id === user);
      for (let k = ts.length - 1; k >= 0; k--) if (!keep[k]) { ts.splice(k, 1); bs.splice(k, 1); }
    }
    const list: Considered = { t: Int32Array.from(ts), base: Float64Array.from(bs), at: new Map(ts.map((t, k) => [t, k])) };
    c.set(p.id, list);
    return list;
  }

  /** His list with the school he's committed to on it (added at the end when his list leaves it out). */
  private withCommit(list: Considered, p: Prospect, schools: School[], idx: Map<number, number>): Considered {
    const t = p.commit && !p.commit.signed ? idx.get(p.commit.team) : undefined;
    if (t == null || list.at.has(t)) return list;
    const n = list.t.length, ts = new Int32Array(n + 1), bs = new Float64Array(n + 1);
    ts.set(list.t); ts[n] = t;
    bs.set(list.base); bs[n] = baseScore(schools[t], p, p.svc!.read, { value: 0, quality: (p.svc!.r - 0.86) / 0.04, persona: this.persona(p.id) });
    return { t: ts, base: bs, at: new Map(list.at).set(t, n) };
  }

  /**
   * His favorites (FAV_SHARE): the number from a draw of his own, the schools by his liking for each plus a
   * draw (so the schools he likes most are the likeliest). A committed prospect's school is among them.
   */
  private favorites(p: Prospect, list: Considered, schools: School[]): number[] {
    if (p.fav) return p.fav;
    const u0 = mixSeed(this.seed, p.id, "fav") / 4294967296;
    const n = u0 < FAV_SHARE.one ? 1 : u0 < FAV_SHARE.one + FAV_SHARE.few / 2 ? 2 : u0 < FAV_SHARE.one + FAV_SHARE.few ? 3 : 0;
    if (!n) return [];
    const g = Array.from(list.t, (t, k) => ({ id: schools[t].id, v: list.base[k] - Math.log(-Math.log((mixSeed(this.seed, p.id, schools[t].id, "fav") + 0.5) / 4294967296)) }))
      .sort((a, b) => b.v - a.v || a.id - b.id).map((x) => x.id);
    const mine = p.commit && !p.commit.signed ? p.commit.team : null;
    return (mine != null ? [mine, ...g.filter((id) => id !== mine)] : g).slice(0, n);
  }

  /**
   * How much he likes each school on his list: base score, contact, offer, favorites and his commitment's
   * bond. The first time he's worked (store), his favorites and a new commitment's bond are kept on him;
   * before then they're worked out the same way for the view.
   */
  private utilities(p: Prospect, list: Considered, schools: School[], idx: Map<number, number>, date: ISODate, store: boolean): Float64Array {
    const fav = this.favorites(p, list, schools);
    if (store) p.fav ??= fav;
    const u = list.base.slice();
    for (let k = 0; k < u.length; k++) u[k] += pullFor(p, schools[list.t[k]].id, fav);
    const c = p.commit;
    const own = c && !c.signed ? list.at.get(idx.get(c.team) ?? -1) : undefined;
    if (c && own != null) {
      let bond = c.bond;
      if (bond == null) {
        // Set so his school stands at his drawn share against the rest of his list.
        let z = 0;
        for (let k = 0; k < u.length; k++) if (k !== own) z += Math.exp(u[k] - u[own]);
        bond = Math.round(Math.max(0.5, logit(commitTarget(this.seed, p)) + Math.log(z || 1e-9)) * 1000) / 1000;
        if (store) c.bond = bond;
      }
      u[own] += commitPull(c, bond, date);
    }
    return u;
  }

  /**
   * The schools a prospect is considering, best first: his chance of picking each if he chose among them today
   * (base appeal, relationship and offer, as in the weekly decisions). Empty while he is too young to be in play.
   */
  considering(st: RecruitingState, year: number, schools: School[], user: number | null, p: Prospect, date: ISODate): { team: number; share: number; offered: boolean; hours: number }[] {
    const g = gradeOf(p, year);
    if (!p.svc || g < 1 || p.commit?.signed) return [];
    const idx = new Map(schools.map((t, i) => [t.id, i]));
    const list = this.withCommit(this.considered(year, st.rerate, schools, user, p), p, schools, idx);
    const u = Array.from(this.utilities(p, list, schools, idx, date, false));
    const m = Math.max(...u);
    const e = u.map((x) => Math.exp(x - m)), z = e.reduce((a, x) => a + x, 0);
    return Array.from(list.t, (t, k) => ({ team: schools[t].id, share: e[k] / z, offered: p.offers.includes(schools[t].id), hours: Math.round(p.interest[schools[t].id] ?? 0) }))
      .sort((a, b) => b.share - a.share || a.team - b.team);
  }

  run(o: { st: RecruitingState; year: number; date: ISODate; schools: School[]; user: number | null; rng: Rng }): RecruitEvent[] {
    const { st, year, date, schools, rng } = o;
    const idx = new Map(schools.map((t, i) => [t.id, i]));
    const events: RecruitEvent[] = [];
    // Commitments so far this cycle (seniors) by school and position.
    const have = schools.map(() => ({} as Partial<Record<Pos, number>>));
    const haveJr = schools.map(() => ({} as Partial<Record<Pos, number>>));
    for (const p of st.prospects) {
      if (!p.commit) continue;
      const i = idx.get(p.commit.team);
      if (i == null) continue;
      const g = gradeOf(p, year);
      const h = g >= 3 ? have[i] : haveJr[i];
      h[p.pos] = (h[p.pos] ?? 0) + 1;
    }
    const room = (i: number, pos: Pos, g: number) => ((schools[i].target[pos] ?? 0) - ((g >= 3 ? have : haveJr)[i][pos] ?? 0));
    // 1. Who is in play, and how much he likes each school that would recruit him.
    type Cand = { p: Prospect; g: number; list: Considered; u: Float64Array; z: number; lz: number; m: number; pub: PublicRead };
    const cands: Cand[] = [];
    for (const p of st.prospects) {
      const g = gradeOf(p, year);
      if (p.commit?.signed || !p.svc || g < 1) continue;
      if (!inPlay(p, g) && !(o.user != null && (p.offers.includes(o.user) || p.interest[o.user]))) continue;
      const list = this.withCommit(this.considered(year, st.rerate, schools, o.user, p), p, schools, idx);
      const u = this.utilities(p, list, schools, idx, date, true);
      let m = -Infinity;
      for (let k = 0; k < u.length; k++) if (u[k] > m) m = u[k];
      let z = 0;
      for (let k = 0; k < u.length; k++) { u[k] -= m; z += Math.exp(u[k]); }
      cands.push({ p, g, list, u, z, lz: Math.log(z), m, pub: publicRead(p, date, this.seed) });
    }
    // 2. Each school works its board: priority = what he'd be worth x need x its chance with him. A prospect
    // committed elsewhere is only worked by the few schools he likes best (they try to flip him).
    type Entry = { c: Cand; k: number; pr: number };
    const own: Entry[][] = schools.map(() => []), unc: Entry[][] = schools.map(() => []), com: Entry[][] = schools.map(() => []);
    const ks: number[] = [];
    let buf = new Float64Array(Math.max(1024, schools.length));
    for (const c of cands) {
      const p = c.p, mine = p.commit ? idx.get(p.commit.team) : undefined;
      ks.length = 0;
      if (p.commit) {
        // His own school and the three others he likes best.
        let a = -1, b = -1, d = -1;
        for (let k = 0; k < c.u.length; k++) {
          const t = c.list.t[k];
          if (t === mine) { ks.push(k); continue; }
          const v = c.u[k];
          if (a < 0 || v > c.u[a]) { d = b; b = a; a = k; } else if (b < 0 || v > c.u[b]) { d = b; b = k; } else if (d < 0 || v > c.u[d]) d = k;
        }
        for (const k of [a, b, d]) if (k >= 0) ks.push(k);
      } else if (c.u.length <= TOP_K) for (let k = 0; k < c.u.length; k++) ks.push(k);
      else {
        // Only the schools he likes best work him (the rest would have next to no chance anyway).
        buf.set(c.u);
        const cut = kthLargest(buf, c.u.length, TOP_K);
        for (let k = 0; k < c.u.length && ks.length < TOP_K; k++) if (c.u[k] >= cut) ks.push(k);
      }
      for (const k of ks) {
        const t = c.list.t[k], s = schools[t];
        if (s.manual) continue;
        if (mine === t) { own[t].push({ c, k, pr: Infinity }); continue; }
        const open = room(t, p.pos, c.g);
        if (open <= 0) continue;
        // What he is worth to the school, times its chance of landing him (schools offer where they can win).
        const share = Math.exp(0.8 * (c.u[k] - c.lz));
        // Each school values him by its own scouts' read (the more time it has put in, the closer to the truth),
        // and some by his stars: a class's ranking sells.
        const read = schoolRead(s, p, date, this.seed, looksOf(p, s.id, s.id === o.user ? st.user.evals[p.id] ?? 0 : 0), c.pub, this.ownRead(s, p)).est;
        const worth = Math.exp((OWN_WEIGHT * read + (1 - OWN_WEIGHT) * p.svc!.read - s.band[1]) / 3);
        const need = Math.min(2, 0.6 + 0.4 * open);
        (p.commit ? com : unc)[t].push({ c, k, pr: worth * need * share * (c.g >= 3 ? 1 : c.g === 2 ? 0.45 : 0.2) });
      }
    }
    // The best n entries by priority (ties by prospect id), without sorting the whole list.
    const top = (xs: Entry[], n: number): Entry[] => {
      if (n <= 0) return [];
      let pick = xs;
      if (xs.length > n) {
        if (buf.length < xs.length) buf = new Float64Array(xs.length * 2);
        for (let i = 0; i < xs.length; i++) buf[i] = xs[i].pr;
        const cut = kthLargest(buf, xs.length, n);
        pick = xs.filter((x) => x.pr >= cut);
      }
      return pick.sort((x, y) => y.pr - x.pr || x.c.p.id - y.c.p.id).slice(0, n);
    };
    for (let t = 0; t < schools.length; t++) {
      const s = schools[t];
      if (s.manual) continue;
      const slots = Object.values(s.target).reduce((a, x) => a + (x ?? 0), 0);
      // The board: everyone committed here, about four uncommitted targets per open spot, and a few flip
      // targets (prospects committed elsewhere don't crowd out the ones still deciding).
      const mine = own[t].length, openSpots = Math.max(0, slots - mine);
      const work = [...own[t].sort((x, y) => x.c.p.id - y.c.p.id), ...top(unc[t], Math.round(4 * openSpots + 8)), ...top(com[t], Math.ceil(openSpots / 2))];
      // Committed players get an hour a week of upkeep; the rest of the hours go by priority (the square root,
      // so the board isn't all spent on the top few).
      const upkeep = work.filter((x) => x.pr === Infinity).length;
      const free = Math.max(0, s.hours - upkeep) * s.eff;
      const wsum = work.reduce((a, x) => a + (x.pr === Infinity ? 0 : Math.sqrt(x.pr)), 0) || 1;
      // Offers out to prospects still deciding, by class (seniors, younger) and position.
      const offered = [{} as Partial<Record<Pos, number>>, {} as Partial<Record<Pos, number>>];
      for (const x of work) {
        const p = x.c.p;
        const h = x.pr === Infinity ? Math.min(1, s.hours) * s.eff : free * Math.sqrt(x.pr) / wsum;
        p.interest[s.id] = Math.round(((p.interest[s.id] ?? 0) + h) * 100) / 100;
        if (!p.commit && p.offers.includes(s.id)) { const o = offered[x.c.g >= 3 ? 0 : 1]; o[p.pos] = (o[p.pos] ?? 0) + 1; }
      }
      // Offers: up to about two and a half per open spot at a position (seniors), fewer for younger classes.
      for (const x of work) {
        const p = x.c.p;
        if (p.offers.includes(s.id)) continue;
        const open = room(t, p.pos, x.c.g);
        // Offers are cheap and plentiful: about five per open spot for seniors, four per spot for the classes behind.
        const cap = x.c.g >= 3 ? Math.ceil(5 * Math.max(0, open)) : Math.ceil(4 * (s.target[p.pos] ?? 0));
        const o = offered[x.c.g >= 3 ? 0 : 1];
        if ((o[p.pos] ?? 0) >= cap) continue;
        p.offers.push(s.id);
        o[p.pos] = (o[p.pos] ?? 0) + 1;
      }
    }
    // 3. Prospects decide: commit, hold, or flip.
    for (const c of cands) {
      const p = c.p;
      // His options: schools with offers (with their score, or the base score if outside his list).
      const opts: { t: number; u: number }[] = [];
      for (const id of p.offers) {
        const t = idx.get(id);
        if (t == null) continue;
        const k = c.list.at.get(t);
        // On his list his utility is there already (relative to his favorite); otherwise from the base score.
        opts.push({ t, u: k != null ? c.u[k] + c.m : baseScore(schools[t], p, p.svc!.read, { value: 0, quality: (p.svc!.r - 0.86) / 0.04, persona: this.persona(p.id) }) + pullFor(p, id, p.fav) });
      }
      if (!opts.length) continue;
      if (!p.commit) {
        // He waits while a school he likes better than any offer is still recruiting him (less so near signing day).
        // c.u is relative to his favorite school (c.m), so the gap is his favorite minus his best offer.
        let best = -Infinity;
        for (const x of opts) if (x.u > best) best = x.u;
        const gap = Math.max(0, c.m - best);
        const mo = Number(date.slice(5, 7));
        const wait = Math.exp(-(mo === 12 || mo === 1 ? 0.3 : 0.8) * gap);
        if (rng.random() >= commitHazard(c.g, date, opts.length) * wait) continue;
        const pick = opts[choose(opts.map((x) => x.u), rng.random())];
        if (room(pick.t, p.pos, c.g) <= 0 && !schools[pick.t].manual) {
          // No room left: the school pulls the offer.
          p.offers = p.offers.filter((x) => x !== schools[pick.t].id);
          continue;
        }
        p.commit = { team: schools[pick.t].id, signed: false, date };
        ((c.g >= 3 ? have : haveJr)[pick.t])[p.pos] = (((c.g >= 3 ? have : haveJr)[pick.t])[p.pos] ?? 0) + 1;
        events.push({ kind: "commit", pid: p.id, team: schools[pick.t].id });
        continue;
      }
      // A verbal can come apart: a chance each week of FLIP_RATE times the share the other schools hold on his
      // list. He goes to one of them by their shares: one that has offered him (with room) gets him, otherwise
      // he reopens his recruitment.
      const cur = idx.get(p.commit.team);
      const own = cur != null ? c.list.at.get(cur) : undefined;
      if (own == null) continue;
      if (rng.random() >= FLIP_RATE * (1 - Math.exp(c.u[own]) / c.z)) continue;
      const ks: number[] = [], us: number[] = [];
      for (let k = 0; k < c.u.length; k++) if (k !== own) { ks.push(k); us.push(c.u[k]); }
      if (!ks.length) continue;
      const to = c.list.t[ks[choose(us, rng.random())]];
      const from = p.commit.team;
      const h = (c.g >= 3 ? have : haveJr)[cur!];
      h[p.pos] = (h[p.pos] ?? 1) - 1;
      if (!p.offers.includes(schools[to].id) || (room(to, p.pos, c.g) <= 0 && !schools[to].manual)) {
        p.commit = null;
        events.push({ kind: "decommit", pid: p.id, team: from });
        continue;
      }
      p.commit = { team: schools[to].id, signed: false, date };
      ((c.g >= 3 ? have : haveJr)[to])[p.pos] = (((c.g >= 3 ? have : haveJr)[to])[p.pos] ?? 0) + 1;
      events.push({ kind: "flip", pid: p.id, team: schools[to].id, from });
    }
    // Relationships fade a little each week.
    for (const p of st.prospects) {
      if (p.commit?.signed) continue;
      for (const k of Object.keys(p.interest)) {
        const v = Math.round(p.interest[k] * 0.97 * 100) / 100;
        if (v < 0.5 && !p.offers.includes(Number(k)) && p.commit?.team !== Number(k)) delete p.interest[k];
        else p.interest[k] = v;
      }
    }
    return events;
  }
}

/** The early signing period: most committed seniors sign. */
export function earlySigning(st: RecruitingState, year: number, rng: Rng): RecruitEvent[] {
  const out: RecruitEvent[] = [];
  for (const p of st.prospects) {
    if (gradeOf(p, year) !== 3 || !p.commit || p.commit.signed) continue;
    if (rng.random() < 0.88) { p.commit.signed = true; out.push({ kind: "signed", pid: p.id, team: p.commit.team }); }
  }
  return out;
}

/**
 * Signing day: every committed senior signs; the rest take the best offer they have, after schools with
 * open spots make late offers to the best prospects left in their range. Anyone without an offer goes
 * unsigned (junior college, walk-on tryouts, or done with football).
 */
export function signingDay(st: RecruitingState, year: number, schools: School[], wk: RecruitWeek, date: ISODate, rng: Rng): RecruitEvent[] {
  const out: RecruitEvent[] = [];
  const idx = new Map(schools.map((t, i) => [t.id, i]));
  const have = schools.map(() => ({} as Partial<Record<Pos, number>>));
  const seniors = st.prospects.filter((p) => gradeOf(p, year) === 3);
  for (const p of seniors) {
    if (!p.commit) continue;
    const i = idx.get(p.commit.team);
    if (i != null) have[i][p.pos] = (have[i][p.pos] ?? 0) + 1;
    if (!p.commit.signed) { p.commit.signed = true; out.push({ kind: "signed", pid: p.id, team: p.commit.team }); }
  }
  const open = (i: number, pos: Pos) => (schools[i].target[pos] ?? 0) - (have[i][pos] ?? 0);
  const left = seniors.filter((p) => !p.commit && p.svc).sort((a, b) => b.svc!.read - a.svc!.read || a.id - b.id);
  for (let round = 0; round < 6; round++) {
    // Late offers: schools with room offer the best left in their range (two per open spot), reaching a
    // little lower each round.
    for (let i = 0; i < schools.length; i++) {
      const s = schools[i];
      if (s.manual) continue;
      for (const pos of POSITIONS) {
        let n = 2 * open(i, pos);
        if (n <= 0) continue;
        for (const p of left) {
          if (n <= 0) break;
          if (p.commit || p.pos !== pos || p.offers.includes(s.id)) continue;
          if (p.svc!.read < s.band[0] - 3 - round || p.svc!.read > s.band[1] + 2) continue;
          p.offers.push(s.id);
          n--;
        }
      }
    }
    for (const p of left) {
      if (p.commit) continue;
      const opts = p.offers.map((id) => idx.get(id)).filter((i): i is number => i != null && (open(i, p.pos) > 0 || schools[i].manual));
      if (!opts.length) continue;
      const me = { value: 0, quality: (p.svc!.r - 0.86) / 0.04, persona: wk.persona(p.id) };
      const u = opts.map((i) => baseScore(schools[i], p, p.svc!.read, me) + pullFor(p, schools[i].id, p.fav));
      const i = opts[choose(u, rng.random())];
      p.commit = { team: schools[i].id, signed: true, date };
      have[i][p.pos] = (have[i][p.pos] ?? 0) + 1;
      out.push({ kind: "signed", pid: p.id, team: schools[i].id });
    }
  }
  return out;
}

/** A signee as a college freshman: rated from where he arrives (his true potential) and his own form. */
export function enrollPlayer(p: Prospect, id: number, teamId: number, seed: number): RatedPlayer {
  const rng = new Rng(mixSeed(seed, p.id, "enroll"));
  const pot = p.path[4];
  const zz = z(arrivalOvr(pot) + 0.5 * p.form);
  const attrs: Record<string, number> = {};
  for (const k of ATTRS[p.pos]) attrs[k] = fromZ(zz + 0.47 * rng.gauss(0, 1));
  if (p.pos === "OL") attrs.discipline = fromZ(zz - 0.2 + 0.4 * rng.gauss(0, 1));
  return {
    id, team_id: teamId, first: p.first, last: p.last, pos: p.pos, listed: p.pos, class: "FR", years: 0,
    jersey: null, height: p.ht, weight: p.wt, home: { city: p.home.city, state: p.home.state, lat: p.home.lat, lon: p.home.lon },
    stars: p.svc ? starsOf(p.svc.r) : null, composite: p.svc?.r ?? null, natl_rank: p.svc?.rank ?? null, attrs,
    traits: {
      stamina: fromZ(rng.gauss(p.pos === "DT" ? -0.5 : p.pos === "QB" || p.pos === "OL" ? 0.3 : 0, 0.8)),
      injury: Math.round(Math.max(1, Math.min(99, 50 + 15 * rng.gauss(0, 1)))),
      toughness: fromZ(rng.gauss(0, 0.8)),
      discipline: p.pos === "OL" ? attrs.discipline : fromZ(rng.gauss(0, 0.8)),
    },
    hidden: { potential: Math.round(pot), work_ethic: fromZ(rng.gauss(0, 1)) },
    tend: p.pos === "QB" ? { scramble: Math.round(Math.max(0.03, Math.min(0.25, 0.08 + 0.03 * rng.gauss(0, 1))) * 1000) / 1000 } : {},
    ovr: overall(p.pos, attrs), basis: "prior", sample: 0,
  };
}

/** Class points, for class rankings: the best signees count most (in the spirit of the services' formulas). */
export function classPoints(composites: number[]): number {
  const xs = [...composites].sort((a, b) => b - a);
  let s = 0;
  xs.forEach((c, i) => { s += Math.max(0, c * 100 - 70) * Math.pow(0.93, i); });
  return Math.round(s * 10) / 10;
}

export const STARTER_SLOTS = STARTERS;
export { addDays };
