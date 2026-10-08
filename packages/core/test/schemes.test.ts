import { describe, expect, it } from "vitest";
import { DEF_SCHEMES, OFF_SCHEMES, SCHEMES, Season, checkScheme, drawSchemes, inferOffense, loadSeed, schemeLayout, schemeRating, type RatedPlayer } from "../src/index.ts";

const player = (pos: RatedPlayer["pos"], attrs: Record<string, number>, ovr: number): RatedPlayer => ({
  id: 1, team_id: 1, first: "A", last: "B", pos, listed: pos, class: "JR", years: 2, jersey: null, height: null, weight: null,
  home: { city: null, state: null, lat: null, lon: null }, stars: null, composite: null, natl_rank: null, attrs,
  traits: { stamina: 70, injury: 50, toughness: 50, discipline: 50 }, hidden: { potential: 70, work_ethic: 50 }, tend: {}, ovr, basis: "stats", sample: 100,
});

describe("schemes", () => {
  it("lays out every slot of its side", () => {
    for (const x of OFF_SCHEMES) expect(schemeLayout(x)).toHaveLength(14);
    for (const x of DEF_SCHEMES) expect(schemeLayout(x)).toHaveLength(11);
    expect(schemeLayout("3-4").find((r) => r.slot === "DE1")!.role.pos).toContain("LB");
    expect(checkScheme("def", "3-3-5")).toBe("3-3-5");
    expect(() => checkScheme("off", "4-3")).toThrow();
  });

  it("rates a running quarterback higher in the option than in the Air Raid", () => {
    const qb = player("QB", { acc_short: 68, acc_deep: 66, arm: 65, decisions: 76, pocket: 66, speed: 90, security: 80 }, 72);
    expect(schemeRating(qb, "option", "QB").fit).toBeGreaterThan(2);
    expect(schemeRating(qb, "air_raid", "QB").fit).toBeLessThan(0);
  });

  it("lets a linebacker rush from a 3-4 end slot with his blitz rating", () => {
    const lb = player("LB", { run_fit: 70, tackle: 72, coverage: 60, blitz: 88, speed: 82 }, 72);
    const r = schemeRating(lb, "3-4", "DE1");
    expect(r.eligible).toBe(true);
    expect(r.rating).toBeGreaterThan(lb.ovr);
    expect(schemeRating(lb, "4-2-5", "DE1").eligible).toBe(false);
  });

  it("reads offenses from how real teams played", () => {
    expect(inferOffense({ pass_rate: 0.2, plays_per_game: 66, scramble_rate: 0.3 })).toBe("option");
    expect(inferOffense({ pass_rate: 0.5, plays_per_game: 70, scramble_rate: 0.1 })).toBe("air_raid");
    expect(inferOffense({ pass_rate: 0.34, plays_per_game: 63, scramble_rate: 0.05 })).toBe("power_run");
    expect(drawSchemes(1, 2027, 5)).toEqual(drawSchemes(1, 2027, 5));
  });

  it("gives every team schemes, the academies the option", () => {
    const s = Season.create(loadSeed(), { seed: 2 });
    const all = s.allSchemes();
    for (const t of s.teams) {
      expect(SCHEMES[all[t.id].off].side).toBe("off");
      expect(SCHEMES[all[t.id].def].side).toBe("def");
    }
    for (const school of ["Army", "Navy", "Air Force"]) expect(all[s.teams.find((t) => t.school === school)!.id].off).toBe("option");
    const fronts = s.teams.filter((t) => t.level === "fbs").map((t) => all[t.id].def);
    expect(new Set(fronts).size).toBe(4);
  });
});
