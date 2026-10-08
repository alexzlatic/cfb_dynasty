import { describe, expect, it } from "vitest";
import { aiContracts, footballPool, playerValue, revenueCap } from "../src/money.ts";

describe("money", () => {
  it("values players by position and rating, with a ceiling", () => {
    const qb = (ovr: number) => playerValue({ pos: "QB", ovr, stars: 3, years: 3 });
    expect(qb(75)).toBeGreaterThan(playerValue({ pos: "LB", ovr: 75, stars: 3, years: 3 }));
    expect(qb(80)).toBeGreaterThan(qb(75));
    expect(qb(99)).toBeLessThanOrEqual(6_500_000);
    expect(playerValue({ pos: "OL", ovr: 35, stars: null, years: 2 })).toBe(0);
    // A five-star freshman is worth his hype before he has shown anything.
    expect(playerValue({ pos: "WR", ovr: 62, stars: 5, years: 0 })).toBe(700_000);
  });

  it("caps revenue share and spends each school's budget without overpaying anyone", () => {
    expect(revenueCap(2025)).toBe(20_500_000);
    expect(revenueCap(2026)).toBe(21_320_000);
    const p4 = footballPool({ conference: "SEC", school: "Georgia", level: "fbs", prestige: 90 }, 2026);
    expect(p4).toBe(15_990_000);
    expect(footballPool({ conference: "Sun Belt", school: "Texas State", level: "fbs", prestige: 30 }, 2026)).toBeLessThan(p4 / 3);
    const roster = Array.from({ length: 60 }, (_, i) => ({ id: i, pos: "WR" as const, ovr: 60 + (i % 30), stars: 3, years: i % 4 }));
    const c = aiContracts(roster, 5_000_000, 2026);
    const total = Object.values(c).reduce((a, x) => a + x.amount, 0);
    expect(total).toBeLessThanOrEqual(5_000_000);
    expect(total).toBeGreaterThan(4_900_000);
    for (const p of roster) if (c[p.id]) expect(c[p.id].amount).toBeLessThanOrEqual(playerValue(p));
    const rich = aiContracts(roster.slice(0, 5), 50_000_000, 2026);
    for (const p of roster.slice(0, 5)) expect(rich[p.id]?.amount ?? 0).toBeLessThanOrEqual(playerValue(p));
  });
});
