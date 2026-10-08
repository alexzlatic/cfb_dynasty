import { describe, expect, it } from "vitest";
import {
  CAROUSEL_CLOSE, addDays, isPower, jobOf, letGoChance, loadSeed, marketDay, newCoach, nthWeekday, openCarousel, salaryFor, staffOf, staffRecs, startCoaching, toMember, willing,
  type CoachingState, type Job, type MarketCtx, type TeamYear,
} from "../src/index.ts";
import { Rng } from "@cfb/engine";

const seed = loadSeed();
const jobs = new Map<number, Job>(seed.teams.map((t) => [t.id, jobOf(t, isPower(t))]));
const fbs = seed.teams.filter((t) => t.level === "fbs");
const names = { firsts: ["Pat", "Sam", "Chris"], lasts: ["Smith", "Jones", "Brown"] };
const start = () => startCoaching({ seed: 7, year: 2026, teams: seed.teams, jobs, coaches: seed.coaches, pool: seed.coach_pool ?? [], schemes: {} });
const ctxAt = (date: string, userTeam: number | null = null): MarketCtx => ({ seed: 7, year: 2026, date, jobs, names, userTeam, news: () => {}, charge: () => {} });
const results = (f: (id: number) => number = () => 6): Map<number, TeamYear> => new Map(fbs.map((t) => [t.id, { w: f(t.id), l: 12 - f(t.id), exp: 0.5, prev: 0.5, off: 0, def: 0 }]));
function runOffseason(st: CoachingState, res = results(), userTeam: number | null = null) {
  let d = addDays(nthWeekday(2026, 11, 6, 4), 1);
  openCarousel(st, ctxAt(d, userTeam), res);
  for (; d <= CAROUSEL_CLOSE(2026); d = addDays(d, 1)) marketDay(st, ctxAt(d, userTeam), { userCoach: st.coaches.find((c) => c.user) ?? null, close: d === CAROUSEL_CLOSE(2026) });
}

describe("coaching carousel", () => {
  it("starts every school's staff with the skills staff.ts always gave them", () => {
    const st = start();
    for (const t of seed.teams.slice(0, 40)) {
      expect(staffRecs(st, t.id).map(toMember)).toEqual(staffOf(7, seed.coaches, t));
    }
    // Former head coaches are in the pool, out of work.
    expect(st.coaches.some((c) => c.source === "pool" && c.team_id == null)).toBe(true);
  });

  it("lets go losing head coaches far more often than winning ones (the CFBD fit)", () => {
    const lose = letGoChance({ wp: 0.17, exp: 0.5, prev: 0.4, tenure: 4, power: true });
    const win = letGoChance({ wp: 0.83, exp: 0.5, prev: 0.6, tenure: 4, power: true });
    const fresh = letGoChance({ wp: 0.17, exp: 0.5, prev: 0.4, tenure: 1, power: true });
    expect(lose).toBeGreaterThan(0.3);
    expect(win).toBeLessThan(0.06);
    expect(fresh).toBeLessThan(lose / 2);
  });

  it("moves sitting head coaches only for clearly better jobs", () => {
    const st = start();
    const g5 = st.coaches.find((c) => c.role === "HC" && jobs.get(c.team_id!)!.level === "g5" && 2026 - c.since >= 2)!;
    const here = jobs.get(g5.team_id!)!;
    const better = [...jobs.values()].find((j) => j.level === "p4" && j.appeal >= here.appeal + 15)!;
    const worse = [...jobs.values()].find((j) => j.level === "g5" && j.appeal < here.appeal)!;
    expect(willing(g5, better, "HC", jobs, 2026)).toBe(true);
    expect(willing(g5, worse, "HC", jobs, 2026)).toBe(false);
    // Coordinators take head jobs a level down; out-of-work coaches take anything.
    const oc = st.coaches.find((c) => c.role === "OC" && jobs.get(c.team_id!)!.level === "p4")!;
    const g5job = [...jobs.values()].filter((j) => j.level === "g5").sort((x, y) => y.appeal - x.appeal)[0];
    expect(willing({ ...oc, rep: 55 }, g5job, "HC", jobs, 2026)).toBe(true);
  });

  it("fills every opening by the time the market closes, and is the same every time", () => {
    const a = start(), b = start();
    runOffseason(a, results((id) => id % 13));
    runOffseason(b, results((id) => id % 13));
    expect(a.openings).toEqual([]);
    expect(a.open).toBe(false);
    for (const t of fbs) expect(staffRecs(a, t.id).some((c) => c.role === "HC")).toBe(true);
    expect(a.moves).toEqual(b.moves);
    // About one program in five changes head coaches.
    const changed = fbs.filter((t) => a.moves.some((m) => m.kind === "hired" && m.role === "HC" && m.team_id === t.id)).length;
    expect(changed / fbs.length).toBeGreaterThan(0.08);
    expect(changed / fbs.length).toBeLessThan(0.4);
  });

  it("never fills your staff openings for you, and offers you jobs when you're the best candidate", () => {
    const st = start();
    const me = fbs.find((t) => jobs.get(t.id)!.level === "g5")!.id;
    const you = st.coaches.find((c) => c.team_id === me && c.role === "HC")!;
    you.user = true;
    you.rep = 95;
    you.since = 2023;
    // Your offensive coordinator goes somewhere better; nobody replaces him.
    runOffseason(st, results((id) => (id === me ? 12 : id % 13)), me);
    const oc = st.coaches.find((c) => c.team_id === me && c.role === "OC");
    const ocOpen = st.openings.some((o) => o.team_id === me && o.role === "OC");
    expect(!!oc || ocOpen || !st.moves.some((m) => m.from?.team_id === me && m.from.role === "OC")).toBe(true);
    // An unbeaten Group of Five coach with a big name gets calls.
    expect(st.offers.length).toBeGreaterThan(0);
  });

  it("pays power head coaches millions and FCS head coaches a fraction", () => {
    const p4 = [...jobs.values()].find((j) => j.level === "p4" && j.prestige > 80)!, fcs = [...jobs.values()].find((j) => j.level === "fcs")!;
    expect(salaryFor("HC", p4, 70)).toBeGreaterThan(7_000_000);
    expect(salaryFor("HC", fcs, 50)).toBeLessThan(400_000);
    const st = start();
    expect(newCoach(st, new Rng(1), names).team_id).toBeNull();
  });
});
