import { mixSeed } from "./hash.ts";
import type { Team } from "./types.ts";
import { isPower } from "./conferences.ts";

/**
 * A football program's budget (M2). Revenue: media rights and conference distributions, tickets, donors,
 * licensing and sponsorship, and postseason shares. Expenses: revenue share to players, coaches and staff,
 * operations (recruiting, travel, game day) and facilities with their debt. The budget runs on the fiscal
 * year, July to June; football's surplus or deficit goes back to the athletic department.
 *
 * Real numbers come from the Knight-Newhouse College Athletics Database for public schools when they are
 * loaded (importer/build_finances.py); every other line is estimated here from conference and prestige,
 * at about the size those reports show for football programs like it.
 */

export type RevenueLine = "media" | "tickets" | "donors" | "support" | "other" | "postseason";
export type ExpenseLine = "revenue_share" | "coaches" | "operations" | "facilities" | "one_time";
export const REVENUE_LINES: Record<RevenueLine, string> = {
  media: "Media rights and conference distributions", tickets: "Tickets and game day", donors: "Donors and booster giving",
  support: "School support and student fees",
  other: "Licensing, sponsorship and other", postseason: "Postseason and playoff shares",
};
export const EXPENSE_LINES: Record<ExpenseLine, string> = {
  revenue_share: "Revenue share to players", coaches: "Coaches and staff", operations: "Recruiting, travel and operations", facilities: "Facilities and debt service",
  one_time: "One-time charges (exit fees and the like)",
};

/** What a school's budget is built from: the fixed lines for a year, and its game day. */
export interface Budget {
  /** Lines that don't depend on the season's games, in dollars for the fiscal year. */
  fixed: { media: number; donors: number; support: number; other: number; coaches: number; operations: number; facilities: number };
  /** The average home crowd last season, the stadium's capacity and the average ticket price. */
  attendance: number;
  capacity: number;
  price: number;
  source: "knight-newhouse" | "estimate";
}

/**
 * A football program's own share of its conference's yearly distribution (media rights), per member, 2025-26.
 * Keyed by conference so a custom or realigned conference can set its own payout.
 */
export const CONF_MEDIA: Record<string, number> = {
  "Big Ten": 42_000_000, SEC: 38_000_000, ACC: 31_000_000, "Big 12": 28_000_000, "Pac-12": 5_500_000, "American Athletic": 5_000_000,
  "Mountain West": 3_500_000, "Sun Belt": 2_500_000, "Mid-American": 1_500_000, "Conference USA": 1_200_000, "FBS Independents": 2_000_000,
};
export const SCHOOL_MEDIA: Record<string, number> = { "Notre Dame": 25_000_000, Army: 4_000_000, Navy: 4_000_000 };

/** A school's media money: its own TV deal (Notre Dame, the academies) or its conference's per-member payout. */
export function conferenceMedia(conference: string, school?: string): number {
  return (school ? SCHOOL_MEDIA[school] : undefined) ?? CONF_MEDIA[conference] ?? 2_000_000;
}
const r10k = (x: number) => Math.round(x / 10_000) * 10_000;

/** A school's budget inputs: real lines where loaded, estimates for the rest. */
/**
 * A school's conference TV money: its league deal's payout (`t.media`), else the real figure. Independents
 * earn their own deals; Army and Navy's real numbers hold while they're in the American.
 */
function mediaFor(t: Pick<Team, "school" | "conference" | "media"> & { power?: boolean }): number {
  if (t.conference === "FBS Independents") return SCHOOL_MEDIA[t.school] ?? 2_000_000;
  if (t.conference === "American Athletic" && SCHOOL_MEDIA[t.school]) return SCHOOL_MEDIA[t.school];
  return t.media ?? CONF_MEDIA[t.conference] ?? (isPower(t) ? 25_000_000 : 2_000_000);
}

export function budgetFor(t: Pick<Team, "school" | "conference" | "level" | "prestige" | "venue" | "media">,
  fin: { attendance: number | null; home_games?: number; lines?: Partial<Record<string, number>> | null } | undefined): Budget | null {
  if (t.level !== "fbs") return null;
  const p = (t.prestige ?? 0) / 100;
  const big = isPower(t);
  const est = {
    media: mediaFor(t),
    donors: big ? 6_000_000 + 30_000_000 * p * p : 800_000 + 5_000_000 * p * p,
    // Most Group of Five programs lean on their university and students to cover what football doesn't earn.
    support: big ? 500_000 : 4_000_000 + 3_000_000 * p,
    other: big ? 5_000_000 + 12_000_000 * p : 800_000 + 2_500_000 * p,
    coaches: big ? 14_000_000 + 18_000_000 * p : 3_500_000 + 5_000_000 * p,
    operations: big ? 9_000_000 + 12_000_000 * p : 2_500_000 + 3_500_000 * p,
    facilities: big ? 7_000_000 + 14_000_000 * p : 1_500_000 + 3_000_000 * p,
  };
  const real = fin?.lines ?? null;
  const fixed = Object.fromEntries(Object.entries(est).map(([k, v]) => [k, r10k(real?.[k] ?? v)])) as Budget["fixed"];
  const capacity = t.venue?.capacity ?? 30_000;
  return {
    fixed, capacity: capacity,
    attendance: Math.min(capacity, fin?.attendance ?? Math.round(capacity * (big ? 0.8 : 0.45))),
    // A real ticket line sets the average price; otherwise it follows the program's size.
    price: real?.tickets && fin?.attendance && fin.home_games ? Math.round(real.tickets / (fin.attendance * fin.home_games)) : Math.round(big ? 50 + 60 * p : 18 + 22 * p),
    source: real ? "knight-newhouse" : "estimate",
  };
}

/**
 * A home game's crowd at a ticket price. Demand falls as the price rises above the usual one (about
 * 1% fewer fans for each 1% higher), rises with winning, a ranked team or a good opponent, and a sellout
 * school has fans it turns away, so it can charge more. A crowd never passes capacity.
 */
export function crowd(b: Budget, o: { price: number; winPct: number | null; ranked: boolean; oppRanked: boolean; oppFcs: boolean; prestige: number }): number {
  const sellout = b.attendance >= 0.95 * b.capacity;
  const latent = b.attendance * (sellout ? 1 + 0.35 * o.prestige / 100 : 1);
  let d = latent * Math.pow(o.price / b.price, -1);
  if (o.winPct != null) d *= 1 + 0.3 * (o.winPct - 0.5);
  if (o.ranked) d *= 1.06;
  if (o.oppRanked) d *= 1.1;
  if (o.oppFcs) d *= 0.85;
  return Math.round(Math.max(0, Math.min(b.capacity, d)));
}

/** A one-time charge to a football budget in a fiscal year (a conference exit fee, say). */
export interface Charge { team_id: number; year: number; label: string; amount: number }

// ---- facilities ----------------------------------------------------------------------------------
export type Area = "weight_room" | "medical" | "practice" | "locker_room" | "academics";
export const AREAS: Record<Area, string> = {
  weight_room: "Weight room", medical: "Training and medical", practice: "Practice fields", locker_room: "Locker room", academics: "Academic support",
};
export type Facilities = Record<Area, number>;

/** Each area graded 1 to 5 from the program's size, with a school's own strengths and gaps. */
export function facilitiesFor(t: Pick<Team, "id" | "school" | "conference" | "level" | "prestige">, seed: number): Facilities | null {
  if (t.level !== "fbs") return null;
  const p = (t.prestige ?? 0) / 100;
  const base = isPower(t) ? 2.6 + 2.2 * p : 1.2 + 2.2 * p;
  let h = mixSeed(seed, t.id, "facilities");
  const out = {} as Facilities;
  for (const a of Object.keys(AREAS) as Area[]) {
    h = mixSeed(h, a);
    const u = (h % 1000) / 1000 - 0.5;
    out[a] = Math.max(1, Math.min(5, Math.round(base + 1.4 * u)));
  }
  return out;
}

/** An upgrade the athletic department is building: one area to a new grade, paid over its years. */
export interface Project { team_id: number; area: Area; to: number; cost: number; years: number; start: string; done: string }

/** What an upgrade costs and how long it takes (a top grade costs tens of millions and takes years). */
export function projectCost(area: Area, to: number, bigProgram: boolean): { cost: number; years: number } {
  const per: Record<Area, number> = { weight_room: 3_000_000, medical: 3_500_000, practice: 4_500_000, locker_room: 4_000_000, academics: 2_000_000 };
  return { cost: r10k(per[area] * Math.pow(to, 1.6) * (bigProgram ? 1 : 0.6)), years: to >= 5 ? 3 : to >= 4 ? 2 : 1 };
}
