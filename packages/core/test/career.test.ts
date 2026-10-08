import { describe, expect, it } from "vitest";
import { expectations, loadSeed, securityLabel, winChance } from "../src/index.ts";

describe("career", () => {
  it("win chances are symmetric and the AD expects more from better teams", () => {
    expect(winChance(0)).toBeCloseTo(0.5);
    expect(winChance(7) + winChance(-7)).toBeCloseTo(1);
    expect(winChance(14)).toBeGreaterThan(0.8);
    const seed = loadSeed();
    const games = seed.schedule.map((g) => ({ ...g, kind: "regular" as const, status: "scheduled" as const, home_score: null, away_score: null, overtime: false, label: null }));
    const fbs = seed.teams.filter((t) => t.level === "fbs").sort((a, b) => seed.power[b.id] - seed.power[a.id]);
    const top = expectations(fbs[0].id, seed.teams, games as never, seed.power, 2.5);
    const bottom = expectations(fbs[fbs.length - 1].id, seed.teams, games as never, seed.power, 2.5);
    expect(top.goal).toBe("playoff");
    expect(top.wins).toBeGreaterThanOrEqual(9);
    expect(bottom.goal).toBe("progress");
    expect(bottom.wins).toBeLessThan(top.wins);
    expect(securityLabel(80)).toBe("Secure");
    expect(securityLabel(10)).toBe("On the brink");
  });
});
