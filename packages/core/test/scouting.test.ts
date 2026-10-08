import { describe, expect, it } from "vitest";
import { Season, basePass, insights, knowledge, loadSeed, teamPass, tendencies, timeSplit, SEASON_TIME } from "../src/index.ts";

describe("opponent scouting", () => {
  const seed = loadSeed();
  const byName = (s: Season, n: string) => s.teams.find((t) => t.school === n)!.id;

  it("reads a team's real down-and-distance habits", () => {
    expect(basePass(3, 9)).toBeGreaterThan(basePass(3, 1));
    const s = Season.create(seed, { seed: 3 });
    const navy = s.teamRatings(byName(s, "Navy"))!;
    expect(teamPass(navy, 1, 10)).toBeLessThan(basePass(1, 10));
    const all = tendencies(navy, s.allSchemes()[byName(s, "Navy")]);
    expect(all.some((x) => x.id === "off:qb_run")).toBe(true);
    expect(all.some((x) => x.text.includes("Runs on"))).toBe(true);
  });

  it("finds more with more film", () => {
    expect(knowledge(0)).toBe(0);
    expect(knowledge(24)).toBeGreaterThan(0.45);
    expect(knowledge(100)).toBeGreaterThan(0.9);
    const s = Season.create(seed, { seed: 3 });
    const id = byName(s, "Navy");
    const all = tendencies(s.teamRatings(id)!, s.allSchemes()[id]);
    const few = insights(all, 0.3, 1, 1), many = insights(all, 0.95, 1, 1);
    expect(many.length).toBeGreaterThan(few.length);
    expect(many.length).toBe(all.length);
    // A thin read blurs their numbers ("about"); a full one doesn't.
    expect(insights(all, 0.4, 1, 1).every((x) => !/\d%/.test(x.text) || x.text.includes("about"))).toBe(true);
    expect(many.every((x) => !x.text.includes("about") && !x.text.includes("{"))).toBe(true);
  });

  it("puts the staff's opponent share of the week into film before your game", () => {
    expect(timeSplit({ recruiting: 0.3, scouting: 0.1, prep: 0.6 }, true).opponent).toBeGreaterThan(0);
    expect(timeSplit(SEASON_TIME, false).opponent).toBe(0);
    const s = Season.create(seed, { seed: 3, user_team_id: 2509 });
    const before = s.scoutReport()!;
    for (let i = 0; i < 9; i++) s.advanceDay();
    const after = s.scoutReport()!;
    expect(after.game_id).toBe(before.game_id);
    expect(after.hours).toBeGreaterThan(before.hours);
    expect(after.knowledge).toBeGreaterThan(before.knowledge);
    expect(s.scoutKnowledge(after.opponent, after.game_id)).toBeGreaterThan(0.3);
  });
});
