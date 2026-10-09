import { describe, expect, it } from "vitest";
import { projectCost } from "../src/finance.ts";
import { bondPayment, costRange, donorShare, effectSummary, effectiveGrades, facilityEffects, overrun, payments, projectOption } from "../src/facilities.ts";

const grades = { weight_room: 3, medical: 3, practice: 3, locker_room: 3, academics: 3 };

describe("facility projects", () => {
  it("costs follow recent projects: a top power indoor practice facility about $60M, a Group of Five one far less", () => {
    expect(projectCost("practice", 5, true).cost).toBe(60_000_000);
    expect(projectCost("practice", 4, false).cost).toBeLessThan(20_000_000);
    expect(projectCost("locker_room", 5, true).cost).toBe(15_000_000);
    // A new building two grades up costs less than the two renovations it replaces, and takes longer.
    const two = projectCost("weight_room", 3, true).cost + projectCost("weight_room", 4, true).cost;
    expect(projectCost("weight_room", 4, true, "build").cost).toBeLessThan(two);
    expect(projectCost("weight_room", 4, true, "build").years).toBeGreaterThan(projectCost("weight_room", 4, true).years);
  });

  it("financing spreads the cost: cash while it's built, bonds over 20 years, a campaign's remainder", () => {
    expect(payments(10_000_000, 2, "cash", 2026)).toEqual([{ year: 2026, amount: 5_000_000 }, { year: 2027, amount: 5_000_000 }]);
    const bonds = payments(10_000_000, 2, "bonds", 2026);
    expect(bonds.length).toBe(20);
    expect(bonds[0].amount).toBe(bondPayment(10_000_000));
    expect(bonds.reduce((a, x) => a + x.amount, 0)).toBeGreaterThan(15_000_000);
    expect(payments(10_000_000, 1, "donors", 2026, 4_000_000)).toEqual([{ year: 2026, amount: 6_000_000 }]);
    // Happier boosters and bigger programs give more.
    expect(donorShare(true, 80, 1.2)).toBeGreaterThan(donorShare(true, 80, 0.9));
    expect(donorShare(true, 60, 1)).toBeGreaterThan(donorShare(false, 60, 1));
  });

  it("the real cost is fixed by the school, area and year, and the estimate's range holds most outcomes", () => {
    expect(overrun(7, 1, "medical", 2026, "build")).toBe(overrun(7, 1, "medical", 2026, "build"));
    const draws = Array.from({ length: 400 }, (_, i) => overrun(i, 5, "practice", 2026, "renovate"));
    const [lo, hi] = costRange(1_000_000, "renovate");
    const inside = draws.filter((k) => k * 1_000_000 >= lo - 50_000 && k * 1_000_000 <= hi + 50_000).length / draws.length;
    expect(inside).toBeGreaterThan(0.7);
    expect(draws.reduce((a, b) => a + b, 0) / draws.length).toBeGreaterThan(1);
  });

  it("only change from the league's start counts, and a building going up plays a grade lower", () => {
    const e = facilityEffects(grades, grades);
    expect([e.injury, e.chemistry, e.appeal]).toEqual([1, 0, 0]);
    const up = facilityEffects({ ...grades, medical: 4, locker_room: 5 }, grades);
    expect(up.injury).toBeCloseTo(0.94);
    expect(up.chemistry).toBeCloseTo(0.2);
    expect(up.appeal).toBeCloseTo(0.2);
    expect(effectiveGrades(grades, [{ team_id: 1, area: "practice", to: 5, cost: 1, years: 2, start: "", done: "", scope: "build" }])!.practice).toBe(2);
    const s = effectSummary(grades, { ...grades, weight_room: 4 }, grades);
    expect(s.dev_pct).toBeGreaterThan(2);
    expect(s.recruit_pct).toBeGreaterThan(0);
  });

  it("an option lists every way to pay, with the donor gift and what it takes from the collective", () => {
    const o = projectOption({ area: "locker_room", from: 3, scope: "renovate", power: true, prestige: 70, donors: 1, year: 2026 });
    expect(o.to).toBe(4);
    expect(o.financing.map((f) => f.financing)).toEqual(["cash", "bonds", "donors"]);
    const d = o.financing[2];
    expect(d.gift).toBeGreaterThan(0);
    expect(d.total).toBe(o.estimate - d.gift!);
    expect(d.drag).toBeGreaterThan(0);
  });
});
