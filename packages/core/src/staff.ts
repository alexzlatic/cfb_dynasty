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
 * with the bigger recruiting staffs of power programs); in season most of it goes to the next game.
 */
export interface StaffTime { recruiting: number; scouting: number; prep: number }
export const SEASON_TIME: StaffTime = { recruiting: 0.3, scouting: 0.1, prep: 0.6 };
export const OFFSEASON_TIME: StaffTime = { recruiting: 0.7, scouting: 0.3, prep: 0 };
export const STAFF_HOURS = 160;

/** A split normalized to add up to 1 (prep off in the offseason, when there is no game to prepare for). */
export function timeSplit(t: StaffTime, inSeason: boolean): StaffTime {
  const r = Math.max(0, t.recruiting), s = Math.max(0, t.scouting), p = inSeason ? Math.max(0, t.prep) : 0;
  const sum = r + s + p;
  if (sum <= 0) return inSeason ? SEASON_TIME : OFFSEASON_TIME;
  return { recruiting: r / sum, scouting: s / sum, prep: p / sum };
}

/**
 * What a week of preparation is worth: 1 at the usual split (60% of the staff's time on the game) with an
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
