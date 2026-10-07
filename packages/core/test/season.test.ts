import { describe, expect, it } from "vitest";
import { Season, bracketOrder, loadSeed, openingPairs, runSim, validatePlayoff } from "../src/index.ts";

const seed = loadSeed();

describe("bracket shapes", () => {
  it("matches the CFP's 12-team bracket", () => {
    expect(openingPairs(12, 4)).toEqual([[5, 12], [6, 11], [7, 10], [8, 9]]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(validatePlayoff({ format: "playoff", teams: 10, auto_bids: 5, byes: 0, campus_first_round: true })).toMatch(/field size/);
  });
});

describe("postseason formats", () => {
  const cases = [
    { name: "12-team playoff", playoff: {}, games: 11 },
    { name: "4-team playoff", playoff: { teams: 4, byes: 0, auto_bids: 0 }, games: 3 },
    { name: "16-team playoff", playoff: { teams: 16, byes: 0 }, games: 15 },
    { name: "24-team playoff", playoff: { teams: 24, byes: 8 }, games: 23 },
    { name: "BCS", playoff: { format: "bcs" }, games: 1 },
    { name: "bowls", playoff: { format: "bowls" }, games: 0 },
  ];
  for (const c of cases) {
    it(`${c.name}: plays the bracket and crowns one champion`, () => {
      const s = Season.create(seed, { seed: 3, settings: { playoff: c.playoff as never } });
      runSim(s, { kind: "end_of_season" });
      const po = s.state.games.filter((g) => g.kind === "playoff");
      expect(po).toHaveLength(c.games);
      expect(po.every((g) => g.status === "final")).toBe(true);
      expect(po.filter((g) => g.title)).toHaveLength(c.games ? 1 : 0);
      expect(s.state.champion).not.toBeNull();
      expect(s.latestPoll("ap")!.ranks[0].team_id).toBe(s.state.champion);
    });
  }
  it("switching format before selection day rebuilds the postseason calendar", () => {
    const s = Season.create(seed, { seed: 4 });
    runSim(s, { kind: "date", date: "2026-10-15" });
    s.updateSettings({ playoff: { format: "bcs" } as never });
    expect(s.state.events.some((e) => e.type === "cfp_rankings" && e.status === "upcoming")).toBe(false);
    expect(s.state.events.some((e) => e.type === "bcs_standings")).toBe(true);
    runSim(s, { kind: "end_of_season" });
    expect(s.state.games.filter((g) => g.kind === "playoff")).toHaveLength(1);
    expect(() => s.updateSettings({ playoff: { format: "playoff" } as never })).toThrow(/next season/);
  });
});

describe("polls", () => {
  it("are voter ballots with disagreement, not a sort of strength", () => {
    const s = Season.create(seed, { seed: 8 });
    runSim(s, { kind: "date", date: "2026-10-12" });
    const ap = s.latestPoll("ap")!;
    expect(ap.voters).toBe(s.state.writers.length);
    expect(ap.ranks[0].first).toBeLessThan(ap.voters!);
    const byPower = [...ap.ranks.slice(0, 25)].sort((a, b) => s.state.power[b.team_id] - s.state.power[a.team_id]);
    expect(byPower.map((r) => r.team_id)).not.toEqual(ap.ranks.slice(0, 25).map((r) => r.team_id));
    expect(s.state.news.filter((n) => n.kind === "story" && n.date === ap.date)).toHaveLength(s.state.writers.length);
  });
  it("a power-conference team has its own beat writer", () => {
    const s = Season.create(seed, { seed: 8 });
    const purdue = s.state.writers.find((w) => w.beat.kind === "team" && w.beat.team_id === 2509);
    expect(purdue?.voter.homer).toBeGreaterThan(0);
  });
});
