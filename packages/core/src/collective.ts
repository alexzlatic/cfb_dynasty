import type { Pos } from "./players.ts";
import type { Team } from "./types.ts";

/**
 * Collectives (M2): boosters' NIL money, on top of the school's revenue share. Each school's collective
 * has a budget that grows with winning and donor mood. It makes deals with players, filling the gap
 * between what the school pays a player and what he's worth, and steers toward the positions the head
 * coach asks for. A rich collective with money left buys stars beyond their value, but every deal goes
 * through a fair-market-value review (the College Sports Commission's NIL Go clearinghouse), which only
 * stops egregious deals.
 */

export interface CollectiveState {
  /** What boosters give in a normal year, and what is left to spend this year. */
  base: number;
  reserve: number;
  /** Positions the head coach asked the collective to spend on (the user's team only). */
  focus?: Pos[];
}

export interface NilDeal {
  amount: number;
  /** What the collective first offered, when the review cut it back. */
  asked?: number;
  status: "approved" | "cut";
  date: string;
}

const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
/** Share of a year's money a collective holds back for in-season deals. */
export const RESERVE = 0.15;
/** Positions the head coach can ask for at once. */
export const FOCUS_MAX = 3;

/**
 * A collective's normal year. For power-conference schools and Notre Dame it is the program's roster
 * budget (The Athletic's 2026 estimates, scaled to the year; see importer/build_finances.py) less what the
 * athletic department pays in revenue share: $30M or more at the top, a few million at the bottom. Without
 * one it is estimated from conference and prestige: most Group of Five collectives spend a million or two.
 */
export function collectiveBase(t: Pick<Team, "conference" | "school" | "level" | "prestige">, roster?: { budget: number; pool: number } | null): number {
  if (t.level !== "fbs") return 0;
  if (roster) return Math.round(Math.max(300_000, roster.budget - roster.pool) / 10_000) * 10_000;
  const p = (t.prestige ?? 0) / 100;
  const x = P4.has(t.conference) || t.school === "Notre Dame" ? 2_000_000 + 22_000_000 * p * p : 300_000 + 4_000_000 * p * p;
  return Math.round(x / 10_000) * 10_000;
}

/**
 * The most the review approves for a player. Real reviews almost never stop a deal, so only egregious
 * ones are: more than four times what players like him get, plus $500K. The Protect College Sports Act's
 * test (a deal must pay what a business would pay him) is tighter: two and a half times, plus $250K.
 */
export const fmvCeiling = (value: number, pcsa = false) => Math.round((pcsa ? 2.5 * value + 250_000 : 4 * value + 500_000) / 1000) * 1000;

/** The review: deals within the range of comparable deals pass; anything above is cut back to it. */
export function review(amount: number, value: number, date: string, pcsa = false): NilDeal {
  const top = fmvCeiling(value, pcsa);
  return amount <= top ? { amount, status: "approved", date } : { amount: top, asked: amount, status: "cut", date };
}

export interface NilTarget { id: number; pos: Pos; value: number; /** What he's paid now: revenue share and any NIL deal. */ pay: number; starter: boolean }

/**
 * Spend `budget` on a roster: first fill each player's gap to his value (starters first, the biggest
 * values first, the coach's positions ahead of the rest), then put anything left on the stars. Returns
 * the new money per player (on top of what he has).
 */
export function spend(targets: NilTarget[], budget: number, focus: Pos[] = []): Map<number, number> {
  const out = new Map<number, number>();
  const want = new Set(focus);
  const order = targets.filter((t) => t.value > 0).sort((a, b) =>
    Number(want.has(b.pos)) - Number(want.has(a.pos)) || Number(b.starter) - Number(a.starter) || b.value - a.value || a.id - b.id);
  let left = budget;
  for (const t of order) {
    if (left < 1000) break;
    const gap = Math.floor(Math.min(left, Math.max(0, t.value - t.pay)) / 1000) * 1000;
    if (gap <= 0) continue;
    out.set(t.id, gap);
    left -= gap;
  }
  // Money left over goes to the best players (the coach's positions count double), beyond their value.
  const stars = order.slice(0, 20);
  const w = (t: NilTarget) => t.value * (want.has(t.pos) ? 2 : 1);
  const tw = stars.reduce((a, t) => a + w(t), 0);
  if (left >= 10_000 && tw > 0) {
    for (const t of stars) {
      const extra = Math.floor((left * w(t)) / tw / 1000) * 1000;
      if (extra > 0) out.set(t.id, (out.get(t.id) ?? 0) + extra);
    }
  }
  return out;
}
