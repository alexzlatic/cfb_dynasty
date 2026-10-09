import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import { Season } from "../src/season.ts";
import { addDays } from "../src/dates.ts";
import { gradeOf } from "../src/recruiting.ts";
import { HS_COLS, HS_LEAD, hsSeason, hsSeasons, statRead } from "../src/hsstats.ts";

const s = Season.create(loadSeed(), { seed: 7, settings: { keep_pbp: "none" } as never });
const st = s.state.recruiting!, year = s.state.year;
const corr = (a: number[], b: number[]) => {
  const m = (x: number[]) => x.reduce((q, v) => q + v, 0) / x.length;
  const ma = m(a), mb = m(b);
  let n = 0, da = 0, db = 0;
  a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; });
  return n / Math.sqrt(da * db);
};

describe("high school stats", () => {
  const seniors = st.prospects.filter((p) => gradeOf(p, year) === 3);

  it("has a season per year he has started, the same every time, with his position's columns", () => {
    const p = seniors[0];
    const ss = hsSeasons(7, p, `${year}-12-20`);
    expect(ss.map((x) => x.grade)).toEqual([0, 1, 2, 3]);
    expect(hsSeasons(7, p, `${year}-12-20`)).toEqual(ss);
    for (const x of ss) if (x.level !== "jv") for (const c of HS_COLS[p.pos]) expect(x.stats[c.key]).toBeTypeOf("number");
    // This fall's season hasn't started in mid-August.
    expect(hsSeasons(7, p, `${year}-08-10`).length).toBe(3);
  });

  it("grows game by game through a season and never goes backward", () => {
    const qbs = seniors.filter((p) => p.pos === "QB").slice(0, 40);
    for (const p of qbs) {
      let prev = -1, games = -1;
      for (let d = `${year}-08-20`; d < `${year}-12-20`; d = addDays(d, 1)) {
        const x = hsSeason(7, p, 3, d);
        const y = x?.stats.pass_yds ?? 0, g = x?.g ?? 0;
        expect(y).toBeGreaterThanOrEqual(prev);
        expect(g).toBeGreaterThanOrEqual(games);
        prev = y; games = g;
      }
    }
  });

  it("puts most seniors and few freshmen on varsity", () => {
    const share = (g: number) => {
      const ps = st.prospects.filter((p) => gradeOf(p, year) === 3).slice(0, 1500);
      return ps.filter((p) => hsSeason(7, p, g as never, `${year}-12-20`)!.level !== "jv").length / ps.length;
    };
    expect(share(3)).toBeGreaterThan(0.9);
    expect(share(0)).toBeLessThan(0.35);
  });

  it("follows true ability with a fair bit of noise", () => {
    for (const pos of ["QB", "RB", "WR", "LB", "DE"] as const) {
      const rows = seniors.filter((p) => p.pos === pos).map((p) => ({ p, x: hsSeason(7, p, 3, `${year}-12-20`)! })).filter((r) => r.x.level === "varsity");
      const r = corr(rows.map((r) => r.x.stats[HS_LEAD[pos]] / Math.max(1, r.x.g)), rows.map((r) => r.p.path[3]));
      expect(r).toBeGreaterThan(0.35);
      expect(r).toBeLessThan(0.85);
    }
    const reads = seniors.map((p) => ({ p, r: statRead(7, p, `${year}-12-20`) })).filter((x) => x.r);
    expect(corr(reads.map((x) => x.r!.est), reads.map((x) => x.p.path[4]))).toBeGreaterThan(0.5);
  });

  it("produces realistic seasons for starters", () => {
    const med = (pos: string, key: string) => {
      const xs = seniors.filter((p) => p.pos === pos).map((p) => hsSeason(7, p, 3, `${year}-12-20`)!).filter((x) => x.level === "varsity").map((x) => x.stats[key]).sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)];
    };
    expect(med("QB", "pass_yds")).toBeGreaterThan(1300);
    expect(med("QB", "pass_yds")).toBeLessThan(2700);
    expect(med("RB", "rush_yds")).toBeGreaterThan(600);
    expect(med("LB", "tackles")).toBeGreaterThan(55);
    expect(med("LB", "tackles")).toBeLessThan(110);
  });
});
