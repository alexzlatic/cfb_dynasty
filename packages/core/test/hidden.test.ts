import { describe, expect, it } from "vitest";
import { averageTeam } from "@cfb/engine";
import { applyHidden, hiddenPlayer, loadSeed, progress, Season } from "../src/index.ts";

const sd = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

describe("hidden development, scheme fit and chemistry", () => {
  const seed = loadSeed();

  it("builds through spring and fall camp and is drawn from the league seed", () => {
    expect(progress(2026, "2026-02-01")).toBe(0);
    expect(progress(2026, "2026-04-30")).toBeCloseTo(0.4);
    expect(progress(2026, "2026-08-24")).toBeCloseTo(0.85);
    expect(progress(2026, "2026-12-01")).toBe(1);
    const p = Object.values(seed.players!)[0].players[0];
    expect(hiddenPlayer(7, 2026, p)).toEqual(hiddenPlayer(7, 2026, p));
    expect(hiddenPlayer(7, 2026, p)).not.toEqual(hiddenPlayer(8, 2026, p));
    const a = Season.create(seed, { seed: 11 }), b = Season.create(seed, { seed: 11 }), c = Season.create(seed, { seed: 12 });
    const id = seed.teams.find((t) => t.level === "fbs")!.id;
    expect(a.hiddenStrength(id, "2026-11-15")!.off).toBe(b.hiddenStrength(id, "2026-11-15")!.off);
    expect(a.hiddenStrength(id, "2026-11-15")!.off).not.toBe(c.hiddenStrength(id, "2026-11-15")!.off);
    // The scouted view (power, polls, the AD) never sees it.
    expect(a.state.power).toEqual(c.state.power);
  });

  it("surprises are about as big as real ones, smaller for continuity teams than with a new coach", () => {
    const all: number[] = [], cont: number[] = [], hc: number[] = [];
    for (const k of [1, 2]) {
      const s = Season.create(seed, { seed: 300 + k });
      for (const t of s.teams.filter((x) => x.level === "fbs")) {
        const h = s.hiddenStrength(t.id, `${s.state.year}-11-15`)!;
        all.push(h.off + h.def);
        const c = s.teamContext(t.id);
        if (c.continuity) cont.push(h.off + h.def);
        if (c.new_coach) hc.push(h.off + h.def);
      }
    }
    expect(sd(all)).toBeGreaterThan(5.5);
    expect(sd(all)).toBeLessThan(7.8);
    expect(sd(cont)).toBeLessThan(sd(hc));
  });

  it("a development plan adds about two overall points over a season", () => {
    const s = Season.create(seed, { seed: 5, user_team_id: 2509 });
    const p = s.roster(2509).find((x) => x.pos === "WR")!;
    const before = s.hidden(2509, "2026-11-15")!.growth.get(p.id)!;
    s.setLab(p.id, "technique");
    const after = s.hidden(2509, "2026-11-15")!.growth.get(p.id)!;
    expect(after - before).toBeGreaterThan(1.5);
    expect(after - before).toBeLessThan(3);
    expect(() => s.setLab(s.roster(135)[0].id, "film")).toThrow(/own players/);
  });

  it("hidden strength moves a unit's rates the right way", () => {
    const r = averageTeam(), up = applyHidden(r, 4, 4);
    expect(up.offense.comp_pct).toBeGreaterThan(r.offense.comp_pct);
    expect(up.offense.sack_rate).toBeLessThan(r.offense.sack_rate);
    expect(up.defense.comp_pct).toBeLessThan(r.defense.comp_pct);
    expect(applyHidden(r, 0, 0)).toBe(r);
  });
});
