import { describe, expect, it } from "vitest";
import { declareChance, draftPrestige, PICKS, ROUND_SIZES, runDraft, type DraftEntrant } from "../src/draft.ts";
import type { Pos } from "../src/players.ts";

const POS: Pos[] = ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P"];
const pool: DraftEntrant[] = Array.from({ length: 900 }, (_, i) => ({
  pid: i + 1, team_id: 100 + (i % 120), name: `P${i}`, pos: POS[i % POS.length], ovr: 60 + ((i * 37) % 35),
  potential: 70 + ((i * 53) % 29), years: 2 + (i % 3), early: i % 3 === 0, tier: (i % 7 === 0 ? 1 : i % 11 === 0 ? 2 : 0) as 0 | 1 | 2,
}));

describe("NFL draft", () => {
  it("makes 257 picks in seven rounds, the same every time for a seed and year", () => {
    const picks = runDraft(pool, 7, 2027);
    expect(PICKS).toBe(257);
    expect(picks.length).toBe(257);
    expect(ROUND_SIZES.map((n, r) => picks.filter((p) => p.round === r + 1).length)).toEqual(ROUND_SIZES);
    expect(new Set(picks.map((p) => p.pid)).size).toBe(257);
    expect(runDraft(pool, 7, 2027)).toEqual(picks);
    expect(runDraft(pool, 7, 2028)).not.toEqual(picks);
    // Specialists go late if at all, and the first round is better than the last.
    expect(picks.slice(0, 32).some((p) => p.pos === "K" || p.pos === "P")).toBe(false);
    const avg = (xs: { ovr: number }[]) => xs.reduce((a, p) => a + p.ovr, 0) / xs.length;
    expect(avg(picks.slice(0, 32))).toBeGreaterThan(avg(picks.slice(-41)) + 3);
  });

  it("declares likelier the higher he'd go and the less staying pays", () => {
    expect(declareChance(10, 0)).toBeGreaterThan(declareChance(80, 0));
    expect(declareChance(80, 0)).toBeGreaterThan(declareChance(300, 0));
    expect(declareChance(10, 4_000_000)).toBeLessThan(declareChance(10, 500_000));
  });

  it("adds prestige for draft factories and takes a little from programs with none", () => {
    expect(draftPrestige(undefined)).toBe(0);
    expect(draftPrestige([12, 14, 13])).toBe(4);
    expect(draftPrestige([3, 3, 3])).toBe(0);
    expect(draftPrestige([0, 0, 0])).toBe(-1.5);
  });
});
