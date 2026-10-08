import { Rng, type TeamRatings } from "@cfb/engine";
import { mixSeed } from "./hash.ts";
import { DEFENSE_SLOTS, OFFENSE_SLOTS, OVR_WEIGHTS, SLOT_LABELS, SLOT_POS, type Pos, type RatedPlayer, type Slot } from "./players.ts";

/**
 * Coordinators' schemes. Each coordinator runs one system: the offensive coordinator an offense (Air Raid,
 * spread RPO, pro-style, power run, option) and the defensive coordinator a front (4-2-5, 4-3, 3-4, 3-3-5).
 * Where a school has no coordinator on record the head coach's system stands in.
 *
 * A scheme says three things:
 *   - its layout: what each of the compiler's eleven slots per side is called in this system and which
 *     positions can play it (a 3-4 puts outside linebackers in the end slots, a 3-3-5 a stack linebacker
 *     in a tackle slot and a hybrid safety at nickel). The compiler's slots stay the same in every scheme.
 *   - what it values: attribute weights per slot. A player's scheme rating is his overall with the scheme's
 *     weights, and his fit is how far that is from his overall (an option quarterback who can run fits the
 *     option better than his overall says).
 *   - its tendencies: how its coordinator leans off the usual mix of calls (calls.ts mixes), which is what
 *     opponents can scout.
 *
 * Nobody publishes schemes, so a seed school's are inferred: the offense from how its real offense played
 * (pass rate, tempo, quarterback runs) and the front from its roster's shape (linebackers, safeties and
 * tackles against the country), filled to roughly the real FBS mix of fronts.
 */

export type OffScheme = "air_raid" | "spread_rpo" | "pro_style" | "power_run" | "option";
export type DefScheme = "4-2-5" | "4-3" | "3-4" | "3-3-5";
export type Scheme = OffScheme | DefScheme;

export interface SlotRole {
  /** What the slot is called in this scheme. */
  label: string;
  /** Positions that can play it, best first. */
  pos: Pos[];
  /** Attribute weights the scheme puts on the slot (attributes of the player's own position; missing ones fall back to overall weights). */
  values?: Record<string, number>;
}

export interface SchemeDef {
  id: Scheme;
  side: "off" | "def";
  name: string;
  /** One line on how it plays. */
  blurb: string;
  /** Slots that differ from the default layout (label, positions or values). */
  slots: Partial<Record<Slot, SlotRole>>;
  /** Values for every slot a position plays, unless the slot sets its own. */
  values: Partial<Record<Pos, Record<string, number>>>;
  /**
   * Tendencies: multipliers on the coordinators' usual mix of calls (calls.ts OFF_MIX / DEF_MIX). How often
   * a team runs or passes comes from its real play-calling (the engine's pass tendencies), not the scheme.
   */
  mix: Partial<Record<string, number>>;
}

const DEF_SLOT_ROLE = (s: Slot): SlotRole => ({ label: SLOT_LABELS[s], pos: SLOT_POS[s] });

export const SCHEMES: Record<Scheme, SchemeDef> = {
  air_raid: {
    id: "air_raid", side: "off", name: "Air Raid", blurb: "Four wide, quick rhythm throws and mesh concepts; the back is a receiver and a pass blocker.",
    slots: { WR4: { label: "Fourth receiver (Y)", pos: ["WR", "TE"] }, TE1: { label: "Tight end / H-back", pos: ["TE", "WR"] } },
    values: {
      QB: { acc_short: 1.5, decisions: 1.4, acc_deep: 0.9, arm: 0.6, pocket: 1, speed: 0.3, security: 0.6 },
      WR: { route: 1.4, hands: 1.1, speed: 1.1, rac: 1, contested: 0.6, block: 0.1 },
      RB: { hands: 1.4, pass_block: 1.2, elusive: 1, vision: 0.8, speed: 1, power: 0.4, security: 0.6 },
      TE: { route: 1.4, hands: 1.2, speed: 1.1, pass_block: 0.8, run_block: 0.4 },
      OL: { pass_block: 1.5, run_block: 0.5, discipline: 0.6 },
    },
    mix: { quick: 1.35, intermediate: 1.1, screen: 1.1, deep: 1.05, play_action: 0.6, inside_run: 1.1, outside_run: 0.9, qb_run: 0.7 },
  },
  spread_rpo: {
    id: "spread_rpo", side: "off", name: "Spread RPO", blurb: "Tempo from the gun with run-pass options; the quarterback's legs keep the box honest.",
    slots: { RB2: { label: "Running back 2 / H", pos: ["RB", "WR"] } },
    values: {
      QB: { decisions: 1.4, acc_short: 1.2, speed: 1.3, acc_deep: 0.8, arm: 0.7, pocket: 0.6, security: 0.8 },
      RB: { vision: 1.2, speed: 1.2, elusive: 1.1, power: 0.6, hands: 0.8, pass_block: 0.5, security: 0.8 },
      WR: { rac: 1.3, speed: 1.2, route: 1, hands: 1, contested: 0.5, block: 0.5 },
      TE: { route: 1.1, hands: 1, speed: 1, run_block: 0.8, pass_block: 0.6 },
      OL: { run_block: 1.1, pass_block: 1, discipline: 0.8 },
    },
    mix: { qb_run: 1.5, outside_run: 1.15, screen: 1.25, quick: 1.1, play_action: 0.9, inside_run: 0.9, deep: 0.95 },
  },
  pro_style: {
    id: "pro_style", side: "off", name: "Pro-style", blurb: "Under center and in the gun, tight ends and play-action; the quarterback wins from the pocket.",
    slots: {},
    values: {
      QB: { pocket: 1.3, arm: 1.2, acc_deep: 1.1, acc_short: 1.1, decisions: 1.2, speed: 0.2, security: 0.7 },
      RB: { vision: 1.1, power: 1, speed: 0.9, elusive: 0.8, pass_block: 0.9, hands: 0.6, security: 0.8 },
      WR: { route: 1.2, contested: 1, hands: 1.1, speed: 0.9, rac: 0.7, block: 0.5 },
      TE: { run_block: 1.2, route: 1.1, hands: 1, pass_block: 1, speed: 0.7 },
      OL: { run_block: 1, pass_block: 1.1, discipline: 0.9 },
    },
    mix: { play_action: 1.4, intermediate: 1.15, deep: 1.1, quick: 0.85, screen: 0.8, inside_run: 1.1, qb_run: 0.4 },
  },
  power_run: {
    id: "power_run", side: "off", name: "Power run", blurb: "Two tight ends, gap runs and play-action off them; win up front and shorten the game.",
    slots: { RB2: { label: "Fullback / H-back", pos: ["RB", "TE"] }, TE2: { label: "Tight end 2 (inline)", pos: ["TE", "OL"] } },
    values: {
      QB: { decisions: 1.4, pocket: 1.1, acc_short: 1, acc_deep: 0.9, arm: 1, speed: 0.4, security: 1.1 },
      RB: { power: 1.5, vision: 1.3, security: 1.1, speed: 0.7, elusive: 0.6, pass_block: 0.9, hands: 0.3 },
      WR: { block: 1.4, contested: 1.1, route: 1, hands: 1, speed: 0.8, rac: 0.5 },
      TE: { run_block: 1.6, pass_block: 1.1, hands: 0.8, route: 0.7, speed: 0.4 },
      OL: { run_block: 1.6, pass_block: 0.6, discipline: 0.9 },
    },
    mix: { inside_run: 1.35, outside_run: 0.85, qb_run: 0.4, play_action: 1.5, deep: 1.1, quick: 0.8, screen: 0.7, intermediate: 0.9 },
  },
  option: {
    id: "option", side: "off", name: "Option", blurb: "Flexbone or spread option: the quarterback reads the defense on every run and throws only to punish it.",
    slots: {
      RB1: { label: "Fullback (B-back)", pos: ["RB", "TE"] }, RB2: { label: "Slotback (A-back)", pos: ["RB", "WR"] },
      WR_SLOT: { label: "Slotback 2 (A-back)", pos: ["RB", "WR"] }, TE2: { label: "Tight end 2 (wing)", pos: ["TE", "RB"] },
    },
    values: {
      QB: { speed: 1.8, decisions: 1.5, security: 1.3, acc_short: 0.6, acc_deep: 0.6, arm: 0.4, pocket: 0.3 },
      RB: { power: 1.2, speed: 1.2, elusive: 1.1, vision: 1.1, security: 1.3, hands: 0.3, pass_block: 0.4 },
      WR: { block: 1.8, speed: 1.1, contested: 0.9, route: 0.7, hands: 0.8, rac: 0.6 },
      TE: { run_block: 1.6, pass_block: 0.5, route: 0.5, hands: 0.5, speed: 0.6 },
      OL: { run_block: 1.7, pass_block: 0.4, discipline: 1 },
    },
    mix: { qb_run: 2.6, outside_run: 1.2, inside_run: 0.9, deep: 1.6, play_action: 1.4, quick: 0.55, screen: 0.4, intermediate: 0.7 },
  },
  "4-2-5": {
    id: "4-2-5", side: "def", name: "4-2-5 nickel", blurb: "Four down linemen, two linebackers and a nickel back on every down; built to defend the spread.",
    slots: {},
    values: {
      DE: { pass_rush: 1.3, run_def: 0.9, shed: 0.8 },
      CB: { man: 1, zone: 1.1, speed: 1.1, ball: 0.9, tackle: 0.6 },
      S: { zone: 1.1, range: 1.1, ball: 0.9, tackle: 0.9, run_sup: 0.9 },
      LB: { speed: 1.2, coverage: 1.1, run_fit: 1, tackle: 1, blitz: 0.7 },
    },
    mix: { cover3: 1.15, cover2: 1.1, blitz: 0.95 },
  },
  "4-3": {
    id: "4-3", side: "def", name: "4-3", blurb: "Four down linemen and three linebackers; strong against the run, with a SAM linebacker where others play a nickel.",
    slots: {
      LB1: { label: "Middle linebacker (MIKE)", pos: ["LB"] }, LB2: { label: "Weak-side linebacker (WILL)", pos: ["LB"] },
      NB: { label: "Strong-side linebacker (SAM)", pos: ["LB", "S", "CB"], values: { run_fit: 1.3, tackle: 1.2, coverage: 0.9, blitz: 0.8, speed: 0.8 } },
    },
    values: {
      DT: { run_def: 1.4, shed: 1.2, pass_rush: 0.8 },
      DE: { run_def: 1.2, pass_rush: 1.1, shed: 0.9 },
      LB: { run_fit: 1.4, tackle: 1.3, speed: 0.9, coverage: 0.8, blitz: 0.8 },
    },
    mix: { load_box: 1.4, base: 1.15, cover3: 1.1, cover2: 0.85, man: 0.9 },
  },
  "3-4": {
    id: "3-4", side: "def", name: "3-4", blurb: "Three linemen who take on blocks and four linebackers; the outside backers rush the passer.",
    slots: {
      DE1: { label: "Outside linebacker (rush)", pos: ["LB", "DE"], values: { pass_rush: 1.4, blitz: 1.4, speed: 1, run_def: 0.7, shed: 0.6, coverage: 0.4, tackle: 0.6 } },
      DE2: { label: "Outside linebacker (rush) 2", pos: ["LB", "DE"], values: { pass_rush: 1.4, blitz: 1.4, speed: 1, run_def: 0.7, shed: 0.6, coverage: 0.4, tackle: 0.6 } },
      DT1: { label: "Nose tackle", pos: ["DT"], values: { run_def: 1.5, shed: 1.5, pass_rush: 0.4 } },
      DT2: { label: "Defensive end (5-tech)", pos: ["DE", "DT"], values: { run_def: 1.3, shed: 1.3, pass_rush: 0.9 } },
      LB1: { label: "Inside linebacker (MIKE)", pos: ["LB"] }, LB2: { label: "Inside linebacker (MOE)", pos: ["LB"] },
    },
    values: { LB: { run_fit: 1.3, tackle: 1.2, blitz: 1, coverage: 0.9, speed: 0.9 } },
    mix: { blitz: 1.35, man: 1.2, cover3: 1.05, cover2: 0.85, load_box: 1 },
  },
  "3-3-5": {
    id: "3-3-5", side: "def", name: "3-3-5 odd stack", blurb: "Three down linemen, three stacked linebackers and five defensive backs; speed, disguise and pressure from anywhere.",
    slots: {
      DT1: { label: "Nose tackle", pos: ["DT"], values: { shed: 1.4, run_def: 1.3, pass_rush: 0.7 } },
      DT2: { label: "Stack linebacker (SAM)", pos: ["LB", "DT", "DE"], values: { speed: 1.2, blitz: 1.2, run_fit: 1.1, tackle: 1, coverage: 0.9, run_def: 1, shed: 1, pass_rush: 0.9 } },
      LB1: { label: "Stack linebacker (MIKE)", pos: ["LB"] }, LB2: { label: "Stack linebacker (WILL)", pos: ["LB"] },
      NB: { label: "Spur (hybrid safety)", pos: ["S", "CB"], values: { zone: 1, range: 0.9, tackle: 1.1, run_sup: 1.2, ball: 0.8, man: 0.9, speed: 1 } },
    },
    values: {
      LB: { speed: 1.4, blitz: 1.2, coverage: 1.2, run_fit: 1, tackle: 1 },
      S: { range: 1.2, zone: 1.2, ball: 1, tackle: 0.9, run_sup: 0.9 },
      DE: { pass_rush: 1.1, run_def: 1, shed: 1.1 },
    },
    mix: { blitz: 1.45, cover3: 1.2, man: 0.9, load_box: 0.85, base: 0.9 },
  },
};

export const OFF_SCHEMES = Object.values(SCHEMES).filter((s) => s.side === "off").map((s) => s.id as OffScheme);
export const DEF_SCHEMES = Object.values(SCHEMES).filter((s) => s.side === "def").map((s) => s.id as DefScheme);

/**
 * Attributes a player at another position plays a slot with (a linebacker rushing from an end slot uses
 * his blitz rating for pass rush). The compiler reads the same table when such a player is in the lineup.
 */
export const STAND_IN: Partial<Record<Pos, Partial<Record<Pos, Record<string, string>>>>> = {
  // Slot position <- player position: slot attribute -> player attribute.
  DE: { LB: { pass_rush: "blitz", run_def: "run_fit", shed: "tackle" } },
  DT: { LB: { pass_rush: "blitz", run_def: "run_fit", shed: "tackle" } },
  CB: { LB: { man: "coverage", zone: "coverage", ball: "coverage", speed: "speed", tackle: "tackle" } },
  LB: { S: { run_fit: "run_sup", tackle: "tackle", coverage: "zone", blitz: "tackle", speed: "range" } },
};

/** A slot's role in a scheme. */
export function slotRole(scheme: Scheme, slot: Slot): SlotRole {
  return SCHEMES[scheme].slots[slot] ?? DEF_SLOT_ROLE(slot);
}

/** Every slot of a side with its role in the scheme, in depth chart order. */
export function schemeLayout(scheme: Scheme): { slot: Slot; role: SlotRole }[] {
  const slots = SCHEMES[scheme].side === "off" ? OFFENSE_SLOTS : DEFENSE_SLOTS;
  return slots.map((slot) => ({ slot, role: slotRole(scheme, slot) }));
}

/** The position whose attributes a slot asks for in a scheme (its first listed position). */
const slotPos = (scheme: Scheme, slot: Slot): Pos => slotRole(scheme, slot).pos[0];

/** A player's rating on a slot's attribute, reading a stand-in when he plays out of his position. */
function attrAt(p: RatedPlayer, slotP: Pos, a: string): number | undefined {
  if (p.attrs[a] != null) return p.attrs[a];
  const alt = STAND_IN[slotP]?.[p.pos]?.[a];
  return alt != null ? p.attrs[alt] : undefined;
}

export interface SchemeRating {
  /** His rating in this scheme at this slot, on the overall scale (0-99). */
  rating: number;
  /** Rating minus his overall: above 0 he fits better than his overall says. */
  fit: number;
  /** Whether the slot lists his position at all (false: he would play far out of position). */
  eligible: boolean;
}

/**
 * A player's rating in a scheme: at a slot (or, with none given, his best slot for his position on that
 * side). Weights are the slot's values, else the scheme's for his position, else the overall weights.
 */
export function schemeRating(p: RatedPlayer, scheme: Scheme, slot?: Slot): SchemeRating {
  const def = SCHEMES[scheme];
  const slots = slot ? [slot] : (def.side === "off" ? OFFENSE_SLOTS : DEFENSE_SLOTS).filter((s) => slotRole(scheme, s).pos.includes(p.pos));
  if (!slots.length) return { rating: p.ovr, fit: 0, eligible: false };
  let best: SchemeRating | null = null;
  for (const s of slots) {
    const role = slotRole(scheme, s);
    const sp = slotPos(scheme, s);
    const own = role.pos.includes(p.pos);
    const w = role.values ?? def.values[sp] ?? OVR_WEIGHTS[sp];
    let sum = 0, tw = 0;
    for (const [a, v] of Object.entries(w)) {
      const x = attrAt(p, sp, a);
      if (x != null) { sum += v * x; tw += v; }
    }
    // Out of the slot's positions he gives up what the stand-ins don't cover.
    const rating = tw ? Math.round(sum / tw - (own ? 0 : 4)) : p.ovr - 10;
    const r: SchemeRating = { rating, fit: rating - p.ovr, eligible: own };
    if (!best || r.rating > best.rating) best = r;
  }
  return best!;
}

/**
 * A scheme rating's fit in SDs. Fit runs about 1.2 rating points across FBS starters; each position's
 * average (measured across the 2026 seed's starters in their inferred schemes) is taken out, so a
 * position whose scheme weights simply read lower than its overall weights doesn't count as a poor fit.
 */
const FIT_SD = 1.2;
const FIT_CENTER: Partial<Record<Pos, number>> = { QB: 0.1, RB: 0.25, WR: 0.3, TE: 0.05, OL: -0.5, DE: 0.05, DT: 0.1, LB: -0.35, CB: 0, S: 0.1 };
export const fitSD = (p: RatedPlayer, r: SchemeRating) => Math.max(-3, Math.min(3, (r.fit - (FIT_CENTER[p.pos] ?? 0)) / FIT_SD));

export interface TeamSchemes { off: OffScheme; def: DefScheme }

/** The offense a team's real numbers point to: pass rate, tempo and quarterback runs (team_ratings.json). */
export function inferOffense(r: Pick<TeamRatings, "pass_rate" | "plays_per_game" | "scramble_rate">): OffScheme {
  const pass = r.pass_rate ?? 0.42, pace = r.plays_per_game ?? 67, qbRun = r.scramble_rate ?? 0.12;
  if (pass < 0.27) return "option";
  if (pass >= 0.47 || (pass >= 0.44 && pace >= 69.5)) return "air_raid";
  if (pass < 0.37 && pace < 66) return "power_run";
  if (pace >= 68 || qbRun >= 0.16) return "spread_rpo";
  return "pro_style";
}

/** Fronts well enough known to set by hand (the roster's shape guesses the rest). */
export const KNOWN_FRONTS: Record<string, DefScheme> = { "Iowa State": "3-3-5", Georgia: "3-4", Iowa: "4-2-5" };

/** Roughly the real FBS mix of offenses and base fronts. */
export const OFFENSE_SHARE: [OffScheme, number][] = [["spread_rpo", 0.4], ["pro_style", 0.25], ["air_raid", 0.17], ["power_run", 0.15], ["option", 0.03]];
export const FRONT_SHARE: [DefScheme, number][] = [["4-2-5", 0.45], ["3-4", 0.22], ["4-3", 0.18], ["3-3-5", 0.15]];

function pickShare<T>(rows: [T, number][], u: number): T {
  for (const [x, w] of rows) { if (u < w) return x; u -= w; }
  return rows[rows.length - 1][0];
}

/** Schemes for coaches nobody has on record (FCS staffs, new hires), drawn at the real mix. */
export function drawSchemes(seed: number, year: number, teamId: number): TeamSchemes {
  const rng = new Rng(mixSeed(seed, year, teamId, "schemes"));
  return { off: pickShare(OFFENSE_SHARE, rng.random()), def: pickShare(FRONT_SHARE, rng.random()) };
}

/**
 * Every team's front from its roster's shape: more linebackers and fewer tackles points to a 3-4, more
 * linebackers and tackles to a 4-3, more safeties and fewer tackles to a 3-3-5. Teams take fronts in order
 * of how clearly they point to one, until each front has its share; seeded noise breaks the rest.
 */
export function inferFronts(seed: number, rosters: Record<number, RatedPlayer[]>): Record<number, DefScheme> {
  const ids = Object.keys(rosters).map(Number).filter((id) => rosters[id].length);
  const shape = new Map<number, { lb: number; s: number; dt: number }>();
  for (const id of ids) {
    const d = rosters[id].filter((p) => ["DE", "DT", "LB", "CB", "S"].includes(p.pos));
    const n = Math.max(1, d.length), c = (pos: Pos) => d.filter((p) => p.pos === pos).length / n;
    shape.set(id, { lb: c("LB"), s: c("S"), dt: c("DT") });
  }
  const stat = (k: "lb" | "s" | "dt") => {
    const xs = ids.map((id) => shape.get(id)![k]), m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length)) || 1;
    return (id: number) => (shape.get(id)![k] - m) / sd;
  };
  const LB = stat("lb"), S = stat("s"), DT = stat("dt");
  const score: Record<DefScheme, (id: number) => number> = {
    "3-4": (id) => LB(id) - DT(id), "4-3": (id) => LB(id) + DT(id) - S(id), "3-3-5": (id) => S(id) - DT(id), "4-2-5": () => 0.5,
  };
  const quota = new Map(FRONT_SHARE.map(([f, sh]) => [f, Math.round(sh * ids.length)]));
  const rows: { id: number; f: DefScheme; v: number }[] = [];
  for (const id of ids) {
    const rng = new Rng(mixSeed(seed, id, "front"));
    for (const [f] of FRONT_SHARE) rows.push({ id, f, v: score[f](id) + 0.8 * rng.gauss(0, 1) });
  }
  rows.sort((a, b) => b.v - a.v || a.id - b.id);
  const out: Record<number, DefScheme> = {};
  for (const r of rows) {
    if (out[r.id] || (quota.get(r.f) ?? 0) <= 0) continue;
    out[r.id] = r.f;
    quota.set(r.f, quota.get(r.f)! - 1);
  }
  for (const id of ids) out[id] ??= "4-2-5";
  return out;
}

/** Throws unless `x` is a scheme for that side. */
export function checkScheme(side: "off" | "def", x: unknown): Scheme {
  if (typeof x !== "string" || !(x in SCHEMES) || SCHEMES[x as Scheme].side !== side) throw new Error(`unknown ${side === "off" ? "offensive" : "defensive"} scheme`);
  return x as Scheme;
}
