import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import {
  FACTORS, choiceChances, choose, miles, need, offerScore, persona, schoolValue, styleOf, topSchools, type SchoolOffer,
} from "../src/valuation.ts";

const offer = (o: Partial<SchoolOffer> & { team_id: number }): SchoolOffer => ({
  prestige: 50, power: false, win_pct: 0.5, miles: 300, home_state: false, money: 0,
  start_chance: 0.3, development: 0, fit: 0, chemistry: 0, ...o,
});

describe("valuation", () => {
  it("gives every player a fixed personality, about a fifth of each kind", () => {
    expect(persona(7, 1234)).toEqual(persona(7, 1234));
    const kinds: Record<string, number> = {};
    for (let pid = 0; pid < 5000; pid++) {
      const p = persona(7, pid);
      kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
      for (const f of FACTORS) expect(p[f]).toBeGreaterThan(0);
    }
    for (const n of Object.values(kinds)) { expect(n / 5000).toBeGreaterThan(0.17); expect(n / 5000).toBeLessThan(0.23); }
    // Mercenaries care about money more than steady players do.
    const avg = (k: string, f: "money" | "loyalty") => {
      const ps = Array.from({ length: 2000 }, (_, i) => persona(3, i)).filter((p) => p.kind === k);
      return ps.reduce((a, p) => a + p[f], 0) / ps.length;
    };
    expect(avg("mercenary", "money")).toBeGreaterThan(avg("steady", "money") * 1.5);
    expect(avg("steady", "loyalty")).toBeGreaterThan(avg("mercenary", "loyalty") * 2);
  });

  it("chooses by logit chances", () => {
    const c = choiceChances([1, 0, 0]);
    expect(c.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(c[0]).toBeCloseTo(Math.E / (Math.E + 2), 10);
    expect(choose([1, 0, 0], 0)).toBe(0);
    expect(choose([1, 0, 0], 0.999)).toBe(2);
    expect(choose([0, 50], 0.5)).toBe(1);
  });

  it("needs a position more when its room is thin or has no starter", () => {
    const full = Array.from({ length: 4 }, () => ({ ovr: 80 }));
    expect(need("QB", full, 70)).toBe(0.75);
    expect(need("QB", [], 70)).toBe(1.6);
    expect(need("QB", [{ ovr: 60 }, { ovr: 60 }], 70)).toBeGreaterThan(need("QB", [{ ovr: 80 }, { ovr: 60 }], 70));
    expect(need("OL", Array.from({ length: 20 }, () => ({ ovr: 50 })), 70)).toBeLessThanOrEqual(1.6);
  });

  it("values players by school style", () => {
    const base = { value: 1_000_000, need: 1, fit: 0 };
    // A develop school pays more for a freshman recruit; a win-now school for a veteran transfer.
    expect(schoolValue({ ...base, style: "develop", source: "recruit", years: 0 }))
      .toBeGreaterThan(schoolValue({ ...base, style: "win_now", source: "recruit", years: 0 }));
    expect(schoolValue({ ...base, style: "win_now", source: "transfer", years: 4 }))
      .toBeGreaterThan(schoolValue({ ...base, style: "develop", source: "transfer", years: 4 }));
    expect(schoolValue({ ...base, style: "develop", source: "own", years: 2 })).toBe(1_200_000);
    expect(schoolValue({ ...base, style: "balanced", source: "own", years: 2, fit: 1, need: 1.5 })).toBe(1_875_000);
  });

  it("reads each school's style from its real newcomers", () => {
    const { styles, teams } = loadSeed();
    const id = (s: string) => teams.find((t) => t.school === s)!.id;
    expect(styleOf(styles, id("Miami"))).toBe("win_now");
    expect(styleOf(styles, id("Iowa"))).toBe("develop");
    expect(styleOf(styles, id("Colorado"))).toBe("portal");
    expect(styleOf(undefined, id("Iowa"))).toBe("balanced");
  });

  it("ranks nearby and power schools high for a good recruit, money for a mercenary", () => {
    const p = { id: 9, value: 400_000, quality: 2, persona: { ...persona(1, 9), money: 1, playing: 1, development: 1, fit: 1, winning: 1, home: 1, loyalty: 1 } };
    const near = offer({ team_id: 1, miles: 40, home_state: true, power: true, prestige: 60 });
    const far = offer({ team_id: 2, miles: 1500, power: true, prestige: 60 });
    const small = offer({ team_id: 3, miles: 40, home_state: true, prestige: 60 });
    expect(offerScore(near, p)).toBeGreaterThan(offerScore(far, p));
    expect(offerScore(near, p)).toBeGreaterThan(offerScore(small, p));
    const paid = { ...far, money: 1_200_000 }, unpaid = { ...near, money: 200_000 };
    const merc = { ...p, persona: { ...p.persona, money: 3, home: 0.5 } };
    expect(offerScore(paid, merc) - offerScore(unpaid, merc)).toBeGreaterThan(offerScore(paid, p) - offerScore(unpaid, p));
    const list = topSchools([far, small, near], p, 5, 2);
    expect(list).toHaveLength(2);
    expect(list).toEqual(topSchools([near, small, far], p, 5, 2));
  });

  it("measures miles", () => {
    // Minneapolis to West Lafayette is about 450 miles as the crow flies.
    expect(miles({ lat: 44.97, lon: -93.23 }, { lat: 40.42, lon: -86.92 })).toBeGreaterThan(420);
    expect(miles({ lat: 44.97, lon: -93.23 }, { lat: 40.42, lon: -86.92 })).toBeLessThan(480);
  });
});
