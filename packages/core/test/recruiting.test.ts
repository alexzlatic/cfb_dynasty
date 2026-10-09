import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import { Season, type SeasonState } from "../src/season.ts";
import { CARRY, READ_SD, generateClass, classShape, gradeOf, readSd, starsOf, truthAt, schoolRead, type Prospect, type SchoolEye } from "../src/recruiting.ts";
import { addDays } from "../src/dates.ts";

const seed = loadSeed();
const rs = seed.recruiting!;
const fresh = () => Season.create(seed, { seed: 7, settings: { keep_pbp: "none" } as never });
const corr = (a: number[], b: number[]) => {
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = m(a), mb = m(b);
  let n = 0, da = 0, db = 0;
  a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; });
  return n / Math.sqrt(da * db);
};

describe("recruit classes", () => {
  const s = fresh();
  const st = s.state.recruiting!;

  it("has four full classes and a service that rates about 50 freshmen, 500 sophomores and every junior and senior", () => {
    const by = (g: number) => st.prospects.filter((p) => gradeOf(p, s.state.year) === g);
    for (const g of [0, 1, 2, 3]) expect(by(g).length).toBeGreaterThan(3500);
    expect(by(0).filter((p) => p.svc).length).toBe(50);
    expect(by(1).filter((p) => p.svc).length).toBe(500);
    expect(by(2).filter((p) => p.svc).length).toBe(by(2).length);
    // The real 2027 class keeps its real ratings: about 35 five-stars and 450 four-stars a class.
    const sr = by(3).filter((p) => p.svc);
    expect(sr.length).toBe(by(3).length);
    const five = sr.filter((p) => starsOf(p.svc!.r) === 5).length, four = sr.filter((p) => starsOf(p.svc!.r) === 4).length;
    expect(five).toBeGreaterThan(20);
    expect(five).toBeLessThan(45);
    expect(four).toBeGreaterThan(350);
    expect(four).toBeLessThan(550);
  });

  it("moves true potential a little every day, never in jumps, and less as a prospect gets older", () => {
    const ps = st.prospects.filter((p) => gradeOf(p, s.state.year) === 0).slice(0, 300);
    let worst = 0;
    const yearly = [0, 0, 0, 0];
    for (const p of ps) {
      let d = `${s.state.year}-08-01`, prev = truthAt(p, d);
      for (let i = 1; i < 4 * 365; i++) {
        d = addDays(d, 1);
        const v = truthAt(p, d);
        worst = Math.max(worst, Math.abs(v - prev));
        prev = v;
      }
      for (let g = 0; g < 4; g++) yearly[g] += Math.abs(p.path[g + 1] - p.path[g]) / ps.length;
    }
    // No day moves anyone more than a tenth of a point.
    expect(worst).toBeLessThan(0.1);
    // Year-to-year swings shrink with age (the carry rises toward 1).
    expect(yearly[0]).toBeGreaterThan(yearly[1]);
    expect(yearly[1]).toBeGreaterThan(yearly[2]);
    expect(yearly[2]).toBeGreaterThan(yearly[3]);
  });

  it("carries potential year to year as designed: a senior's is close to his arrival, a freshman's much less", () => {
    const ps = generateClass({ seed: 3, cls: 2030, year: 2026, n: 6000, rs, shape: classShape(rs), firsts: ["A"], lasts: ["B"], startId: 1 });
    const at = (g: number) => ps.map((p) => p.path[g]);
    expect(corr(at(3), at(4))).toBeGreaterThan(CARRY[3] - 0.04);
    const fr = CARRY.reduce((a, c) => a * c, 1);
    expect(Math.abs(corr(at(0), at(4)) - fr)).toBeLessThan(0.06);
  });

  it("narrows a school's read every day as he ages, and more in its own region", () => {
    const p = st.prospects.find((x) => gradeOf(x, s.state.year) === 0 && x.home.state === "TX")!;
    const eye = (lat: number, lon: number, state: string): SchoolEye => ({ id: 1, lat, lon, state, regions: [], national: false, width: 1 });
    const near = eye(30.3, -97.7, "TX"), far = eye(44.9, -93.2, "MN");
    let d = `${s.state.year}-08-01`, prev = readSd(far, p, d);
    expect(prev).toBeGreaterThan(READ_SD[3]);
    for (let i = 1; i < 4 * 365; i++) {
      d = addDays(d, 1);
      const v = readSd(far, p, d);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - v).toBeLessThan(0.05);
      expect(readSd(near, p, d)).toBeLessThan(v);
      prev = v;
    }
  });

  it("moves each estimate a little every day, with no date that swings them all", () => {
    const eye: SchoolEye = { id: 2294, lat: 41.66, lon: -91.55, state: "IA", regions: [], national: true, width: 1 };
    const ps = st.prospects.filter((p) => p.svc && gradeOf(p, s.state.year) >= 2).slice(0, 400);
    let worst = 0;
    for (let d = `${s.state.year}-08-01`; d < `${s.state.year + 1}-02-01`; d = addDays(d, 1)) {
      const next = addDays(d, 1);
      for (const p of ps) worst = Math.max(worst, Math.abs(schoolRead(eye, p, next, 7).est - schoolRead(eye, p, d, 7).est));
    }
    expect(worst).toBeLessThan(0.25);
  });
});

describe("finding prospects", () => {
  it("knows the rated prospects, more near home, and finds more over time and where it scouts", () => {
    const iowa = seed.teams.find((t) => t.school === "Iowa")!;
    const s = Season.create(seed, { seed: 7, user_team_id: iowa.id, settings: { keep_pbp: "none" } as never });
    const st = s.state.recruiting!;
    const fr = (k: Set<number>, f: (p: Prospect) => boolean = () => true) => st.prospects.filter((p) => gradeOf(p, s.state.year) === 0 && !p.svc && f(p) && k.has(p.id)).length;
    const near = (p: Prospect) => p.home.state === "IA", tx = (p: Prospect) => p.home.state === "TX";
    const k0 = s.knownProspects();
    for (const p of st.prospects) if (p.svc) expect(k0.has(p.id)).toBe(true);
    // Unrated sophomores: a good share near home, few far away.
    const so = (f: (p: Prospect) => boolean) => { const all = st.prospects.filter((p) => gradeOf(p, s.state.year) === 1 && !p.svc && f(p)); return all.filter((p) => k0.has(p.id)).length / all.length; };
    expect(so(near)).toBeGreaterThan(0.2);
    // (Some unrated sophomores are good players the service missed, and better prospects are found sooner.)
    expect(so(tx)).toBeLessThan(0.07);
    s.setScoutRegion("texas", true);
    const tx0 = fr(k0, tx), ia0 = fr(k0, near);
    while (s.state.date < "2026-11-01") s.advanceDay();
    const k1 = s.knownProspects();
    expect(fr(k1, near)).toBeGreaterThan(ia0);
    expect(fr(k1, tx)).toBeGreaterThan(tx0 + 20);
  }, 120_000);
});

describe("recruiting in a season", () => {
  it("is the same every time, and the same after a save and reopen", () => {
    const a = fresh(), b = fresh();
    const to = (x: Season, d: string) => { while (x.state.date < d) x.advanceDay(); };
    to(a, "2026-09-20");
    to(b, "2026-09-20");
    expect(b.state.recruiting).toEqual(a.state.recruiting);
    // Reopen b from its saved state (as a league file does) and play both on.
    const c = new Season(JSON.parse(JSON.stringify(b.state)) as SeasonState, seed);
    to(a, "2026-10-18");
    to(c, "2026-10-18");
    // (Compared as saved: a save turns -0 into 0.)
    expect(JSON.stringify(c.state.recruiting)).toBe(JSON.stringify(a.state.recruiting));
    const commits = (x: Season) => x.state.recruiting!.prospects.filter((p: Prospect) => p.commit).length;
    expect(commits(a)).toBeGreaterThan(0);
  }, 120_000);
});

describe("your big board", () => {
  it("starts with your commits on it, adds new ones each week, and keeps one you take off off", () => {
    const osu = seed.teams.find((t) => t.school === "Ohio State")!;
    const s = Season.create(seed, { seed: 7, user_team_id: osu.id, settings: { keep_pbp: "none" } as never });
    const st = s.state.recruiting!;
    const mine = () => st.prospects.filter((p) => p.commit?.team === osu.id).map((p) => p.id);
    expect(mine().length).toBeGreaterThan(5);
    expect(new Set(st.user.board)).toEqual(new Set(mine()));
    const gone = st.user.board![0];
    s.setBoard(gone, false);
    while (s.state.date < "2026-10-18") s.advanceDay();
    const board = new Set(st.user.board);
    expect(board.has(gone)).toBe(false);
    for (const id of mine()) if (id !== gone) expect(board.has(id)).toBe(true);
  }, 120_000);
});
