/**
 * How a season's results reach a program's money (front office). Winning sells tickets, donors give more
 * after a season that beats expectations, and bowls and the playoff pay out. All of it carries into next
 * year's budget, and so into what a school can spend on its roster: boosters fund the collective, and an
 * athletic department that isn't already paying the full revenue-share cap gives football more when
 * football beats its budget. A Group of Five program with playoff runs in a row can climb into a richer
 * budget class; a power program that keeps losing slides.
 *
 * A program's fortune is three multipliers around 1 that move each year and carry most of the last one:
 * `fans` (the usual home crowd), `donors` (booster giving and the collective) and `ad` (the athletic
 * department's revenue share for football, up to the cap).
 *
 * Postseason payouts are keyed by bowl and by conference (`postseasonPayout`, `CONFERENCE_POOL`) so
 * custom conferences and tie-ins can set their own.
 */

export interface Fortune {
  fans: number;
  donors: number;
  ad: number;
  /** This season: the wins expected from each game's pregame chances, and football's revenue as budgeted when it opened. */
  exp?: number;
  plan?: number;
}

export const NEUTRAL: Fortune = { fans: 1, donors: 1, ad: 1 };

/** A program's season, as the money sees it. */
export interface SeasonOutcome {
  wins: number;
  losses: number;
  /** Wins expected from each game's pregame chances. */
  exp: number;
  /** Playoff games played and won, a national title, a bowl played and won. */
  cfp: number;
  cfp_wins: number;
  title: boolean;
  bowl: boolean;
  bowl_won: boolean;
  /** A power-conference program (or Notre Dame): its fans and donors notice a playoff berth less. */
  power: boolean;
  /** Football's revenue this fiscal year against what it was budgeted at when the season opened. */
  revenue_ratio: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** How much of last year's fortune carries into the next. */
export const CARRY = { fans: 0.6, donors: 0.8, ad: 0.7 };

/**
 * Next year's fortune from this one and the season just played.
 *
 * - Fans follow the record (a 12-1 season fills about 20% more seats than a 6-6 one would, over time) and
 *   a playoff berth.
 * - Donors follow winning beyond expectations, and a playoff berth (much more at a Group of Five school,
 *   where it's a once-in-a-generation run; a power program's boosters expect it), playoff wins and a title.
 * - The athletic department follows football's revenue against its budget: tickets, postseason money and
 *   giving that beat the plan come back to football the next year.
 */
export function nextFortune(f: Fortune, o: SeasonOutcome): Fortune {
  const games = Math.max(1, o.wins + o.losses), pct = o.wins / games, over = (o.wins - o.exp) / games;
  const fans = CARRY.fans * f.fans + (1 - CARRY.fans) * (1 + 0.5 * (pct - 0.5) + (o.cfp ? 0.06 : 0) + (o.bowl ? 0.02 : 0));
  const donors = 1 + CARRY.donors * (f.donors - 1) + 0.6 * over + 0.25 * (pct - 0.5) + (o.cfp ? (o.power ? 0.06 : 0.15) : 0)
    + 0.03 * o.cfp_wins + (o.title ? 0.06 : 0) + (o.bowl_won ? 0.02 : 0);
  const ad = 1 + CARRY.ad * (f.ad - 1) + 0.6 * (o.revenue_ratio - 1);
  return { fans: r3(clamp(fans, 0.7, 1.35)), donors: r3(clamp(donors, 0.6, 2)), ad: r3(clamp(ad, 0.7, 1.8)) };
}

// ---- postseason money ------------------------------------------------------------------------------
/**
 * What a bowl pays each team's conference, roughly as reported for 2025-26 (the access bowls through the
 * College Football Playoff; the rest from their own contracts). Bowls not listed pay $750K.
 */
export const BOWL_PAYOUT: Record<string, number> = {
  "Rose Bowl": 4_000_000, "Sugar Bowl": 4_000_000, "Orange Bowl": 4_000_000, "Cotton Bowl": 4_000_000, "Fiesta Bowl": 4_000_000, "Peach Bowl": 4_000_000,
  "Citrus Bowl": 4_200_000, "Alamo Bowl": 3_800_000, "ReliaQuest Bowl": 3_500_000, "Gator Bowl": 3_000_000, "Holiday Bowl": 2_700_000,
  "Pop-Tarts Bowl": 2_700_000, "Texas Bowl": 2_200_000, "Music City Bowl": 2_800_000, "Las Vegas Bowl": 2_500_000, "Sun Bowl": 2_000_000,
  "Pinstripe Bowl": 2_500_000, "Duke's Mayo Bowl": 2_200_000, "Liberty Bowl": 2_200_000, "Gasparilla Bowl": 1_500_000, "Military Bowl": 1_500_000,
  "Birmingham Bowl": 1_500_000, "Rate Bowl": 1_500_000, "LA Bowl": 1_200_000, "Fenway Bowl": 1_200_000, "Armed Forces Bowl": 1_000_000,
};
export const BOWL_DEFAULT = 750_000;

/**
 * The College Football Playoff's per-team payouts to its conference by round (2024-26 distribution):
 * $4M for the first round, $4M for a quarterfinal, $6M for a semifinal and $6M for the title game, plus
 * each school's travel allowance.
 */
export const CFP_PAYOUT = { first: 4_000_000, quarter: 4_000_000, semi: 6_000_000, final: 6_000_000, travel: 2_000_000 };

/**
 * How much of a member's postseason payout its conference pools and splits among every member. Power
 * conferences pool most of it (a member keeps about its expenses); Group of Five conferences let the school
 * keep more. Keyed by conference name, so a custom conference sets its own; anything else pools half.
 */
export const CONFERENCE_POOL: Record<string, number> = {
  SEC: 0.7, "Big Ten": 0.7, ACC: 0.7, "Big 12": 0.7, "Pac-12": 0.5, "American Athletic": 0.5, "Mountain West": 0.5, "Sun Belt": 0.5,
  "Mid-American": 0.5, "Conference USA": 0.5, "FBS Independents": 0,
};
export const conferencePool = (conference: string): number => CONFERENCE_POOL[conference] ?? 0.5;

export interface PostGame { kind: "bowl" | "playoff"; /** The bowl's name (playoff games played at a bowl carry it too). */ name: string | null; /** Playoff rounds after this one (0 = the title game). */ from_end?: number }

/** What a postseason game pays: the school's own share, and the part its conference pools for every member. */
export function postseasonPayout(g: PostGame, conference: string): { school: number; pooled: number } {
  const pool = conferencePool(conference);
  if (g.kind === "playoff") {
    const e = g.from_end ?? 0;
    const pay = e === 0 ? CFP_PAYOUT.final : e === 1 ? CFP_PAYOUT.semi : e === 2 ? CFP_PAYOUT.quarter : CFP_PAYOUT.first;
    return { school: Math.round(pay * (1 - pool)) + CFP_PAYOUT.travel, pooled: Math.round(pay * pool) };
  }
  const pay = (g.name && BOWL_PAYOUT[g.name]) || BOWL_DEFAULT;
  return { school: Math.round(pay * (1 - pool)), pooled: Math.round(pay * pool) };
}

// ---- budget classes --------------------------------------------------------------------------------
/** Budget classes by a program's roster budget (revenue share and boosters) in 2026 dollars, richest first. */
export const BUDGET_CLASSES: { key: string; label: string; min: number }[] = [
  { key: "elite", label: "Elite", min: 30_000_000 },
  { key: "power", label: "Power", min: 20_000_000 },
  { key: "power_low", label: "Lower power", min: 12_000_000 },
  { key: "g5_high", label: "Upper Group of Five", min: 6_000_000 },
  { key: "g5", label: "Group of Five", min: 3_000_000 },
  { key: "g5_low", label: "Lower Group of Five", min: 0 },
];

/** A program's budget class from its roster budget, in that year's dollars (`scale`: rosterBudgetYear). */
export function budgetClass(rosterBudget: number, scale = 1): { key: string; label: string } {
  const c = BUDGET_CLASSES.find((x) => rosterBudget >= x.min * scale) ?? BUDGET_CLASSES[BUDGET_CLASSES.length - 1];
  return { key: c.key, label: c.label };
}

/** One season in a program's money history. */
export interface FinanceYear {
  year: number;
  w: number;
  l: number;
  /** "CFP quarterfinal", "Citrus Bowl", or null. */
  post: string | null;
  revenue: number;
  expenses: number;
  surplus: number;
  attendance: number;
  roster_budget: number;
  class: string;
  fortune: Fortune;
}
