import { Rng } from "@cfb/engine";
import { mixSeed } from "./hash.ts";
import { addDays, type ISODate } from "./dates.ts";
import { hashGauss } from "./recruiting.ts";
import { reputation } from "./career.ts";
import { coachSkills, SKILLS, type Skill, type StaffMember } from "./staff.ts";
import { FRONT_SHARE, OFFENSE_SHARE, type DefScheme, type OffScheme, type TeamSchemes } from "./schemes.ts";
import type { Coach, Team } from "./types.ts";

/**
 * The coaching carousel (M4). Every coach in the league is a record that moves between jobs: head coaches
 * and the three coordinators at every FBS school, head coaches at FCS schools, and the coaches out of work.
 *
 * Each coach has true skills (staff.ts) nobody sees and a reputation everyone does. Results move the
 * reputation: a head coach's wins against what his roster was expected to win, a coordinator's unit
 * against what the roster was expected to give. Schools hire on reputation, so a coach whose skills run
 * ahead of his name is a bargain and one whose name runs ahead of his skills eventually gets found out.
 *
 * Once a year, the day after the last full Saturday of the regular season, athletic directors let coaches
 * go (a logistic fit to every FBS head coach from 2006 to 2024, CFBD), coaches retire, and new coaches
 * enter the pool. Then each opening is filled on its own date over the next weeks, best jobs first, by the
 * best candidate willing to take it:
 *   - sitting head coaches move only for a clearly better job (successful Group of Five coaches are first in
 *     line for power jobs);
 *   - coordinators at power programs are in line for head jobs a level down, and for coordinator jobs at
 *     better schools;
 *   - coaches who were let go take what they can get: a head job a level down, a coordinator job, or a job
 *     at a smaller school; some never coach again;
 *   - a new head coach keeps a coordinator now and then and brings the rest of his staff.
 * Every move opens another job, so the carousel cascades. Openings still empty when it closes in January
 * are filled from whoever is left (newcomers if need be).
 *
 * Your school's staff is yours to hire: other schools can hire your coordinators away, but nobody fills
 * your openings for you. You are a coach in the pool like everyone else: schools offer you jobs when you
 * are the best candidate for them, and your athletic director can let you go.
 */

export type Role = Coach["role"];
export type Side = "off" | "def";
export const ROLE_NAMES: Record<Role, string> = { HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator", STC: "Special teams coordinator" };
export const STAFF_ROLES: Role[] = ["OC", "DC", "STC"];

/** One season in a coach's league career (regular season and conference title game). */
export interface CoachSeason { year: number; team_id: number; role: Role; w: number; l: number; /** Coordinators: his unit against what the roster was expected to give, in SDs. */ unit?: number }

export interface CoachRec {
  id: number; first: string; last: string; age: number;
  /** Where he works (null: out of work). */
  team_id: number | null; role: Role | null;
  /** The side of the ball he came up on, and his systems. */
  side: Side; off: OffScheme; def: DefScheme;
  /** True skills, 25 to 95 (staff.ts). */
  skills: Record<Skill, number>;
  /** What the profession thinks of him, 0 to 100. */
  rep: number;
  /** First season at his current job; salary a year and the last season of his contract. */
  since: number; salary: number; through: number;
  /** His head-coaching record before the league started (real coaches). */
  prior?: { w: number; l: number; years: number };
  seasons: CoachSeason[];
  /** Out of work: the school that let him go (or that he left) and the offseason it happened. */
  left?: { team_id: number; year: number; why: Why };
  /** Hired in this offseason's carousel (he doesn't move again until next year). */
  moved?: number;
  /** Newcomers: the offseason he entered the profession. */
  entered?: number;
  /** Retired or out of coaching. */
  gone?: boolean;
  /** You. */
  user?: boolean;
  source: "real" | "researched" | "generated" | "pool" | "new" | "you";
}

export type Why = "fired" | "retired" | "not_retained" | "left" | "resigned";

export interface Opening { team_id: number; role: Role; opened: ISODate; ready: ISODate; why: Why | "hired_away"; prev: number | null; /** You turned it down, or it's waiting on your answer. */ declined?: boolean; offered?: boolean }

export interface JobOffer { team_id: number; date: ISODate; expires: ISODate; salary: number; years: number; status: "open" | "accepted" | "declined" | "expired" }

export interface CoachMove {
  date: ISODate; coach: number; name: string;
  kind: "fired" | "retired" | "not_retained" | "hired" | "resigned" | "left_coaching";
  team_id: number | null; role: Role | null;
  /** Hires: where he came from. */
  from?: { team_id: number | null; role: Role | null };
  note?: string;
}

export interface CoachingState {
  coaches: CoachRec[];
  next_id: number;
  /** This offseason's openings and your job offers; the carousel is open from its first day until the market closes. */
  open: boolean;
  year: number;
  openings: Opening[];
  offers: JobOffer[];
  /** Every move this league has seen, oldest first. */
  moves: CoachMove[];
}

/** What a school's job is worth to a coach: its standing, a power program's money and exposure. */
export interface Job { team_id: number; school: string; appeal: number; level: "p4" | "g5" | "fcs"; prestige: number }

export function jobOf(t: Team, power: boolean): Job {
  const level = t.level === "fcs" ? "fcs" : power ? "p4" : "g5";
  return { team_id: t.id, school: t.school, prestige: t.prestige ?? 40, level, appeal: Math.round(((t.prestige ?? 40) + (level === "p4" ? 15 : level === "fcs" ? -15 : 0)) * 10) / 10 };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const round10k = (x: number) => Math.round(x / 10_000) * 10_000;
const skillAvg = (s: Record<Skill, number>) => (Object.keys(SKILLS) as Skill[]).reduce((a, k) => a + s[k], 0) / Object.keys(SKILLS).length;
export const coachName = (c: Pick<CoachRec, "first" | "last">) => `${c.first} ${c.last}`.trim();

/**
 * Salary a year (estimates from public 2025 salary databases: power head coaches about $3M to $12M, Group of
 * Five $0.6M to $2.5M, power coordinators $0.8M to $2.5M, FCS head coaches about $250,000), by the job and
 * the coach's name.
 */
export function salaryFor(role: Role, job: Job, rep: number): number {
  const p = clamp((job.prestige - 20) / 70, 0, 1), name = 0.75 + 0.5 * rep / 100;
  let base: number;
  if (job.level === "fcs") base = role === "HC" ? 250_000 : 90_000;
  else if (job.level === "p4") base = role === "HC" ? 3_000_000 + 8_000_000 * p : role === "STC" ? 350_000 + 650_000 * p : 700_000 + 1_600_000 * p;
  else base = role === "HC" ? 600_000 + 1_600_000 * p : role === "STC" ? 120_000 + 180_000 * p : 230_000 + 420_000 * p;
  return round10k(base * name);
}

/** How long a school signs a new hire for. */
export const contractYears = (role: Role) => (role === "HC" ? 5 : role === "STC" ? 2 : 3);
/** What a school owes a coach it lets go: most of what's left on his deal. */
export const buyout = (c: CoachRec, year: number) => round10k(0.7 * c.salary * Math.max(0, c.through - year));

/** A head coach's chance of being let go after a season (fired, pushed out, retired or left for the NFL). */
export function letGoChance(x: { wp: number; exp: number; prev: number; tenure: number; power: boolean }): number {
  // Logistic fit to every FBS head coach who didn't leave for another FBS head job, 2006-2024 (CFBD, 1,788 coach-seasons):
  // win pct, win pct against expectations, last season's win pct, years in the job, the first two years and power programs.
  return sigmoid(-1.882 - 4.053 * (x.wp - 0.5) - 0.829 * (x.wp - x.exp) - 0.581 * (x.prev - 0.5) + 0.052 * Math.min(10, x.tenure) - 1.424 * (x.tenure <= 2 ? 1 : 0) + 0.363 * (x.power ? 1 : 0));
}

/** A coordinator's chance of being let go by a head coach who stays (estimate: about one in eleven, more after a bad year). */
export const coordLetGo = (unit: number, wp: number, exp: number) => sigmoid(-2.6 - 0.9 * unit - 1.5 * (wp - exp));

/** A coach's chance of retiring this offseason. */
export const retireChance = (age: number) => (age < 62 ? 0 : clamp(0.06 + 0.04 * (age - 62), 0, 0.9));

/** How a team's season went: regular-season record, the win pct its preseason power promised, last year's and its units. */
export interface TeamYear { w: number; l: number; exp: number; prev: number | null; off: number; def: number }

// ---- the league's coaches at the start -------------------------------------------------------------

const drawShare = <T,>(share: [T, number][], u: number): T => {
  let acc = 0;
  for (const [k, w] of share) { acc += w; if (u < acc) return k; }
  return share[share.length - 1][0];
};

export interface StartInput {
  seed: number; year: number; teams: Team[]; jobs: Map<number, Job>; coaches: Coach[];
  /** Former FBS head coaches out of work when the league starts. */
  pool: { first: string; last: string; career: Coach["career"] }[];
  schemes: Record<number, TeamSchemes>;
}

/** Every coach in the league when it starts: the seed's staffs (with the skills staff.ts always gave them) and the former head coaches out of work. */
export function startCoaching(x: StartInput): CoachingState {
  const { seed, year } = x;
  const coaches: CoachRec[] = [];
  let id = 1;
  for (const c of x.coaches) {
    const t = x.teams.find((tt) => tt.id === c.team_id);
    const job = x.jobs.get(c.team_id);
    if (!t || !job) continue;
    const rng = new Rng(mixSeed(seed, "coach-start", c.team_id, c.role, c.first, c.last));
    const skills = coachSkills(seed, c, t);
    const w = c.career.reduce((a, s) => a + s.wins, 0), l = c.career.reduce((a, s) => a + s.losses, 0);
    const first = c.career.length ? Math.min(...c.career.map((s) => s.year)) : null;
    const side: Side = c.role === "OC" ? "off" : c.role === "DC" ? "def" : rng.random() < 0.5 ? "off" : "def";
    const sc = x.schemes[c.team_id];
    const rep = c.role === "HC"
      ? (t.level === "fcs" ? clamp(30 + 0.3 * (skillAvg(skills) - 50) + 6 * rng.gauss(0, 1), 15, 60) : reputation(c))
      : clamp(38 + 0.3 * (job.prestige - 50) + 0.35 * (skillAvg(skills) - 50) + 6 * rng.gauss(0, 1), 15, 85);
    const age = Math.round(first != null ? clamp(39 + (year - first) + 3 * rng.gauss(0, 1), 33, 74) : c.role === "HC" ? clamp(46 + 7 * rng.gauss(0, 1), 33, 68) : clamp(36 + 18 * rng.random(), 29, 66));
    const hired = c.hire_date ? Number(c.hire_date.slice(0, 4)) + (Number(c.hire_date.slice(5, 7)) >= 7 ? 1 : 0) : year - rng.int(4);
    const since = Math.min(year, hired);
    coaches.push({
      id: id++, first: c.first, last: c.last, age, team_id: c.team_id, role: c.role, side,
      off: c.role === "OC" && sc ? sc.off : drawShare(OFFENSE_SHARE, rng.random()), def: c.role === "DC" && sc ? sc.def : drawShare(FRONT_SHARE, rng.random()),
      skills, rep: Math.round(rep), since, salary: salaryFor(c.role, job, rep), through: Math.max(year, since + contractYears(c.role) - 1),
      ...(w + l ? { prior: { w, l, years: c.career.length } } : {}), seasons: [],
      source: c.source === "cfbd" ? "real" : c.source === "researched" ? "researched" : "generated",
    });
  }
  // Former head coaches still young enough to coach.
  for (const p of x.pool) {
    if (!p.career.length) continue;
    const first = Math.min(...p.career.map((s) => s.year)), lastYear = Math.max(...p.career.map((s) => s.year));
    const rng = new Rng(mixSeed(seed, "coach-pool", p.first, p.last));
    const age = Math.round(clamp(39 + (year - first) + 3 * rng.gauss(0, 1), 33, 80));
    if (age >= 68) continue;
    const lastTeam = p.career.find((s) => s.year === lastYear)!;
    const t = x.teams.find((tt) => tt.id === lastTeam.team_id) ?? x.teams.find((tt) => tt.school === lastTeam.school);
    const c: Coach = { team_id: t?.id ?? 0, role: "HC", first: p.first, last: p.last, hire_date: null, career: p.career, source: "cfbd" };
    const skills = coachSkills(seed, c, t ?? { prestige: 40 });
    const w = p.career.reduce((a, s) => a + s.wins, 0), l = p.career.reduce((a, s) => a + s.losses, 0);
    const side: Side = rng.random() < 0.5 ? "off" : "def";
    coaches.push({
      id: id++, first: p.first, last: p.last, age, team_id: null, role: null, side, off: drawShare(OFFENSE_SHARE, rng.random()), def: drawShare(FRONT_SHARE, rng.random()),
      skills, rep: Math.round(clamp(reputation(c) - 5 * Math.max(0, year - 1 - lastYear), 15, 90)), since: lastYear, salary: 0, through: lastYear,
      prior: { w, l, years: p.career.length }, seasons: [], left: { team_id: t?.id ?? 0, year: lastYear, why: "fired" }, source: "pool",
    });
  }
  return { coaches, next_id: id, open: false, year: year - 1, openings: [], offers: [], moves: [] };
}

/** A school's staff (head coach first). */
export function staffRecs(st: CoachingState, teamId: number): CoachRec[] {
  const order: Role[] = ["HC", "OC", "DC", "STC"];
  return st.coaches.filter((c) => c.team_id === teamId && c.role).sort((a, b) => order.indexOf(a.role!) - order.indexOf(b.role!));
}

export const toMember = (c: CoachRec): StaffMember => ({ role: c.role!, first: c.first, last: c.last, skills: c.skills });

/** What a school pays its head coach and coordinators a year. */
export function staffPay(st: CoachingState, teamId: number): number {
  return st.coaches.reduce((a, c) => a + (c.team_id === teamId && c.role ? c.salary : 0), 0);
}

/** A new coach entering the profession: a position coach, an NFL assistant or an analyst getting his first coordinator shot. */
export function newCoach(st: CoachingState, rng: Rng, names: { firsts: string[]; lasts: string[] }): CoachRec {
  const side: Side = rng.random() < 0.5 ? "off" : "def";
  const lean = side === "off" ? { scheme: 2, game_planning: 2 } : { scheme: 2, game_planning: 2 };
  const skills = {} as Record<Skill, number>;
  // Raw talent: mostly a little below the average coordinator, now and then a gem.
  const talent = 6 * rng.gauss(0, 1);
  for (const k of Object.keys(SKILLS) as Skill[]) skills[k] = Math.round(clamp(47 + talent + ((lean as Partial<Record<Skill, number>>)[k] ?? 0) + 9 * rng.gauss(0, 1), 25, 92));
  const c: CoachRec = {
    id: st.next_id++, first: names.firsts[rng.int(names.firsts.length)] ?? "Pat", last: names.lasts[rng.int(names.lasts.length)] ?? "Smith",
    age: Math.round(29 + 11 * rng.random()), team_id: null, role: null, side, off: drawShare(OFFENSE_SHARE, rng.random()), def: drawShare(FRONT_SHARE, rng.random()),
    skills, rep: Math.round(clamp(33 + 0.25 * (skillAvg(skills) - 47) + 5 * rng.gauss(0, 1), 18, 55)), since: 0, salary: 0, through: 0, seasons: [], source: "new",
  };
  st.coaches.push(c);
  return c;
}

// ---- results move reputations ---------------------------------------------------------------------

/** What a season says about a coach (the reputation it points to). */
export function seasonScore(c: CoachRec, job: Job, ty: TeamYear): number {
  const n = ty.w + ty.l, wp = n ? ty.w / n : 0.5;
  if (c.role === "HC") {
    if (job.level === "fcs") return clamp(40 + 50 * (wp - 0.5) + 30 * (wp - ty.exp), 5, 75);
    return clamp(50 + 60 * (wp - 0.5) + 40 * (wp - ty.exp) + (job.level === "p4" ? 4 : 0), 5, 99);
  }
  const unit = c.role === "OC" ? ty.off : c.role === "DC" ? ty.def : 0;
  return clamp(45 + 8 * unit + 25 * (wp - 0.5) + (job.level === "p4" ? 8 : -2) + 4 * (job.prestige - 50) / 25, 5, 95);
}

/**
 * The yearly step at the carousel: every working coach's season goes on his record and moves his
 * reputation; everyone is a year older, his skills move a little (young coaches still learning, old ones
 * slowing down); coaches out of work fade.
 */
export function yearEnd(st: CoachingState, seed: number, year: number, jobs: Map<number, Job>, results: Map<number, TeamYear>): void {
  for (const c of st.coaches) {
    if (c.gone) continue;
    const rng = new Rng(mixSeed(seed, year, c.id, "coach-year"));
    if (c.team_id != null && c.role) {
      const job = jobs.get(c.team_id), ty = results.get(c.team_id);
      if (job && ty) {
        const unit = c.role === "OC" ? ty.off : c.role === "DC" ? ty.def : undefined;
        c.seasons.push({ year, team_id: c.team_id, role: c.role, w: ty.w, l: ty.l, ...(unit != null ? { unit: r1(unit) } : {}) });
        // A first season says less than a body of work.
        const k = c.since >= year ? 0.25 : 0.35;
        c.rep = Math.round(clamp((1 - k) * c.rep + k * seasonScore(c, job, ty), 5, 99));
      }
    } else if (!c.user) c.rep = Math.max(5, c.rep - 4);
    c.age++;
    const drift = c.age < 40 ? 0.8 : c.age < 55 ? 0.1 : c.age < 62 ? -0.4 : -1;
    for (const k of Object.keys(SKILLS) as Skill[]) c.skills[k] = Math.round(clamp(c.skills[k] + drift + 1.2 * rng.gauss(0, 1), 25, 95));
  }
}

// ---- the market -------------------------------------------------------------------------------------

/** How a school ranks a candidate: his reputation, a little of its own read, and what's against him. */
function score(c: CoachRec, job: Job, role: Role, seed: number, year: number): number {
  let x = c.rep + 7 * hashGauss(seed, year, job.team_id, c.id, role === "HC" ? 1 : 2);
  // Big programs want a head coach who has been one.
  const headExp = c.role === "HC" || !!c.prior || c.seasons.some((s) => s.role === "HC");
  if (role === "HC") x += c.role === "HC" ? 4 : headExp ? 1 : job.level === "p4" ? -5 : 0;
  if (c.team_id == null && c.left) x -= 3 * Math.max(0, year - c.left.year);
  if (c.age >= 63) x -= 8;
  // A head job needs head-coaching experience or a coordinator's résumé.
  if (role === "HC" && c.role !== "HC" && c.role !== "OC" && c.role !== "DC" && !c.prior && !c.seasons.some((s) => s.role !== "STC")) x -= 10;
  return x;
}

/** The least a school will settle for while it can still wait (it takes the best available when the search runs long). */
export const bar = (job: Job, role: Role) => (role === "HC" ? 20 + 0.42 * job.appeal : 12 + 0.38 * job.appeal);

/** Whether a coach would take a job: out-of-work coaches take anything; working ones move up, or a coordinator to a head job a level down. */
export function willing(c: CoachRec, job: Job, role: Role, jobs: Map<number, Job>, year: number): boolean {
  if (c.gone || c.moved === year) return false;
  if (c.team_id === job.team_id && c.role === role) return false;
  if (c.team_id == null) {
    if (c.left?.team_id === job.team_id && c.left.year === year && c.left.why !== "not_retained") return false;
    if (role === "HC") return true;
    // A coordinator job on his side of the ball (anyone can coach special teams).
    return role === "STC" || (role === "OC") === (c.side === "off");
  }
  const here = jobs.get(c.team_id);
  if (!here || !c.role) return false;
  const tenure = year - c.since + 1;
  if (role === "HC") {
    if (c.role === "HC") return tenure >= 2 && job.appeal >= here.appeal + (here.level === "p4" ? 22 : 15);
    if (c.role === "STC") return job.level === "fcs";
    return here.level !== "fcs" && job.appeal >= here.appeal - 45 && c.rep >= 40;
  }
  if (c.role !== role) return false;
  return tenure >= 2 && job.appeal >= here.appeal + 10;
}

export interface Candidate { coach: CoachRec; score: number }

/** The best candidates for a job, best first. */
export function candidates(st: CoachingState, job: Job, role: Role, jobs: Map<number, Job>, seed: number, year: number, opts: { user?: boolean } = {}): Candidate[] {
  const out: Candidate[] = [];
  for (const c of st.coaches) {
    if (c.user && !opts.user) continue;
    if (!willing(c, job, role, jobs, year)) continue;
    out.push({ coach: c, score: score(c, job, role, seed, year) });
  }
  return out.sort((a, b) => b.score - a.score || a.coach.id - b.coach.id);
}

/** A new head coach's staff: he keeps a coordinator now and then, brings his own when he can, hires the rest. */
export function keepChance(c: CoachRec): number { return c.rep >= 60 ? 0.55 : 0.4; }

/** A school's typical staff bill (an average name in every job), and what its athletic director lets it spend: a little more. */
export const typicalPay = (job: Job) => (["HC", "OC", "DC", "STC"] as Role[]).reduce((a, r) => a + salaryFor(r, job, 55), 0);
export const staffBudget = (job: Job) => round10k(1.15 * typicalPay(job));

// ---- the carousel, day by day ------------------------------------------------------------------------

/** When the carousel opens (the Sunday after the last full Saturday of November) and when the market closes. */
export const CAROUSEL_CLOSE = (year: number): ISODate => `${year + 1}-01-20`;

export interface MarketCtx {
  seed: number; year: number; date: ISODate; jobs: Map<number, Job>;
  names: { firsts: string[]; lasts: string[] };
  /** Your school (its staff openings are yours to fill), or null. */
  userTeam: number | null;
  news: (headline: string, body: string, teamIds: number[], kind?: string) => void;
  /** A one-time cost to a school's football budget. */
  charge: (teamId: number, amount: number, label: string) => void;
}

const roleWord = (r: Role) => (r === "HC" ? "head coach" : r === "OC" ? "offensive coordinator" : r === "DC" ? "defensive coordinator" : "special teams coordinator");
const record = (c: CoachRec, year: number) => { const s = c.seasons.find((x) => x.year === year); return s ? `${s.w}-${s.l}` : null; };

function addOpening(st: CoachingState, ctx: MarketCtx, teamId: number, role: Role, why: Opening["why"], prev: number | null, days: number): void {
  if (st.openings.some((o) => o.team_id === teamId && o.role === role)) return;
  st.openings.push({ team_id: teamId, role, opened: ctx.date, ready: addDays(ctx.date, days), why, prev });
}

/** A coach loses or leaves his job (his school owes him what's left of his deal when it lets him go). */
export function release(st: CoachingState, ctx: MarketCtx, c: CoachRec, why: Why, opts: { days?: number; quiet?: boolean } = {}): void {
  const tid = c.team_id!, role = c.role!, job = ctx.jobs.get(tid)!;
  const owed = why === "fired" || why === "not_retained" ? buyout(c, ctx.year) : 0;
  if (owed && job.level !== "fcs") ctx.charge(tid, owed, `Buyout: ${coachName(c)}`);
  const kind: CoachMove["kind"] = why === "left" ? "resigned" : why;
  st.moves.push({ date: ctx.date, coach: c.id, name: coachName(c), kind, team_id: tid, role, ...(owed ? { note: `owed $${(owed / 1e6).toFixed(1)}M` } : {}) });
  c.team_id = null; c.role = null; c.salary = 0;
  if (why === "retired") c.gone = true;
  else c.left = { team_id: tid, year: ctx.year, why };
  // Your own openings wait for you; everyone else's search starts.
  addOpening(st, ctx, tid, role, why, c.id, opts.days ?? (role === "HC" ? 1 : 3));
  if (opts.quiet) return;
  const rec = record(c, ctx.year);
  if (role === "HC") {
    const head = why === "retired" ? `${job.school}'s ${coachName(c)} retires` : why === "resigned" ? `${coachName(c)} steps down at ${job.school}` : `${job.school} fires head coach ${coachName(c)}`;
    const years = ctx.year - c.since + 1;
    ctx.news(head, `${coachName(c)} ${why === "retired" ? "retires after" : "leaves after"} ${years} season${years === 1 ? "" : "s"}${rec ? ` (${rec} this year)` : ""}.${owed ? ` The school owes him $${(owed / 1e6).toFixed(1)} million.` : ""}`, [tid], "coaching");
  } else if (tid === ctx.userTeam) {
    ctx.news(`${job.school} ${roleWord(role)} ${coachName(c)} ${why === "retired" ? "retires" : "is out"}`, `Your staff has an opening at ${roleWord(role)}. Hire his replacement on the Staff screen.`, [tid], "staff");
  }
}

/**
 * Put a coach in a job. Whatever job he had opens behind him. A new head coach keeps a coordinator now and
 * then, brings coordinators from his old staff when he can, and fills the rest right away.
 */
export function hire(st: CoachingState, ctx: MarketCtx, c: CoachRec, teamId: number, role: Role, opts: { since?: number; quiet?: boolean } = {}): void {
  const job = ctx.jobs.get(teamId)!;
  const rng = new Rng(mixSeed(ctx.seed, ctx.year, "hire", teamId, role, c.id));
  const from = { team_id: c.team_id, role: c.role };
  const fromJob = c.team_id != null ? ctx.jobs.get(c.team_id) : undefined;
  if (c.team_id != null && c.role) {
    const oldTeam = c.team_id, oldRole = c.role;
    c.team_id = null; c.role = null;
    addOpening(st, ctx, oldTeam, oldRole, "hired_away", c.id, oldRole === "HC" ? 3 + rng.int(8) : 2 + rng.int(6));
    if (oldTeam === ctx.userTeam) ctx.news(`${fromJob!.school} loses ${roleWord(oldRole)} ${coachName(c)} to ${job.school}`, `${coachName(c)} takes the ${roleWord(role)} job at ${job.school}. Hire his replacement on the Staff screen.`, [oldTeam, teamId], "staff");
  }
  // Whoever holds the job now (an opening filled from the market never has one).
  const sitting = st.coaches.find((x) => x.team_id === teamId && x.role === role && x !== c);
  if (sitting) release(st, ctx, sitting, "not_retained", { quiet: true });
  st.openings = st.openings.filter((o) => !(o.team_id === teamId && o.role === role));
  c.team_id = teamId; c.role = role; c.moved = ctx.year; c.left = undefined;
  if (role === "OC") c.side = "off";
  if (role === "DC") c.side = "def";
  c.since = opts.since ?? ctx.year + 1;
  c.salary = salaryFor(role, job, c.rep);
  c.through = c.since + contractYears(role) - 1;
  st.moves.push({ date: ctx.date, coach: c.id, name: coachName(c), kind: "hired", team_id: teamId, role, from });
  if (!opts.quiet) {
    const was = from.team_id != null ? `${roleWord(from.role!)} at ${fromJob!.school}` : c.prior || c.seasons.some((s) => s.role === "HC") ? "a former head coach" : c.source === "new" ? "a first-time coordinator" : "out of coaching";
    const rec = from.team_id != null ? record(c, ctx.year) : null;
    if (role === "HC") ctx.news(`${job.school} hires ${coachName(c)} as head coach`, `${coachName(c)}, ${was}${rec ? ` (${rec} this season)` : ""}, takes over ${job.school}.`, [teamId, ...(from.team_id != null ? [from.team_id] : [])], "coaching");
    else if (job.level === "p4" || teamId === ctx.userTeam || from.team_id === ctx.userTeam) ctx.news(`${job.school} names ${coachName(c)} ${roleWord(role)}`, `${coachName(c)} comes from ${was}.`, [teamId], "coaching");
  }
  if (role !== "HC" || teamId === ctx.userTeam) return;
  // The new head coach's staff.
  for (const r of STAFF_ROLES) {
    const cur = st.coaches.find((x) => x.team_id === teamId && x.role === r);
    if (cur && (cur.moved === ctx.year || rng.random() < keepChance(cur))) continue;
    if (cur) release(st, ctx, cur, "not_retained", { quiet: true, days: 0 });
    // His coordinators from his last head job follow when it's a step up.
    const own = from.role === "HC" && fromJob ? st.coaches.find((x) => x.team_id === from.team_id && x.role === r && x.moved !== ctx.year) : undefined;
    if (own && job.appeal >= fromJob!.appeal - 5 && rng.random() < 0.5) { hire(st, ctx, own, teamId, r, { quiet: true }); continue; }
    const pick = candidates(st, job, r, ctx.jobs, ctx.seed, ctx.year)[0]?.coach ?? newCoach(st, rng, ctx.names);
    if (pick.source === "new" && pick.entered == null) pick.entered = ctx.year;
    hire(st, ctx, pick, teamId, r, { quiet: true });
  }
}

/**
 * The carousel opens: results go on every coach's record, athletic directors let coaches go, old coaches
 * retire, head coaches let coordinators go, and new coaches enter the profession. `keep` says which head
 * coaches are not the AI's to let go (yours).
 */
export function openCarousel(st: CoachingState, ctx: MarketCtx, results: Map<number, TeamYear>): void {
  const { seed, year } = ctx;
  st.open = true; st.year = year; st.openings = []; st.offers = [];
  yearEnd(st, seed, year, ctx.jobs, results);
  const fired = new Set<number>();
  for (const c of [...st.coaches]) {
    if (c.gone || c.team_id == null || c.role !== "HC" || c.user) continue;
    const job = ctx.jobs.get(c.team_id);
    if (!job) continue;
    const ty = results.get(c.team_id), rng = new Rng(mixSeed(seed, year, c.id, "let-go"));
    const n = ty ? ty.w + ty.l : 0, wp = n ? ty!.w / n : 0.5;
    // FCS results are thin (a game or two against FBS), so their coaches turn over at about the FBS rate.
    const p = Math.max(ty ? letGoChance({ wp, exp: ty.exp, prev: ty.prev ?? ty.exp, tenure: year - c.since + 1, power: job.level === "p4" }) : 0.16, retireChance(c.age));
    if (rng.random() >= p) continue;
    const why: Why = c.age >= 62 && rng.random() < 0.6 ? "retired" : rng.random() < 0.12 ? "resigned" : "fired";
    fired.add(c.team_id);
    release(st, ctx, c, why, { days: 1 + rng.int(10) });
  }
  // Coordinators: retirements everywhere; head coaches who stay let some go (yours stay unless you let them go).
  for (const c of [...st.coaches]) {
    if (c.gone || c.team_id == null || !c.role || c.role === "HC") continue;
    const ty = results.get(c.team_id), rng = new Rng(mixSeed(seed, year, c.id, "coord-let-go"));
    const n = ty ? ty.w + ty.l : 0, wp = n ? ty!.w / n : 0.5;
    const unit = !ty ? 0 : c.role === "OC" ? ty.off : c.role === "DC" ? ty.def : 0;
    const mine = c.team_id === ctx.userTeam;
    const p = Math.max(mine || fired.has(c.team_id) || !ty ? 0 : coordLetGo(unit, wp, ty.exp), retireChance(c.age));
    if (rng.random() >= p) continue;
    release(st, ctx, c, retireChance(c.age) >= p && c.age >= 62 ? "retired" : "fired", { days: 3 + rng.int(12) });
  }
  // Coaches out of work for a while leave the profession; new ones come in.
  const rng = new Rng(mixSeed(seed, year, "coach-pool"));
  for (const c of st.coaches) {
    if (c.gone || c.team_id != null || c.user) continue;
    const out = c.left ? year - c.left.year : c.entered != null ? year - c.entered : 0;
    if (c.age >= 66 || (out >= 2 && rng.random() < 0.4) || out >= 4) {
      c.gone = true;
      st.moves.push({ date: ctx.date, coach: c.id, name: coachName(c), kind: "left_coaching", team_id: null, role: null });
    }
  }
  const idle = st.coaches.filter((c) => !c.gone && c.team_id == null).length;
  for (let i = 0, n = Math.max(30, 170 - idle); i < n; i++) newCoach(st, rng, ctx.names).entered = year;
}

export interface DayResult { offers: JobOffer[]; hires: number }

/**
 * One day of the market: openings whose search has run its course are filled, best jobs first. A school
 * waits for a candidate it likes for up to two weeks, then takes the best it can get; on the day the market
 * closes everything left is filled. A school whose best candidate is you offers you the job (three days to
 * answer). Returns the offers made today.
 */
export function marketDay(st: CoachingState, ctx: MarketCtx, opts: { userCoach: CoachRec | null; close: boolean }): DayResult {
  const out: DayResult = { offers: [], hires: 0 };
  const { date, year, seed } = ctx;
  for (const o of st.offers) {
    if (o.status !== "open" || o.expires > date) continue;
    o.status = "expired";
    const op = st.openings.find((x) => x.team_id === o.team_id && x.role === "HC");
    if (op) { op.offered = false; op.declined = true; }
  }
  const u = opts.userCoach;
  const ready = st.openings.filter((o) => (o.ready <= date || opts.close) && !o.offered && !(o.team_id === ctx.userTeam && o.role !== "HC"))
    .sort((a, b) => ctx.jobs.get(b.team_id)!.appeal - ctx.jobs.get(a.team_id)!.appeal || (a.role === "HC" ? -1 : b.role === "HC" ? 1 : 0) || a.team_id - b.team_id);
  for (const o of ready) {
    if (!st.openings.includes(o)) continue;
    const job = ctx.jobs.get(o.team_id)!;
    const waited = addDays(o.ready, 14) <= date || opts.close;
    const list = candidates(st, job, o.role, ctx.jobs, seed, year, { user: o.role === "HC" && !o.declined && !!u });
    const pick = list.find((p) => p.score >= bar(job, o.role) || waited);
    if (!pick) continue;
    if (pick.coach.user) {
      const offer: JobOffer = { team_id: o.team_id, date, expires: addDays(date, 3), salary: salaryFor("HC", job, pick.coach.rep), years: contractYears("HC"), status: "open" };
      st.offers.push(offer);
      o.offered = true;
      out.offers.push(offer);
      continue;
    }
    if (pick.coach.source === "new" && pick.coach.entered == null) pick.coach.entered = year;
    hire(st, ctx, pick.coach, o.team_id, o.role);
    out.hires++;
  }
  // Out of work and no offer yet ten days in: the last open head job in the country calls you.
  if (u && u.team_id == null && u.left?.year === year && !st.offers.some((o) => o.status === "open") && !st.offers.length) {
    const open = st.openings.filter((o) => o.role === "HC" && !o.offered && ctx.jobs.get(o.team_id)!.level !== "fcs" && addDays(o.opened, 10) <= date);
    const last = open.sort((a, b) => ctx.jobs.get(a.team_id)!.appeal - ctx.jobs.get(b.team_id)!.appeal)[0];
    if (last) {
      const job = ctx.jobs.get(last.team_id)!;
      const offer: JobOffer = { team_id: last.team_id, date, expires: addDays(date, 3), salary: salaryFor("HC", job, u.rep), years: contractYears("HC"), status: "open" };
      st.offers.push(offer);
      last.offered = true;
      out.offers.push(offer);
    }
  }
  if (opts.close) {
    // Whatever the market couldn't fill: newcomers (a new head coach's staff can open more jobs, so until none is left).
    for (let guard = 0; guard < 2000; guard++) {
      const o = st.openings.find((x) => !x.offered && !(x.team_id === ctx.userTeam && x.role !== "HC"));
      if (!o) break;
      const c = newCoach(st, new Rng(mixSeed(seed, year, "late-hire", o.team_id, o.role, guard)), ctx.names);
      c.entered = year;
      hire(st, ctx, c, o.team_id, o.role, { quiet: true });
    }
    if (!st.offers.some((o) => o.status === "open")) st.open = false;
  }
  return out;
}

/** The share of a list that holds, for the gates. */
export const share = <T,>(xs: T[], f: (x: T) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);
