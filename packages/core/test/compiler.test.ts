import { describe, expect, it } from "vitest";
import { LEAGUE } from "@cfb/engine";
import { ATTRS, autoDepth, compileTeam, lineup, loadSeed, RATES, type Pos, type RatedPlayer } from "../src/index.ts";

const seed = loadSeed();
const byId = new Map<number, RatedPlayer>();
for (const t of Object.values(seed.players!)) for (const p of t.players) byId.set(p.id, p);

describe("ratings compiler", () => {
  it("a lineup of 75s plays at the FBS rates", () => {
    const fake: RatedPlayer[] = [];
    let id = 1;
    const counts: [Pos, number][] = [["QB", 2], ["RB", 3], ["WR", 5], ["TE", 2], ["OL", 7], ["DE", 3], ["DT", 3], ["LB", 3], ["CB", 4], ["S", 3], ["K", 1], ["P", 1], ["LS", 1]];
    for (const [pos, n] of counts) for (let i = 0; i < n; i++) {
      fake.push({ id: id++, team_id: 1, first: pos, last: String(i), pos, listed: pos, class: "JR", years: 2, jersey: null, height: null, weight: null,
        home: { city: null, state: null, lat: null, lon: null }, stars: null, composite: null, natl_rank: null,
        attrs: Object.fromEntries(ATTRS[pos].map((a) => [a, 75])), traits: { stamina: 75, injury: 50, toughness: 75, discipline: 75 },
        hidden: { potential: 75, work_ethic: 75 }, tend: {}, ovr: 75, basis: "prior", sample: 0 });
    }
    const m = new Map(fake.map((p) => [p.id, p]));
    const base = seed.ratings[Object.keys(seed.ratings)[0]].ratings;
    const r = compileTeam(base, lineup(autoDepth(fake), m), { offense: {}, defense: {} }, { fg_skill: 0, punt_gross: 43 });
    for (const k of RATES) {
      expect(r.offense[k]).toBeCloseTo(LEAGUE[k], 10);
      expect(r.defense[k]).toBeCloseTo(LEAGUE[k], 10);
    }
  });

  it("every team's seed depth chart compiles to its preseason team ratings", () => {
    for (const [tid, tp] of Object.entries(seed.players!)) {
      const base = seed.ratings[tid].ratings;
      const r = compileTeam(base, lineup(tp.depth, byId), tp.scheme, tp.kicking);
      for (const k of RATES) {
        expect(r.offense[k] / base.offense[k]).toBeCloseTo(1, 6);
        expect(r.defense[k] / base.defense[k]).toBeCloseTo(1, 6);
      }
      expect(r.fg_skill).toBeCloseTo(base.fg_skill, 3);
    }
  });

  it("losing the starting QB makes a team worse", () => {
    let worse = 0, n = 0;
    for (const [tid, tp] of Object.entries(seed.players!)) {
      if (seed.teams.find((t) => t.id === Number(tid))?.level !== "fbs") continue;
      const base = seed.ratings[tid].ratings;
      const full = compileTeam(base, lineup(tp.depth, byId), tp.scheme, tp.kicking);
      const hurt = compileTeam(base, lineup(tp.depth, byId, new Set([tp.depth.QB![0]])), tp.scheme, tp.kicking);
      n++;
      if (hurt.offense.comp_pct < full.offense.comp_pct || hurt.offense.int_rate > full.offense.int_rate) worse++;
    }
    // Not every team: some real starters (placed from the first 2026 game) rate below their backup.
    expect(worse / n).toBeGreaterThan(0.75);
  });
});
