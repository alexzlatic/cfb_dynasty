import { describe, expect, it } from "vitest";
import { NEUTRAL, budgetClass, nextFortune, postseasonPayout, type SeasonOutcome } from "../src/fortunes.ts";

const avg: SeasonOutcome = { wins: 6, losses: 6, exp: 6, cfp: 0, cfp_wins: 0, title: false, bowl: false, bowl_won: false, power: false, revenue_ratio: 1 };

describe("fortunes", () => {
  it("an expected season leaves a program where it was", () => {
    expect(nextFortune(NEUTRAL, avg)).toEqual({ fans: 1, donors: 1, ad: 1 });
  });

  it("winning beyond expectations fills seats and opens wallets; losing does the opposite", () => {
    const up = nextFortune(NEUTRAL, { ...avg, wins: 10, losses: 2 }), down = nextFortune(NEUTRAL, { ...avg, wins: 2, losses: 10 });
    expect(up.fans).toBeGreaterThan(1);
    expect(up.donors).toBeGreaterThan(1.15);
    expect(down.donors).toBeLessThan(0.85);
    expect(down.fans).toBeLessThan(1);
    // Winning what you were expected to win moves donors much less.
    expect(nextFortune(NEUTRAL, { ...avg, wins: 10, losses: 2, exp: 10 }).donors).toBeLessThan(up.donors - 0.1);
  });

  it("a Group of Five playoff run counts for more than a power program's, and back-to-back runs build", () => {
    const run = { ...avg, wins: 12, losses: 2, exp: 9.5, cfp: 1, bowl: false, revenue_ratio: 1.25 };
    const g5 = nextFortune(NEUTRAL, run), p4 = nextFortune(NEUTRAL, { ...run, power: true });
    expect(g5.donors).toBeGreaterThan(p4.donors);
    expect(g5.ad).toBeGreaterThan(1.1);
    const twice = nextFortune(g5, run);
    expect(twice.donors).toBeGreaterThan(g5.donors);
    expect(twice.ad).toBeGreaterThan(g5.ad);
  });

  it("pays postseason games by bowl and round, and conferences pool their share", () => {
    const citrus = postseasonPayout({ kind: "bowl", name: "Citrus Bowl" }, "SEC");
    expect(citrus.school + citrus.pooled).toBe(4_200_000);
    expect(citrus.pooled).toBeGreaterThan(citrus.school);
    const small = postseasonPayout({ kind: "bowl", name: "Some New Bowl" }, "Sun Belt");
    expect(small.school + small.pooled).toBe(750_000);
    const semi = postseasonPayout({ kind: "playoff", name: "Fiesta Bowl", from_end: 1 }, "Mountain West");
    const first = postseasonPayout({ kind: "playoff", name: null, from_end: 3 }, "Mountain West");
    expect(semi.school).toBeGreaterThan(first.school);
    // An independent keeps everything.
    expect(postseasonPayout({ kind: "bowl", name: "Citrus Bowl" }, "FBS Independents").pooled).toBe(0);
  });

  it("puts programs in budget classes by roster budget", () => {
    expect(budgetClass(45_000_000).key).toBe("elite");
    expect(budgetClass(8_000_000).key).toBe("g5_high");
    expect(budgetClass(1_000_000).key).toBe("g5_low");
    // Thresholds grow with the market.
    expect(budgetClass(30_500_000, 1.04).key).toBe("power");
  });
});
