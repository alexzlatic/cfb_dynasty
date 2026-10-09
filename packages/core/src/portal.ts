import type { Persona } from "./valuation.ts";

/**
 * Keeping players and the transfer portal (M3 step 5). Every winter each player weighs staying at his
 * school against what the market would give him elsewhere, with the same things recruits weigh (money
 * against his value, his chance to start, development, scheme fit, winning, home) plus loyalty and morale,
 * weighted by his hidden personality. The difference is his chance to enter the portal in January.
 *
 * You see it coming all season (the portal watch), get first chance to fix it in December's renewal
 * talks (money problems are the easiest: pay him), and bid against every other school for the players
 * who leave. Talks work like OOTP's contract talks without arbitration: you make an offer, he answers in a
 * day or two (stays, or declines with his number), and with no deal by the portal he enters it. See
 * docs/portal.md.
 */

export type Reason = "pay" | "playing" | "development" | "fit" | "winning" | "home" | "unhappy";
export const REASON_WORDS: Record<Reason, string> = {
  pay: "Pay", playing: "Playing time", development: "Development", fit: "Scheme fit", winning: "Winning", home: "Closer to home", unhappy: "Unhappy here",
};

/** How likely a player looks to leave: the portal watch. */
export type Watch = "settled" | "restless" | "shopping" | "gone";
export const WATCH_WORDS: Record<Watch, string> = { settled: "Settled", restless: "Restless", shopping: "Shopping", gone: "Likely gone" };
export const watchOf = (p: number): Watch => (p < SETTLED ? "settled" : p < 0.3 ? "restless" : p < 0.6 ? "shopping" : "gone");
/** A player this unlikely to enter is settled. */
export const SETTLED = 0.12;
/** In the talks he commits to stay for the pay that brings his chance to enter this low (his walk-away number). */
export const COMMIT = 0.25;

/** Everything a player weighs about staying against leaving (built by the season from rosters, schools and money). */
export interface StayContext {
  /** His market value next season (dollars a year) and what staying pays him next season. */
  value: number;
  pay: number;
  /** What schools at the level he would land at pay for value (their pay over their roster's value), and how many would want him (1 to 1.4). */
  ratio_away: number;
  demand: number;
  /** His chance to start next season here, and at the level he would land at (0-1). */
  start_here: number;
  start_away: number;
  /** Development here against a typical school (about -1 to 1). */
  dev_here: number;
  /** His scheme fit here, in SDs (a typical school is 0). */
  fit: number;
  /** Winning and exposure here and at the level he would land at (recruits' prestige, record and conference terms). */
  win_here: number;
  win_away: number;
  /** Distance from home here and at a typical new school (recruits' distance and home-state terms). */
  home_here: number;
  home_away: number;
  /** His morale (about -2 to 0.5). */
  morale: number;
  /** Seasons already in college. */
  years: number;
  /** Power, Group of Five or FCS: his level now, and the level he'd land at. */
  tier: 0 | 1 | 2;
  tier_away: 0 | 1 | 2;
  /** His deal runs into next season (leaving means a buyout). */
  contract?: boolean;
  /** He signed a multi-year deal with you (he agreed to it): walking away from it is a bigger step. */
  locked?: boolean;
  /** Moving would cost him a season (a second transfer under the Protect College Sports Act). */
  costs_season?: boolean;
  /** You promised him a starting job. */
  promise?: boolean;
  /** His own pull toward or away from a move this year (a standard normal draw). */
  noise: number;
}

/** Score weights for college players (recruits' weights where the factor is shared; valuation.ts). */
export const STAY_W = { money: 2.0, playing: 1.6, development: 0.6, fit: 0.35, winning: 0.6, home: 0.35, loyalty: 0.8 };
/**
 * What keeps a player put whatever the rest says (the hassle and risk of a move), by seasons in college.
 * Calibrated to the January 2026 portal (scripts/portal-real.ts): 16% of first-year power-conference
 * players entered, 28% of second- and third-year players, 21% of fourth-year players.
 */
export const FRICTION = [0.3, -0.62, -0.05, 0.58, 0.95];
/** Group of Five and FCS players enter a little less (18% against 22%): fewer places to go up to. */
export const TIER_FRICTION = [0, 1.3, 1.3];
/** A player with nowhere better to play (little chance to start at the level he'd land at) mostly stays put. */
export const NOWHERE = 0.8;
/** Dropping a level (the exposure, the life and the money of a power program) holds players back, per level. */
export const TIER_DROP = 0.9;
/** What a multi-year deal he agreed to adds to staying (on top of any deal running into next season). */
export const LOCKED = 1.5;
/** Spread of a player's own pull each year. */
export const NOISE_SD = 0.9;
/** Pay beyond this many times his value never keeps anyone: money can't fix it. */
export const MONEY_CAP = 2.5;

export interface StayResult {
  /** Staying's edge over leaving (higher stays); his chance to enter; each factor's part of the edge. */
  net: number;
  p: number;
  parts: Record<Reason, number>;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));
const moneyTerm = (pay: number, value: number, awayRatio: number, demand: number) =>
  Math.log(Math.max(0, pay) / value + 0.05) - Math.log(awayRatio * demand + 0.05);

/** A player's stay-or-go score: staying's edge over leaving and his chance to enter the portal. */
export function stayScore(c: StayContext, w: Pick<Persona, "money" | "playing" | "development" | "fit" | "winning" | "home" | "loyalty">): StayResult {
  const W = STAY_W;
  const start = c.promise ? Math.max(c.start_here, 0.9) : c.start_here;
  const parts: Record<Reason, number> = {
    pay: c.value > 0 ? w.money * W.money * moneyTerm(c.pay, c.value, c.ratio_away, c.demand) : 0,
    playing: w.playing * W.playing * (start - c.start_away),
    development: w.development * W.development * c.dev_here,
    fit: w.fit * W.fit * c.fit,
    winning: w.winning * W.winning * (c.win_here - c.win_away),
    home: w.home * W.home * (c.home_here - c.home_away),
    unhappy: w.loyalty * W.loyalty * Math.max(-1, Math.min(0.5, c.morale)),
  };
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  const friction = FRICTION[Math.max(0, Math.min(FRICTION.length - 1, Math.floor(c.years)))] + TIER_FRICTION[c.tier]
    + 0.5 * w.loyalty * W.loyalty + (c.contract ? 1 : 0) + (c.locked ? LOCKED : 0) + (c.costs_season ? 1.5 : 0) + NOWHERE * Math.max(0, 1 - c.start_away / 0.3)
    + TIER_DROP * Math.max(0, c.tier_away - c.tier);
  const net = sum + friction + NOISE_SD * c.noise;
  return { net, p: sigmoid(-net), parts };
}

/**
 * The pay next season at which his chance to enter falls to `p` (null when no pay up to MONEY_CAP times his
 * value gets there: money won't fix it). The talks use p = COMMIT: the least he'll commit to stay for.
 */
export function payFor(c: StayContext, w: Persona, p: number): number | null {
  if (c.value <= 0) return stayScore(c, w).p <= p ? 0 : null;
  const now = stayScore(c, w);
  const rest = now.net - now.parts.pay;
  const need = logit(1 - p) - rest;
  const x = Math.exp(need / (w.money * STAY_W.money) + Math.log(c.ratio_away * c.demand + 0.05)) - 0.05;
  const pay = Math.max(0, x * c.value);
  if (pay > MONEY_CAP * c.value) return null;
  return roundPay(pay);
}

export const roundPay = (x: number) => (x >= 100_000 ? Math.round(x / 5_000) * 5_000 : Math.round(x / 1_000) * 1_000);

/** The reasons he'd leave, worst first: factors pulling him away by a meaningful amount. */
export function reasonsOf(r: StayResult, n = 3): { reason: Reason; weight: number }[] {
  return (Object.entries(r.parts) as [Reason, number][]).filter(([, v]) => v < -0.15).sort((a, b) => a[1] - b[1]).slice(0, n)
    .map(([reason, v]) => ({ reason, weight: Math.round(-v * 100) / 100 }));
}

// ---- renewal talks ---------------------------------------------------------------------------------
export type TalkStatus = "staying" | "raise" | "testing" | "leaving" | "contract" | "nfl" | "graduating";
export const STATUS_WORDS: Record<TalkStatus, string> = {
  staying: "Staying", raise: "Wants a raise", testing: "Testing the market", leaving: "Leaving", contract: "Under contract", nfl: "Weighing the NFL", graduating: "Out of eligibility",
};

/** One of your players' renewal talks. */
export interface Talk {
  pid: number;
  status: TalkStatus;
  /** What he asks for next season, and the least he'd stay for (hidden; your staff shows a range). Null: money won't keep him. */
  ask: number | null;
  walk: number | null;
  /** Rounds of offers left before he stops talking. */
  patience: number;
  /** Your offer waiting on his answer (he answers on `answer`), and the number he gave when he last declined. */
  offer?: { amount: number; years: number; made: string; answer: string };
  counter?: number;
  /** The deal (signed), or what happened. */
  deal?: { amount: number; years: number; via: "rule" | "talks" | "staff" };
  outcome?: "signed" | "let_go" | "portal" | "stayed";
  /** A renewal your standing rule made that you haven't confirmed yet (your staff confirms it when the portal opens). */
  pending?: boolean;
  /** You'll decide yourself (the staff plan doesn't apply on December 31). */
  mine?: boolean;
  /** The staff's plan for him: renew at his ask, offer up to an amount, or let him go. */
  plan?: { kind: "renew" | "offer" | "let_go" | "needs_you"; amount?: number };
  /** Who he'd compare his pay with, and what they make (the market: their median). */
  market?: number;
}

/** Your standing rule for renewals (defaults are the design's). */
export interface RenewalRule {
  /** Re-sign everyone asking up to this share of his value. */
  auto_up_to: number;
  /** For the rest, your staff offers up to this share of his value. */
  offer_up_to: number;
  /** Let reserves go when they ask more than this and your staff doesn't project them to play. */
  release_over: number;
  /** Keep renewals under this share of next season's roster budget. */
  budget_share: number;
}
export const DEFAULT_RULE: RenewalRule = { auto_up_to: 1.1, offer_up_to: 1, release_over: 25_000, budget_share: 0.8 };

/**
 * What a player who's happy to stay asks to be renewed for: roughly what he's paid now, nudged by his season.
 * `pct` is where his production ranks among players at his position (0 worst, 1 best; null when he didn't
 * play), and an All-American or conference player of the year asks a little more.
 */
export function renewalNudge(pct: number | null, honor: "all_american" | "poy" | null = null): number {
  const base = pct == null ? 0.97 : 0.95 + 0.13 * Math.max(0, Math.min(1, pct));
  return Math.round((base + (honor === "all_american" ? 0.05 : honor === "poy" ? 0.03 : 0)) * 1000) / 1000;
}

// ---- deal length ------------------------------------------------------------------------------------
/**
 * How much more a year he wants for each season beyond one. Most players would rather sign for a year and
 * test the market again (about 8% a year); money-first players want much more to give that up, and
 * players who value loyalty or home sign longer deals for little or nothing extra.
 */
export function lengthPremium(w: Pick<Persona, "money" | "development" | "loyalty" | "home">): number {
  const x = 0.08 + 0.1 * (w.money - 1) + 0.05 * (w.development - 1) - 0.08 * (w.loyalty - 1) - 0.04 * (w.home - 1);
  return Math.round(Math.max(-0.03, Math.min(0.3, x)) * 1000) / 1000;
}

/** The longest deal he'll sign: players who want much more for a longer deal won't sign one at all. */
export function maxYears(w: Pick<Persona, "money" | "development" | "loyalty" | "home">): number {
  const x = lengthPremium(w);
  return x >= 0.17 ? 1 : x >= 0.12 ? 2 : 4;
}

/** His number for a deal of `years` seasons, from his one-year number. */
export const askFor = (oneYear: number, w: Pick<Persona, "money" | "development" | "loyalty" | "home">, years: number) =>
  roundPay(oneYear * (1 + lengthPremium(w) * Math.max(0, years - 1)));

/** Rounds of patience by personality. */
export const patienceOf = (w: Persona) => (w.kind === "mercenary" ? 2 : w.kind === "steady" ? 4 : 3);

/** His opening ask from his walk-away number: money-first players push hardest. */
export function openingAsk(walk: number, w: Persona): number {
  return roundPay(walk * Math.min(1.3, Math.max(1.03, 1.1 + 0.15 * (w.money - 1))));
}

/** His answer to an offer: he stays at or above his walk-away number; else he declines and names his number (part of the way down), losing patience (more for a lowball). */
export function respond(t: Pick<Talk, "ask" | "walk" | "patience" | "counter">, offer: number, years = 1, w?: Persona): { accepted: boolean; counter: number | null; patience: number; insulted: boolean; too_long?: number } {
  if (t.walk == null || t.ask == null) return { accepted: false, counter: null, patience: 0, insulted: false };
  // A longer deal than he'll sign: he says so, and it costs no patience.
  if (w && years > maxYears(w)) return { accepted: false, counter: t.counter ?? t.ask, patience: t.patience, insulted: false, too_long: maxYears(w) };
  // For a longer deal his numbers rise by his premium for each season beyond one.
  if (w && years > 1) {
    const k = (x: number) => askFor(x, w, years);
    const r = respond({ ask: k(t.ask), walk: k(t.walk), patience: t.patience, counter: t.counter != null ? k(t.counter) : undefined }, offer);
    // His counter is always stated as a one-year number.
    return { ...r, counter: r.counter != null ? roundPay(r.counter / (1 + lengthPremium(w) * (years - 1))) : null };
  }
  if (offer >= t.walk) return { accepted: true, counter: null, patience: t.patience, insulted: false };
  const insulted = offer < 0.7 * t.walk;
  const was = t.counter ?? t.ask;
  const counter = roundPay(Math.max(t.walk, t.walk + 0.6 * (was - t.walk)));
  return { accepted: false, counter, patience: Math.max(0, t.patience - (insulted ? 2 : 1)), insulted };
}

/** Days he takes to answer an offer (one or two). */
export const answerDays = (seed: number, pid: number, n: number) => 1 + (Math.abs(Math.floor(hashU(seed, pid, n) * 2)) % 2);
const hashU = (...xs: number[]) => { let h = 0x2545f491; for (const x of xs) { h = Math.imul(h ^ (x >>> 0), 0x9e3779b1) >>> 0; h ^= h >>> 15; } return (h >>> 0) / 4294967296; };

// ---- the portal window -----------------------------------------------------------------------------
export interface PortalOffer { team_id: number; amount: number; years: number; date: string }
export interface PortalEntry {
  pid: number;
  /** His school, the day he entered, and why he left (public once he's in). */
  from: number;
  entered: string;
  reasons: string[];
  /** What he asks for (dollars a year). */
  ask: number;
  offers: PortalOffer[];
  /** Your pitch calls (each builds his interest in your school). */
  pitches?: number;
  status: "open" | "committed" | "none";
  to?: number;
  committed?: string;
}
export interface PortalState {
  year: number;
  entries: PortalEntry[];
  /** Your talks this week (for the limit) and players you've talked to this season (their real reasons are known). */
}

/** Talks you can have with players in a week. */
export const TALKS_PER_WEEK = 5;
/** Pitch calls a day during the window. */
export const PITCHES_PER_DAY = 6;

/** A player's chance to commit on a given day with offers in hand: slow at first, faster as the window runs. */
export function transferHazard(daysIn: number, bestShortfall: number): number {
  const base = Math.min(0.45, 0.1 + 0.03 * daysIn);
  // Holding out for something better while his best offer is well short of what he expected.
  return bestShortfall > 1 ? base * 0.5 : base;
}
