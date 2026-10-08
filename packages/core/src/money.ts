import type { Pos, RatedPlayer } from "./players.ts";
import type { Team } from "./types.ts";

/**
 * Money (M2). Two kinds of money reach players, kept apart the way the House settlement does:
 *
 *   - revenue share: the school pays players directly, every school's total across all sports under a
 *     cap ($21.5M in 2026-27, about 4% more each year). Football gets most of it (about three quarters).
 *     These are contracts, by player, that you sign for your team.
 *   - collective NIL: boosters' money, on top (see collective.ts).
 *
 * A player's value is what the national market pays a player like him in a year (revenue share and NIL
 * together): it sets his asking price, and what he compares his pay with.
 */

/** The revenue-share cap for all sports at a school, by the year a season starts: $20.5M in 2025-26, $21.5M in 2026-27, then 4% a year. */
export function revenueCap(year: number): number {
  return year <= 2025 ? 20_500_000 : Math.round(21_500_000 * Math.pow(1.04, year - 2026) / 1000) * 1000;
}

/**
 * The Protect College Sports Act's retention fund (passed by the Senate in September 2026): a school may
 * pay up to $22.5M a year above the cap to athletes who have completed a season there. Football's share
 * is the same as of the cap.
 */
export const RETENTION_FUND = 22_500_000;

/**
 * What a football program spends on its roster in a year, revenue share and program-controlled NIL
 * together, relative to 2026 (The Athletic's 2026 estimates): 2025 budgets were about a fifth smaller,
 * and they grow with the cap after.
 */
export function rosterBudgetYear(year: number): number {
  return year <= 2025 ? 0.8 : Math.pow(1.04, year - 2026);
}

/** Football's share of the cap at a school that spends all of it (most give football about three quarters). */
export const FOOTBALL_SHARE = 0.75;

/**
 * What a starter at the position earns at the median (z = 0, a 75 overall) and at the 90th percentile
 * (z = 1.28), and the most anyone is paid, in a year. From reported 2025 deals (On3, The Athletic): a
 * starting P4 quarterback is worth well over a million, an elite one several; specialists little.
 */
const MARKET: Record<Pos, [mid: number, p90: number, max: number]> = {
  QB: [900_000, 3_000_000, 6_500_000],
  WR: [320_000, 1_100_000, 2_500_000],
  OL: [320_000, 1_000_000, 2_200_000],
  DE: [380_000, 1_350_000, 3_000_000],
  DT: [310_000, 1_000_000, 2_200_000],
  CB: [310_000, 1_000_000, 2_000_000],
  RB: [220_000, 750_000, 1_600_000],
  S: [220_000, 700_000, 1_400_000],
  LB: [220_000, 700_000, 1_400_000],
  TE: [170_000, 550_000, 1_200_000],
  K: [60_000, 150_000, 300_000],
  P: [50_000, 120_000, 250_000],
  LS: [25_000, 50_000, 100_000],
};

/** What recruiting hype is worth to a young player who hasn't proven it yet, by stars. */
const HYPE: Record<number, number> = { 5: 700_000, 4: 180_000, 3: 35_000 };
/** How much of the hype is left, by seasons already in college. */
const HYPE_FADE = [1, 0.6, 0.3];

const round = (x: number) => (x >= 100_000 ? Math.round(x / 10_000) * 10_000 : Math.round(x / 1000) * 1000);

/** A player's market value in dollars a year. */
export function playerValue(p: Pick<RatedPlayer, "pos" | "ovr" | "stars" | "years">): number {
  const [mid, p90, max] = MARKET[p.pos];
  const z = (p.ovr - 75) / 8;
  const raw = mid * Math.exp((Math.log(p90 / mid) / 1.28) * z);
  // Soft ceiling: the best players approach the position's top deals without passing them.
  const perf = max * Math.tanh(raw / max);
  const hype = (HYPE[p.stars ?? 0] ?? 0) * (p.pos === "QB" ? 2 : 1) * (HYPE_FADE[p.years] ?? 0);
  // Walk-ons and deep reserves get little or nothing.
  const v = Math.max(perf, hype);
  return v < 10_000 ? 0 : round(v);
}

/** Seasons of eligibility a player has left this year, counting this one (contracts can't run past it). */
export function eligibilityLeft(p: Pick<RatedPlayer, "years">): number {
  return Math.max(1, Math.min(4, 5 - p.years));
}

const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);

/**
 * Football's revenue-share budget for a school this year. Every power-conference school (and Notre Dame)
 * pays the full cap; other schools pay what they can afford, which grows with their program's size.
 * Until real athletic department finances are loaded this is estimated from conference and prestige.
 */
export function footballPool(t: Pick<Team, "conference" | "school" | "level" | "prestige">, year: number, rosterBudget?: number | null): number {
  const full = revenueCap(year) * FOOTBALL_SHARE;
  if (t.level !== "fbs") return 0;
  // A school whose whole roster budget is smaller than the cap can't give football all of it (Boston College).
  if (rosterBudget) return round(Math.min(full, 0.85 * rosterBudget * rosterBudgetYear(year)));
  if (P4.has(t.conference) || t.school === "Notre Dame") return round(full);
  return round(full * Math.max(0.08, Math.min(0.6, 0.06 + 0.5 * (t.prestige ?? 0) / 100)));
}

/** A revenue-share contract: dollars a year, for `years` seasons from `start` (inclusive). */
export interface Contract {
  amount: number;
  years: number;
  start: number;
  /** The part of `amount` paid from the retention fund (Protect College Sports Act rules). */
  retention?: number;
  /** A multi-year deal the player agreed to: he doesn't renegotiate until it ends. */
  locked?: boolean;
}

/** A player has completed a season in college (the season also checks he wasn't a transfer who just arrived: Season.returningHere). */
export const returning = (p: Pick<RatedPlayer, "years">) => p.years >= 1;

/** Contracts in force in `year`. */
export function activeContract(c: Contract | undefined, year: number): Contract | null {
  return c && year >= c.start && year < c.start + c.years ? c : null;
}

/**
 * How an athletic department spends football's budget: every player gets the same share of his value
 * (the budget over the roster's total value), never more than his value, and the money a capped player
 * leaves goes to the rest. Deals run through the player's eligibility, up to two years. Under the
 * Protect College Sports Act a retention fund then goes to players who have completed a season at the
 * school, the same way, toward what's left of their value.
 */
export function aiContracts<P extends Pick<RatedPlayer, "id" | "pos" | "ovr" | "stars" | "years">>(roster: P[], pool: number, year: number, retention = 0, isReturning: (p: P) => boolean = returning): Record<number, Contract> {
  const vals = roster.map((p) => ({ p, v: playerValue(p) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v || a.p.id - b.p.id);
  const out: Record<number, Contract> = {};
  const share = (xs: { p: (typeof vals)[number]["p"]; v: number }[], budget: number, give: (id: number, amount: number) => void) => {
    let left = budget, total = xs.reduce((a, x) => a + x.v, 0);
    // Pay from the cheapest up, so a share that would overpay someone is capped and the rest spreads.
    for (let i = xs.length - 1; i >= 0; i--) {
      const { p, v } = xs[i];
      const amount = Math.floor(Math.min(v, total > 0 ? left * v / total : 0) / 1000) * 1000;
      total -= v;
      if (amount <= 0) continue;
      left -= amount;
      give(p.id, amount);
    }
  };
  const byId = new Map(vals.map((x) => [x.p.id, x.p]));
  share(vals, pool, (id, amount) => { out[id] = { amount, years: Math.min(2, eligibilityLeft(byId.get(id)!)), start: year }; });
  if (retention > 0) {
    const gaps = vals.filter((x) => isReturning(x.p)).map((x) => ({ p: x.p, v: x.v - (out[x.p.id]?.amount ?? 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v || a.p.id - b.p.id);
    share(gaps, retention, (id, amount) => {
      const c = out[id] ?? { amount: 0, years: Math.min(2, eligibilityLeft(byId.get(id)!)), start: year };
      out[id] = { ...c, amount: c.amount + amount, retention: amount };
    });
  }
  return out;
}
