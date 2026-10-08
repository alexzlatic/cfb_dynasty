import type { SnapMod, TeamRatings } from "@cfb/engine";
import { OFF_CALLS, type OffCall } from "./calls.ts";

/**
 * The week's game plan and practice (M1 plan, "Game day" and "Practice"). The coordinators call your
 * games from the plan, live or simmed; practice builds a small, capped edge for the next game.
 * The defaults change nothing: a team on the default plan and a normal week plays like the
 * calibrated engine.
 */
export type PlanLevel = -1 | 0 | 1;
export type Philosophy = "conservative" | "standard" | "aggressive";

export interface GamePlan {
  /** -2 (run heavy) to 2 (pass heavy): how often the coordinator overrides a run call with a pass, or the reverse. */
  run_pass: number;
  /** Less (-1), normal (0) or more (1) of each offensive call, when the coordinator picks one of that kind. */
  emphasis: Partial<Record<OffCall, PlanLevel>>;
  tempo: "milk" | "normal" | "hurry";
  blitz: PlanLevel;
  box: PlanLevel;
  coverage: "mixed" | "cover2" | "cover3" | "man";
  fourth_down: Philosophy;
  two_point: Philosophy;
}

export const DEFAULT_PLAN: GamePlan = {
  run_pass: 0, emphasis: {}, tempo: "normal", blitz: 0, box: 0, coverage: "mixed", fourth_down: "standard", two_point: "standard",
};

export type Intensity = "light" | "normal" | "hard";
export type Focus = "offense" | "defense" | "situations" | "opponent";
export interface PracticeDay { intensity: Intensity; focus: Focus }
/** Monday to Thursday. */
export type PracticePlan = PracticeDay[];
export const PRACTICE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"] as const;
export const DEFAULT_PRACTICE: PracticePlan = [
  { intensity: "normal", focus: "offense" }, { intensity: "normal", focus: "defense" },
  { intensity: "normal", focus: "situations" }, { intensity: "normal", focus: "opponent" },
];

/** Practice banked toward the next game. */
export interface Prep { offense: number; defense: number; situations: number; hard_days: number; for_game: number | null }

const INTENSITY: Record<Intensity, number> = { light: 0.6, normal: 1, hard: 1.4 };
/** What the default week banks; prep counts only as the difference from it. */
const BASE = { offense: 1.5, defense: 1.5, situations: 1 };

export function emptyPrep(gameId: number | null): Prep { return { offense: 0, defense: 0, situations: 0, hard_days: 0, for_game: gameId }; }

/** Bank one practice day. */
export function addPractice(prep: Prep, day: PracticeDay): void {
  const v = INTENSITY[day.intensity];
  if (day.focus === "offense") prep.offense += v;
  else if (day.focus === "defense") prep.defense += v;
  else if (day.focus === "situations") prep.situations += v;
  else { prep.offense += v / 2; prep.defense += v / 2; }
  if (day.intensity === "hard") prep.hard_days++;
}

/** Edge on game day, in units of PREP_UNIT, with diminishing returns: a full week on one thing is worth about 1.5. */
export interface PrepEdge { offense: number; defense: number; situations: number }
const edge = (x: number, base: number) => Math.round(1.5 * Math.tanh((x - base) / 1.5) * 100) / 100;
export function prepEdge(prep: Prep | null | undefined): PrepEdge {
  if (!prep) return { offense: 0, defense: 0, situations: 0 };
  return { offense: edge(prep.offense, BASE.offense), defense: edge(prep.defense, BASE.defense), situations: edge(prep.situations, BASE.situations) };
}

/** One unit of edge for the offense (a defense's edge is the same, against the offense). About half a point a game. */
export const PREP_UNIT: Omit<SnapMod, "rushers" | "receivers"> = { comp: 0.05, ypcomp: 0.012, sack: -0.05, int: -0.05, ypc: 0.012, stuff: -0.04, explosive: 0.03 };

/** Energy each player starts the game with after hard practices. */
export const freshness = (prep: Prep | null | undefined) => Math.max(0.9, 1 - 0.02 * (prep?.hard_days ?? 0));

/** Chance a hard practice costs a player time (light and normal days never do). */
export const PRACTICE_INJURY = 0.07;

/** A team's ratings with the head coach's 4th-down philosophy and the plan's tempo. */
export function planRatings(r: TeamRatings, plan: GamePlan): TeamRatings {
  const aggr = { conservative: -0.7, standard: 0, aggressive: 0.7 }[plan.fourth_down];
  const tempo = { milk: 0.9, normal: 1, hurry: 1.1 }[plan.tempo];
  if (!aggr && tempo === 1) return r;
  return { ...r, aggressiveness: (r.aggressiveness || 0) + aggr, plays_per_game: r.plays_per_game * tempo };
}

const LEVEL = new Set([-1, 0, 1]);
const PHIL = new Set(["conservative", "standard", "aggressive"]);

/** Throws on anything that is not a valid plan; returns it filled out with defaults. */
export function checkPlan(x: unknown): GamePlan {
  const p = { ...DEFAULT_PLAN, ...(x as object) } as GamePlan;
  if (typeof p.run_pass !== "number" || !Number.isInteger(p.run_pass) || Math.abs(p.run_pass) > 2) throw new Error("run_pass must be -2 to 2");
  if (!p.emphasis || typeof p.emphasis !== "object") throw new Error("emphasis must be an object");
  for (const [k, v] of Object.entries(p.emphasis)) {
    if (!OFF_CALLS.some((c) => c.id === k)) throw new Error(`unknown call ${k}`);
    if (!LEVEL.has(v as number)) throw new Error(`emphasis for ${k} must be -1, 0 or 1`);
  }
  if (!["milk", "normal", "hurry"].includes(p.tempo)) throw new Error("bad tempo");
  if (!LEVEL.has(p.blitz) || !LEVEL.has(p.box)) throw new Error("blitz and box must be -1, 0 or 1");
  if (!["mixed", "cover2", "cover3", "man"].includes(p.coverage)) throw new Error("bad coverage");
  if (!PHIL.has(p.fourth_down) || !PHIL.has(p.two_point)) throw new Error("bad philosophy");
  return { run_pass: p.run_pass, emphasis: { ...p.emphasis }, tempo: p.tempo, blitz: p.blitz, box: p.box, coverage: p.coverage, fourth_down: p.fourth_down, two_point: p.two_point };
}

export function checkPractice(x: unknown): PracticePlan {
  if (!Array.isArray(x) || x.length !== 4) throw new Error("practice is four days, Monday to Thursday");
  return x.map((d) => {
    if (!d || !["light", "normal", "hard"].includes(d.intensity) || !["offense", "defense", "situations", "opponent"].includes(d.focus)) throw new Error("bad practice day");
    return { intensity: d.intensity, focus: d.focus };
  });
}
