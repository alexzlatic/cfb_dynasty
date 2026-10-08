import { Rng } from "@cfb/engine";
import { mixSeed } from "./hash.ts";
import type { Pos } from "./players.ts";

/**
 * How schools and players value each other (M3). Recruiting offers, portal bids, renewals and NIL deals
 * are all a match between two views, both built on the M2 market value and both working from scouted
 * ratings, not true ones:
 *
 *   - a school's view of a player: his value x the school's need at his position x scheme fit x its style;
 *   - a player's view of a school: a score over each offer (money, playing time, development, fit and
 *     chemistry, winning, home, loyalty), weighted by his hidden personality. He takes the best one, with
 *     some noise (a logit choice).
 *
 * The home, prestige, winning and power-conference weights are fit to real 2024 and 2025 commitments
 * (importer/fit_choice.py, data/valuation/choice_fit.json): among the schools whose class spanned his
 * rating, a recruit's real school was the model's top pick 20% of the time (chance: 3%). Distance is the
 * biggest single pull. Money and playing time aren't in public data; their weights are set here and
 * checked against the M3 gates.
 */

// ---- a player's personality ------------------------------------------------------------------------
export type Factor = "money" | "playing" | "development" | "fit" | "winning" | "home" | "loyalty";
export const FACTORS: Factor[] = ["money", "playing", "development", "fit", "winning", "home", "loyalty"];
/** How much each factor counts for him, around 1 (hidden; scouts and conversations reveal hints). */
export type Persona = Record<Factor, number> & { kind: PersonaKind };
export type PersonaKind = "mercenary" | "developer" | "homebody" | "winner" | "steady";
export const PERSONA_WORDS: Record<PersonaKind, string> = {
  mercenary: "Follows the money", developer: "Wants to get better", homebody: "Close to home", winner: "Wants to win now", steady: "Loyal and steady",
};
/** What each kind leans on (multipliers on the base weights); the shares are of all players. */
const KINDS: { kind: PersonaKind; share: number; lean: Partial<Record<Factor, number>> }[] = [
  { kind: "mercenary", share: 0.2, lean: { money: 1.7, loyalty: 0.5, development: 0.8 } },
  { kind: "developer", share: 0.2, lean: { development: 1.7, playing: 1.3, money: 0.8 } },
  { kind: "homebody", share: 0.2, lean: { home: 1.8, loyalty: 1.3, winning: 0.8 } },
  { kind: "winner", share: 0.2, lean: { winning: 1.8, playing: 0.8, home: 0.7 } },
  { kind: "steady", share: 0.2, lean: { loyalty: 1.8, fit: 1.3, money: 0.8 } },
];

/** A player's personality, the same every time for the same league seed (it never changes with results). */
export function persona(seed: number, pid: number): Persona {
  const rng = new Rng(mixSeed(seed, pid, "persona"));
  let u = rng.random(), k = KINDS[KINDS.length - 1];
  for (const x of KINDS) { if (u < x.share) { k = x; break; } u -= x.share; }
  const out = { kind: k.kind } as Persona;
  // Each factor also varies on its own, so two mercenaries aren't identical.
  for (const f of FACTORS) out[f] = Math.round((k.lean[f] ?? 1) * Math.exp(rng.gauss(0, 0.25)) * 100) / 100;
  return out;
}

// ---- a school's style ------------------------------------------------------------------------------
export type Style = "develop" | "balanced" | "portal" | "win_now";
export const STYLE_WORDS: Record<Style, string> = {
  develop: "Build and develop", balanced: "Balanced", portal: "Portal heavy", win_now: "Win now, spend big",
};
/** How a style splits a school's money and board between high school recruits, transfers and keeping its own. */
export const STYLE_MIX: Record<Style, { recruits: number; transfers: number; retain: number; /** how far ahead it values potential over readiness */ patience: number }> = {
  develop: { recruits: 1.15, transfers: 0.8, retain: 1.2, patience: 1.3 },
  balanced: { recruits: 1, transfers: 1, retain: 1, patience: 1 },
  portal: { recruits: 0.85, transfers: 1.2, retain: 0.85, patience: 0.75 },
  win_now: { recruits: 0.9, transfers: 1.15, retain: 1, patience: 0.6 },
};

/** A school's style from its real newcomers (importer/build_styles.py), or balanced without data. */
export function styleOf(styles: Record<string, { style: Style }> | undefined, teamId: number): Style {
  return styles?.[teamId]?.style ?? "balanced";
}

// ---- a school's view of a player -------------------------------------------------------------------
/** Starting jobs a roster needs by position, and how deep a healthy room runs. */
export const STARTERS: Record<Pos, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DE: 2, DT: 2, LB: 3, CB: 2, S: 2, K: 1, P: 1, LS: 1 };
export const ROOM: Record<Pos, number> = { QB: 4, RB: 4, WR: 9, TE: 4, OL: 15, DE: 7, DT: 7, LB: 8, CB: 7, S: 6, K: 2, P: 2, LS: 1 };

/**
 * How much a school needs a position next season, about 0.6 (full) to 1.6 (empty): the players it
 * keeps at that position against a healthy room, counting starters-to-be double.
 */
export function need(pos: Pos, returning: { ovr: number }[], starterBar: number): number {
  const room = ROOM[pos], jobs = STARTERS[pos];
  const good = returning.filter((p) => p.ovr >= starterBar).length;
  const gapJobs = Math.max(0, jobs - good) / jobs;
  const gapRoom = Math.max(0, room - returning.length) / room;
  return Math.round(Math.max(0.6, Math.min(1.6, 0.75 + 0.55 * gapJobs + 0.3 * gapRoom)) * 100) / 100;
}

/**
 * What a player is worth to one school: his market value, scaled by its need at his position, how he fits
 * its scheme (fit about -1 to 1), and its style (a develop school pays more for a young player's upside, a
 * win-now school for readiness). `source` says whether he'd come from high school, the portal, or is already
 * on the roster.
 */
export function schoolValue(o: { value: number; need: number; fit: number; style: Style; source: "recruit" | "transfer" | "own"; years: number }): number {
  const mix = STYLE_MIX[o.style];
  const src = o.source === "recruit" ? mix.recruits : o.source === "transfer" ? mix.transfers : mix.retain;
  // Patience: a young player's worth grows for a patient school; an old one's shrinks.
  const age = Math.pow(mix.patience, Math.max(-1, Math.min(1, (2 - o.years) / 2)));
  return Math.round(o.value * o.need * (1 + 0.25 * o.fit) * src * age);
}

// ---- a player's view of a school -------------------------------------------------------------------
/** Weights fit to real commitments (choice_fit.json, 2024-2025 high school recruits). */
export const RECRUIT_FIT = { prestige: 0.289, prestige_x_quality: -0.165, log_distance: -1.092, home_state: 0.74, win_pct: 0.257, power: 0.253, power_x_quality: 0.393 };
/** Weights the data can't show, set by design: money as log(offer / value), playing time as the chance he starts next year. */
export const SET_WEIGHTS = { money: 1.0, playing: 1.2, development: 0.8, fit: 0.5, chemistry: 0.4, loyalty: 0.8 };

export interface SchoolOffer {
  team_id: number;
  /** 0-100. */
  prestige: number;
  power: boolean;
  /** Last season (0-1). */
  win_pct: number;
  /** Miles from his home (recruits) or his current school (transfers). */
  miles: number;
  home_state: boolean;
  /** Dollars a year, revenue share and NIL together; 0 when no money is on the table yet. */
  money: number;
  /** His chance to start next season there, 0-1. */
  start_chance: number;
  /** The staff's development record and facilities, about -1 to 1. */
  development: number;
  /** His scheme fit there and the team's chemistry, about -1 to 1. */
  fit: number;
  chemistry: number;
  /** He is already on this roster (loyalty and morale apply). */
  current?: boolean;
  /** His M2 morale when current (about -2 to 0.5). */
  morale?: number;
}

/**
 * How much a player likes one school's offer. `quality` is his rating in standard units ((composite -
 * 0.86) / 0.04; about +3 for a five-star, 0 for a high three-star). Money counts against his value: an
 * offer at his value scores 0 on money, double his value +0.69 (times his money weight).
 */
export function offerScore(o: SchoolOffer, p: { value: number; quality: number; persona: Persona }): number {
  const w = p.persona, f = RECRUIT_FIT, s = SET_WEIGHTS;
  const pr = o.prestige / 100, pw = o.power ? 1 : 0, q = p.quality;
  let u = 0;
  u += w.winning * (f.prestige * pr + f.prestige_x_quality * pr * q + f.win_pct * o.win_pct + f.power * pw + f.power_x_quality * pw * q);
  u += w.home * (f.log_distance * Math.log1p(o.miles / 50) + f.home_state * (o.home_state ? 1 : 0));
  if (p.value > 0) u += w.money * s.money * Math.log(Math.max(0.05, o.money / p.value) + 0.05);
  u += w.playing * s.playing * o.start_chance;
  u += w.development * s.development * o.development;
  u += w.fit * (s.fit * o.fit + s.chemistry * o.chemistry);
  if (o.current) u += w.loyalty * s.loyalty * (1 + Math.max(-1, o.morale ?? 0));
  return u;
}

/** A logit choice: each option's chance from its score (temperature 1). */
export function choiceChances(scores: number[]): number[] {
  const m = Math.max(...scores);
  const e = scores.map((x) => Math.exp(x - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

/** Pick one option by its chance, from a seeded draw in [0, 1). */
export function choose(scores: number[], u: number): number {
  const c = choiceChances(scores);
  for (let i = 0; i < c.length; i++) { if (u < c[i]) return i; u -= c[i]; }
  return c.length - 1;
}

/** A player's top schools: the best-scoring `n`, with his personality and a little noise of his own. */
export function topSchools(offers: SchoolOffer[], p: { id: number; value: number; quality: number; persona: Persona }, seed: number, n = 8): { team_id: number; score: number }[] {
  // Noise per school, so the list doesn't depend on the order offers arrive in.
  const noise = (t: number) => new Rng(mixSeed(seed, p.id, t, "top-schools")).gauss(0, 0.5);
  return offers.map((o) => ({ team_id: o.team_id, score: Math.round((offerScore(o, p) + noise(o.team_id)) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score || a.team_id - b.team_id).slice(0, n);
}

/** Miles between two points. */
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 2 * 3959 * Math.asin(Math.sqrt(h));
}
