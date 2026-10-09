import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import { Season } from "../src/season.ts";
import { SEASON_TIME, labPace, prepFactor, timeSplit } from "../src/staff.ts";
import { labWork } from "../src/hidden.ts";
import { REGION_REPORT_HOURS, regionOf } from "../src/recruiting.ts";

const seed = loadSeed();

describe("the staff's week", () => {
  it("gives development its own share, out of practice for a week saved before it had one", () => {
    const old = timeSplit({ recruiting: 0.3, scouting: 0.1, prep: 0.45, opponent: 0.15 }, true);
    const now = timeSplit(SEASON_TIME, true);
    for (const k of ["recruiting", "scouting", "prep", "develop", "opponent"] as const) expect(old[k]).toBeCloseTo(now[k], 9);
    expect(prepFactor(now.prep, 50)).toBe(1);
    expect(labPace(now.develop)).toBe(1);
    expect(labPace(0)).toBe(0);
    expect(labPace(0.2)).toBeCloseTo(1.414, 3);
    // Out of season the week is recruiting and scouting, as before.
    const off = timeSplit(SEASON_TIME, false);
    expect(off.develop + off.prep + off.opponent).toBe(0);
    expect(off.recruiting).toBeCloseTo(0.75, 9);
  });

  it("counts a plan's work at the pace it was given", () => {
    const l = { area: "technique" as const, from: "2026-09-01" };
    expect(labWork(l, "2026-09-21")).toBe(20);
    const tallied = { ...l, work: 5, upto: "2026-09-11" };
    expect(labWork(tallied, "2026-09-21", 2)).toBe(25);
    expect(labWork(tallied, "2026-09-06")).toBe(2.5);
    expect(labWork({ ...l, work: 99, upto: "2026-12-01" }, "2026-12-11")).toBe(100);
  });

  it("speeds development plans up with more development time in season, and stops them with none", () => {
    const run = (develop: number) => {
      const s = Season.create(seed, { seed: 5, user_team_id: 2509, settings: { keep_pbp: "none" } as never });
      while (s.state.date < "2026-09-01") s.advanceDay();
      const p = s.roster(2509).find((x) => x.pos === "WR")!;
      s.setLab(p.id, "technique");
      s.setStaffTime({ recruiting: 0.3, scouting: 0.1, prep: 0.45 - develop, develop, opponent: 0.15 });
      for (let i = 0; i < 21; i++) s.advanceDay();
      return s.state.lab![p.id].work!;
    };
    expect(run(0.1)).toBeCloseTo(20, 6);
    expect(run(0.2)).toBeCloseTo(20 * Math.SQRT2, 1);
    expect(run(0)).toBe(0);
  }, 120_000);
});

describe("scouting assignments and reports", () => {
  it("sends scouts for the trips you set, then reports; hours in a region find prospects and come back as a report", () => {
    const iowa = seed.teams.find((t) => t.school === "Iowa")!;
    const s = Season.create(seed, { seed: 7, user_team_id: iowa.id, settings: { keep_pbp: "none" } as never });
    const st = s.state.recruiting!, u = st.user;
    s.setStaffTime({ recruiting: 0.3, scouting: 0.3, prep: 0.25, develop: 0.05, opponent: 0.1 });
    const target = st.prospects.find((p) => p.svc && p.home.state === "TX" && !p.commit && p.cls === s.state.year + 1)!;
    s.setScoutTarget(target.id, true, 2);
    expect(u.trips_left![target.id]).toBe(2);
    expect(u.scout_from![target.id]).toBeTruthy();
    s.setRegionHours("texas", 12);
    const known0 = s.knownProspects();
    const plan = s.scoutingPlan()!;
    expect(plan.hours).toBe(48);
    expect(plan.trips).toBe(9);
    expect(plan.region_hours).toBe(12);
    // Two Sundays: two trips, then a report; 24 hours in Texas, then a report.
    while (s.state.date < "2026-09-07") s.advanceDay();
    expect(u.evals[target.id]).toBe(2);
    expect(u.scout).not.toContain(target.id);
    expect(u.trips_left![target.id]).toBeUndefined();
    const reports = u.reports!;
    const player = reports.find((r) => r.kind === "player")!;
    expect(player.lines[0].pid).toBe(target.id);
    expect(player.before).toBeTruthy();
    expect(player.lines[0].hi - player.lines[0].lo).toBeLessThan(player.before!.hi - player.before!.lo);
    const region = reports.find((r) => r.kind === "region")!;
    expect(region.region).toBe("texas");
    expect(region.hours).toBeGreaterThanOrEqual(REGION_REPORT_HOURS);
    expect(region.lines.length).toBeGreaterThanOrEqual(6);
    for (const x of region.lines) expect(regionOf(st.prospects.find((p) => p.id === x.pid)!.home)).toBe("texas");
    // The best come first; everyone on it is now known to your staff.
    const best = region.lines.slice(0, 6).map((x) => x.est);
    expect([...best].sort((a, b) => b - a)).toEqual(best);
    const known1 = s.knownProspects();
    for (const x of region.lines) expect(known1.has(x.pid)).toBe(true);
    expect([...known1].filter((id) => !known0.has(id) && regionOf(st.prospects.find((p) => p.id === id)!.home) === "texas").length).toBeGreaterThan(0);
    expect(u.region_done!.texas).toBe(0);
  }, 120_000);

  it("keeps an assignment's place and starting read when you change its trips, and moves it when asked", () => {
    const s = Season.create(seed, { seed: 7, user_team_id: 2509, settings: { keep_pbp: "none" } as never });
    const ids = s.state.recruiting!.prospects.filter((p) => p.svc).slice(0, 3).map((p) => p.id);
    for (const id of ids) s.setScoutTarget(id, true, 3);
    const u = s.state.recruiting!.user, from = u.scout_from![ids[0]];
    s.setScoutTarget(ids[0], true, 5);
    expect(u.scout).toEqual(ids);
    expect(u.trips_left![ids[0]]).toBe(5);
    expect(u.scout_from![ids[0]]).toBe(from);
    s.setScoutTarget(ids[2], true, 3, 0);
    expect(u.scout).toEqual([ids[2], ids[0], ids[1]]);
    s.setScoutTarget(ids[1], false);
    expect(u.scout).toEqual([ids[2], ids[0]]);
    expect(u.trips_left![ids[1]]).toBeUndefined();
  });
});
