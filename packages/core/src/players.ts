/**
 * Rated players. Ratings run 0 to 99: 75 is the median FBS starter at the position and 8 points is one
 * standard deviation, so the compiler reads z = (rating - 75) / 8. Ratings say how well; tendencies say
 * how often. Overall is for display and is never read by the sim.
 */

/** Game positions. CFBD's DB, DL and OL are split into these by the importer. */
export type Pos = "QB" | "RB" | "WR" | "TE" | "OL" | "DE" | "DT" | "LB" | "CB" | "S" | "K" | "P" | "LS";

export const POSITIONS: Pos[] = ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];

export const ATTRS: Record<Pos, string[]> = {
  QB: ["acc_short", "acc_deep", "arm", "decisions", "pocket", "speed", "security"],
  RB: ["vision", "elusive", "power", "speed", "security", "hands", "pass_block"],
  WR: ["route", "hands", "speed", "contested", "rac", "block"],
  TE: ["route", "hands", "run_block", "pass_block", "speed"],
  OL: ["run_block", "pass_block", "discipline"],
  DE: ["pass_rush", "run_def", "shed"],
  DT: ["pass_rush", "run_def", "shed"],
  LB: ["run_fit", "tackle", "coverage", "blitz", "speed"],
  CB: ["man", "zone", "ball", "speed", "tackle"],
  S: ["zone", "range", "ball", "tackle", "run_sup"],
  K: ["k_power", "k_acc"],
  P: ["p_power", "hang"],
  LS: ["snap"],
};

export const ATTR_LABELS: Record<string, string> = {
  acc_short: "Short accuracy", acc_deep: "Deep accuracy", arm: "Arm strength", decisions: "Decisions", pocket: "Pocket presence",
  speed: "Speed", security: "Ball security", vision: "Vision", elusive: "Elusiveness", power: "Power", hands: "Hands",
  pass_block: "Pass block", run_block: "Run block", route: "Route running", contested: "Contested catch", rac: "Run after catch",
  block: "Blocking", discipline: "Discipline", pass_rush: "Pass rush", run_def: "Run defense", shed: "Block shedding",
  run_fit: "Run fit", tackle: "Tackling", coverage: "Coverage", blitz: "Blitz", man: "Man coverage", zone: "Zone coverage",
  ball: "Ball skills", range: "Range", run_sup: "Run support", k_power: "Kick power", k_acc: "Kick accuracy",
  p_power: "Punt power", hang: "Hang time", snap: "Snapping", stamina: "Stamina", injury: "Injury proneness",
  toughness: "Toughness", potential: "Potential", work_ethic: "Work ethic",
};

/** Weights for the displayed overall: each attribute's share of the compiler's effect at the position. */
export const OVR_WEIGHTS: Record<Pos, Record<string, number>> = {
  QB: { acc_short: 0.26, acc_deep: 0.14, arm: 0.1, decisions: 0.2, pocket: 0.14, speed: 0.08, security: 0.08 },
  RB: { vision: 0.24, elusive: 0.2, power: 0.14, speed: 0.22, security: 0.1, hands: 0.06, pass_block: 0.04 },
  WR: { route: 0.3, hands: 0.22, speed: 0.22, contested: 0.1, rac: 0.12, block: 0.04 },
  TE: { route: 0.24, hands: 0.22, run_block: 0.24, pass_block: 0.16, speed: 0.14 },
  OL: { run_block: 0.45, pass_block: 0.45, discipline: 0.1 },
  DE: { pass_rush: 0.55, run_def: 0.3, shed: 0.15 },
  DT: { pass_rush: 0.35, run_def: 0.45, shed: 0.2 },
  LB: { run_fit: 0.3, tackle: 0.22, coverage: 0.22, blitz: 0.12, speed: 0.14 },
  CB: { man: 0.3, zone: 0.3, ball: 0.15, speed: 0.17, tackle: 0.08 },
  S: { zone: 0.28, range: 0.26, ball: 0.16, tackle: 0.15, run_sup: 0.15 },
  K: { k_power: 0.4, k_acc: 0.6 },
  P: { p_power: 0.6, hang: 0.4 },
  LS: { snap: 1 },
};

export interface RatedPlayer {
  id: number; team_id: number; first: string; last: string; pos: Pos; /** CFBD's listed position */ listed: string;
  class: string; /** Seasons in college before 2026 (0 = true freshman). */ years: number;
  jersey: number | null; height: number | null; weight: number | null;
  home: { city: string | null; state: string | null; lat: number | null; lon: number | null };
  stars: number | null; composite: number | null; natl_rank: number | null;
  attrs: Record<string, number>;
  traits: { stamina: number; injury: number; toughness: number; discipline: number };
  hidden: { potential: number; work_ethic: number };
  /** QB: scramble rate (share of dropbacks). Ball carriers and receivers: role share of touches. */
  tend: { scramble?: number; deep?: number; carry?: number; target?: number };
  ovr: number;
  /** How the rating was made: stats (with sample size), recruiting prior, or generated. */
  basis: "stats" | "prior" | "generated"; sample: number;
}

export const z = (r: number) => (r - 75) / 8;
export const fromZ = (zz: number) => Math.max(20, Math.min(99, Math.round(75 + 8 * zz)));

export function overall(pos: Pos, attrs: Record<string, number>): number {
  const w = OVR_WEIGHTS[pos];
  let s = 0, t = 0;
  for (const [k, v] of Object.entries(w)) if (attrs[k] != null) { s += v * attrs[k]; t += v; }
  return t ? Math.round(s / t) : 50;
}

export const playerName = (p: { first: string; last: string }) => `${p.first} ${p.last}`.trim();
