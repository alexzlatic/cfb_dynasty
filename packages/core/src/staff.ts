import { Rng } from "@cfb/engine";
import { mixSeed } from "./hash.ts";
import type { Coach, Team } from "./types.ts";

/**
 * Coaching staff skills (M3). Every coach has five skills, 25 to 95 with 50 average: recruiting (what a
 * contact hour is worth), scouting (how fast his read of a prospect narrows), development (how fast
 * players grow), game planning (what a week of preparation is worth on Saturday) and scheme (how well he
 * sells and fits his system). They come from the seed: a head coach's career record and his school's
 * standing, coordinators from the school's standing, each with his own strengths. M4 adds hiring and firing.
 */
export type Skill = "recruiting" | "scouting" | "development" | "game_planning" | "scheme";
export const SKILLS: Record<Skill, string> = {
  recruiting: "Recruiting", scouting: "Scouting", development: "Development", game_planning: "Game planning", scheme: "Scheme",
};
const SKILL_KEYS = Object.keys(SKILLS) as Skill[];

/** How much each staff role counts toward the staff's skill as a whole. */
const ROLE_WEIGHT: Record<Coach["role"], number> = { HC: 0.4, OC: 0.25, DC: 0.25, STC: 0.1 };
/** What each role leans toward (points). */
const ROLE_LEAN: Record<Coach["role"], Partial<Record<Skill, number>>> = {
  HC: { recruiting: 4, development: 1 }, OC: { scheme: 4, game_planning: 3 }, DC: { scheme: 4, game_planning: 3 }, STC: { game_planning: -2, recruiting: 2 },
};

export interface StaffMember { role: Coach["role"]; first: string; last: string; skills: Record<Skill, number> }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** One coach's skills, the same every time for the same league seed. */
export function coachSkills(seed: number, c: Coach, t: Pick<Team, "prestige">): Record<Skill, number> {
  const rng = new Rng(mixSeed(seed, c.team_id, c.role, c.first, c.last, "skills"));
  // The school's standing: good programs hire good coaches.
  let level = 0.5 * ((t.prestige ?? 40) - 50) / 20;
  if (c.role === "HC") {
    // A head coach's record, trusted more the longer it is.
    let w = 0, l = 0;
    for (const y of c.career ?? []) { w += y.wins; l += y.losses; }
    const n = w + l;
    if (n) level += 0.6 * ((w / n - 0.5) / 0.15) * (n / (n + 40));
  }
  const out = {} as Record<Skill, number>;
  for (const k of SKILL_KEYS) out[k] = Math.round(clamp(50 + 11 * level + (ROLE_LEAN[c.role][k] ?? 0) + 10 * rng.gauss(0, 1), 25, 95));
  return out;
}

/** A school's staff with their skills (head coach first). */
export function staffOf(seed: number, coaches: Coach[], t: Pick<Team, "id" | "prestige">): StaffMember[] {
  const order: Coach["role"][] = ["HC", "OC", "DC", "STC"];
  return coaches.filter((c) => c.team_id === t.id).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((c) => ({ role: c.role, first: c.first, last: c.last, skills: coachSkills(seed, c, t) }));
}

/** The staff's skill as a whole (50 when a school has no staff on record). */
export function staffSkill(staff: StaffMember[], k: Skill): number {
  let s = 0, w = 0;
  for (const m of staff) { s += ROLE_WEIGHT[m.role] * m.skills[k]; w += ROLE_WEIGHT[m.role]; }
  return w ? s / w : 50;
}

/**
 * How the staff splits its week. About 160 hours a week across the head coach and coordinators (more
 * with the bigger recruiting staffs of power programs); in season most of it goes to the next game:
 * practice and installing the plan (prep), film of the opponent (scouting.ts) and the players' individual
 * development plans (develop: hidden.ts, the pace of every plan).
 */
export interface StaffTime {
  recruiting: number; scouting: number; prep: number;
  /** Film of the next opponent (absent in older saves). */
  opponent?: number;
  /** Individual development plans (absent in older saves, whose practice share included them). */
  develop?: number;
}
export const SEASON_TIME: StaffTime = { recruiting: 0.3, scouting: 0.1, prep: 0.35, develop: 0.1, opponent: 0.15 };
export const OFFSEASON_TIME: StaffTime = { recruiting: 0.7, scouting: 0.3, prep: 0, develop: 0, opponent: 0 };
export const STAFF_HOURS = 160;
/**
 * Whose hours those are: the head coach and his three coordinators, about 40 flexible hours a week each on
 * top of the meetings, practices and games that fill the rest of a 70 to 80 hour week. The head coach's own
 * share goes by the same split, so in season he has about 12 hours a week for recruiting, out of season 28.
 * FCS staffs are smaller and spread thinner: 96 hours a week.
 */
export const HC_HOURS = 40;
export const staffHours = (level: "fbs" | "fcs") => (level === "fcs" ? 96 : STAFF_HOURS);
/**
 * Off-field recruiting staff (a director of recruiting, personnel staff, analysts): 16 contact hours a week
 * each, all year, on top of the coaches' recruiting share. They run the calls, texts, mail and visit days but
 * can't stand in for the head coach. Power programs carry three; elsewhere the coaches do it themselves.
 * You can hire more (or, at a smaller program, some) out of the operations budget.
 */
export const STAFFER_HOURS = 16;
export const STAFFER_PAY = 85_000;
export const MAX_STAFFERS = 8;
export const usualStaffers = (power: boolean) => (power ? 3 : 0);
/** A school's contact hours a week: the coaches' recruiting share plus the recruiting staff. */
export const recruitHours = (level: "fbs" | "fcs", recruitingShare: number, staffers: number) =>
  staffHours(level) * recruitingShare + STAFFER_HOURS * staffers;

/**
 * A split normalized to add up to 1. Practice, film and development plans are in-season work: out of season
 * there is no game to prepare for and plans run at their usual pace, so the week is recruiting and scouting.
 */
export function timeSplit(t: StaffTime, inSeason: boolean): Required<StaffTime> {
  const r = Math.max(0, t.recruiting), s = Math.max(0, t.scouting);
  // A split saved before film had its own share keeps the usual film week; one saved before development
  // had its own share gave it out of practice.
  const legacy = t.develop == null;
  const p = inSeason ? Math.max(0, t.prep - (legacy ? SEASON_TIME.develop! : 0)) : 0;
  const d = inSeason ? Math.max(0, t.develop ?? SEASON_TIME.develop!) : 0;
  const o = inSeason ? Math.max(0, t.opponent ?? SEASON_TIME.opponent!) : 0;
  const sum = r + s + p + d + o;
  if (sum <= 0) return timeSplit(inSeason ? SEASON_TIME : OFFSEASON_TIME, inSeason);
  return { recruiting: r / sum, scouting: s / sum, prep: p / sum, develop: d / sum, opponent: o / sum };
}

/**
 * How fast your development plans work against the usual week (10% of the staff's time in season): none
 * with no time for them, about 1.4 times as fast at double the time, 1.6 at most. Out of season, 1.
 */
export function labPace(developShare: number): number {
  return Math.round(clamp(Math.sqrt(Math.max(0, developShare) / SEASON_TIME.develop!), 0, 1.6) * 1000) / 1000;
}

/**
 * What a week of preparation is worth: 1 at the usual split (35% of the staff's time on practice) with an
 * average game-planning staff; less when the staff spends its week recruiting, more (to a point) when it
 * doesn't, and up to about 30% more or less with the staff's skill.
 */
export function prepFactor(prepShare: number, gamePlanning: number): number {
  return Math.round(clamp(prepShare / SEASON_TIME.prep, 0.3, 1.25) * (0.7 + 0.6 * gamePlanning / 100) * 1000) / 1000;
}

/** Development: up to about 10% faster or slower growth with the staff's development skill. */
export const devSkillRate = (development: number) => Math.round((0.9 + 0.2 * development / 100) * 1000) / 1000;
/** Recruiting: what one contact hour is worth (1 for an average staff). */
export const recruitEff = (recruiting: number) => Math.round((0.7 + 0.6 * recruiting / 100) * 1000) / 1000;
/** Scouting: how wide the staff's reads run (1 for an average staff, 0.75 for the best). */
export const scoutWidth = (scouting: number) => Math.round((1.3 - 0.6 * scouting / 100) * 1000) / 1000;
