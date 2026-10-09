import { mixSeed } from "./hash.ts";
import { AREAS, projectCost, type Area, type Facilities, type Project } from "./finance.ts";
import { devRate, YEAR_GAIN } from "./rollover.ts";
import { POINTS_PER_UNIT } from "./hidden.ts";
import { SET_WEIGHTS } from "./valuation.ts";

/**
 * Facility projects (docs/money.md): what a project could be, how it's paid for, what it might really cost
 * and what it does on the field. A school's facilities on the day the league starts are already part of
 * its players' ratings, so only change from that day counts: an upgrade, or a building closed while its
 * replacement goes up. (Development speed is the exception: it has always followed today's grades.)
 */

export type Scope = "renovate" | "build";
export type Financing = "cash" | "bonds" | "donors";
export const SCOPES: Record<Scope, { label: string; blurb: string }> = {
  renovate: { label: "Renovate", blurb: "One grade better. The space stays open while the work is done." },
  build: { label: "New building", blurb: "Two grades better in one project for less than two renovations, but it takes longer and the old space closes while it goes up (the area plays a grade lower until it opens)." },
};
export const FINANCING: Record<Financing, { label: string; blurb: string }> = {
  cash: { label: "Pay cash", blurb: "Football pays the whole cost from its budget while it's built. Cheapest overall, hardest on the budget now." },
  bonds: { label: "Borrow (bonds)", blurb: "The university borrows and football pays it back over 20 years at 5%: a small yearly payment, but about 1.6 times the cost in all." },
  donors: { label: "Donor campaign", blurb: "Boosters give part of the cost (more at a bigger program, and more when they're happy); football pays the rest in cash. Some of what they give would have gone to your collective, so your roster money is smaller while the campaign runs." },
};

export const BOND_RATE = 0.05, BOND_YEARS = 20;
/** Football's yearly payment on bonds for a project. */
export const bondPayment = (cost: number) => Math.round(cost * BOND_RATE / (1 - Math.pow(1 + BOND_RATE, -BOND_YEARS)) / 10_000) * 10_000;
/** Share of a donor gift that boosters would otherwise have given the collective. */
export const CAMPAIGN_DRAG = 0.3;

/**
 * Share of a project's cost a donor campaign raises: about 45% at a power program and 30% elsewhere, more at
 * a big name, moved by how boosters feel (their fortune). Real campaigns often raise more (Coastal Carolina's
 * donors gave $15M of a $20M practice facility), but those are the projects schools pick because donors want them.
 */
export function donorShare(power: boolean, prestige: number, donors: number): number {
  const base = (power ? 0.45 : 0.3) + 0.2 * (prestige / 100 - 0.5);
  return Math.round(Math.max(0.1, Math.min(0.75, base * Math.max(0.6, Math.min(1.4, donors)))) * 100) / 100;
}

/** Each fiscal year's payment from football's budget, starting the year it's approved. */
export function payments(cost: number, years: number, financing: Financing, start: number, gift = 0): { year: number; amount: number }[] {
  if (financing === "bonds") return Array.from({ length: BOND_YEARS }, (_, i) => ({ year: start + i, amount: bondPayment(cost) }));
  const share = cost - (financing === "donors" ? gift : 0);
  return Array.from({ length: years }, (_, i) => ({ year: start + i, amount: Math.round(share / years / 10_000) * 10_000 }));
}

/**
 * What a project really costs against its estimate: most run a little over, a few well over, and a new
 * building's range is wider than a renovation's (Coastal Carolina's practice facility grew from $15M to $20M
 * before it broke ground). Drawn once from the school, area, year and scope, so it is the same however
 * often it's asked; the estimate's range shows its 10th to 90th percentile.
 */
const OVERRUN: Record<Scope, { median: number; sd: number }> = { renovate: { median: 1.04, sd: 0.07 }, build: { median: 1.07, sd: 0.13 } };
export function overrun(seed: number, teamId: number, area: Area, year: number, scope: Scope): number {
  const u1 = (mixSeed(seed, teamId, area, year, scope, "overrun", 1) + 0.5) / 4294967296, u2 = mixSeed(seed, teamId, area, year, scope, "overrun", 2) / 4294967296;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const o = OVERRUN[scope];
  return Math.round(Math.max(0.9, Math.min(1.5, o.median * Math.exp(o.sd * z))) * 1000) / 1000;
}
export const costRange = (estimate: number, scope: Scope): [number, number] => {
  const o = OVERRUN[scope], r = (x: number) => Math.round(x / 100_000) * 100_000;
  return [r(estimate * Math.max(0.9, o.median * Math.exp(-1.2816 * o.sd))), r(estimate * o.median * Math.exp(1.2816 * o.sd))];
};

/** Grades as they play today: an area whose replacement building is going up plays a grade lower. */
export function effectiveGrades(f: Facilities | undefined, projects: Project[]): Facilities | undefined {
  if (!f) return f;
  const out = { ...f };
  for (const p of projects) if (p.scope === "build") out[p.area] = Math.max(1, out[p.area] - 1);
  return out;
}

/** Injured players come back 6% sooner for each grade the medical facilities have gained (never more than 30%). */
export const MEDICAL_PER_GRADE = 0.06;
/** Hidden chemistry points per unit for each grade the locker room has gained. */
export const LOCKER_CHEM = 0.1;
/** How much more recruits like a school (its development score, about -1 to 1) per grade gained in the locker room and academic support. */
export const APPEAL_PER_GRADE = 0.1;

/** What a school's facilities do against the day the league started (`base`). */
export function facilityEffects(now: Partial<Facilities> | undefined, base: Partial<Facilities> | undefined) {
  const d = (a: Area) => (now?.[a] ?? 2) - (base?.[a] ?? now?.[a] ?? 2);
  return {
    /** Development speed (1 = typical), from today's weight room, practice fields and medical. */
    dev: devRate(now),
    /** Days an injury keeps a player out, against the usual. */
    injury: Math.max(0.7, Math.min(1.3, 1 - MEDICAL_PER_GRADE * d("medical"))),
    /** Chemistry for each unit, in hidden points. */
    chemistry: Math.round(LOCKER_CHEM * d("locker_room") * 100) / 100,
    /** Added to how recruits rate the school's development and support. */
    appeal: Math.round(APPEAL_PER_GRADE * (d("locker_room") + d("academics")) * 100) / 100,
  };
}

/** The same change in plain numbers: what a player, a game and a recruit would notice. */
export function effectSummary(before: Partial<Facilities>, after: Partial<Facilities>, base: Partial<Facilities>) {
  const a = facilityEffects(before, base), b = facilityEffects(after, base);
  const gain = YEAR_GAIN.reduce((x, y) => x + y, 0) / YEAR_GAIN.length;
  const devPct = b.dev / a.dev - 1;
  // Recruits weigh development (facilities and staff) at SET_WEIGHTS.development; the odds against an even school follow the logit.
  const appeal = (b.dev - a.dev) * 5 + (b.appeal - a.appeal);
  return {
    dev_pct: Math.round(devPct * 1000) / 10,
    ovr_per_year: Math.round(devPct * gain * 100) / 100,
    injury_pct: Math.round((b.injury / a.injury - 1) * 1000) / 10,
    points: Math.round((b.chemistry - a.chemistry) * 2 * POINTS_PER_UNIT * 100) / 100,
    recruit_pct: Math.round((Math.exp(SET_WEIGHTS.development * appeal) - 1) * 1000) / 10,
  };
}

/** One way to do a project: its estimate, range, schedule and what each kind of financing costs football. */
export function projectOption(o: {
  area: Area; from: number; scope: Scope; power: boolean; prestige: number; donors: number; year: number;
}) {
  const to = Math.min(5, o.from + (o.scope === "build" ? 2 : 1));
  const { cost, years } = projectCost(o.area, to, o.power, o.scope);
  const share = donorShare(o.power, o.prestige, o.donors), gift = Math.round(cost * share / 10_000) * 10_000;
  const fin = (f: Financing) => {
    const pay = payments(cost, years, f, o.year, gift);
    return { financing: f, payments: pay, total: pay.reduce((a, x) => a + x.amount, 0), ...(f === "donors" ? { gift, share, drag: Math.round(gift * CAMPAIGN_DRAG / 10_000) * 10_000 } : {}) };
  };
  return { area: o.area, label: AREAS[o.area], scope: o.scope, from: o.from, to, years, estimate: cost, range: costRange(cost, o.scope), opens: `${o.year + years}-08-01`,
    financing: (["cash", "bonds", "donors"] as const).map(fin) };
}
