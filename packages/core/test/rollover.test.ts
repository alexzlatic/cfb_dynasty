import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import { compiled, freshModel, nextSchedule, powerModel, rollRosters, ROSTER_LIMIT } from "../src/rollover.ts";
import type { Game } from "../src/types.ts";
import { z } from "../src/players.ts";

const seed = loadSeed();
const players = seed.players!;
const turn = (s = 3) => rollRosters({ seed: s, year: 2026, teams: seed.teams, players, model: freshModel(players), next_player_id: 900_000_001, growth: () => new Map(), gp: {} });

describe("rollover", () => {
  it("moves every roster on a year: seniors leave, the rest develop, freshmen fill it back", () => {
    const t = turn();
    expect(turn()).toEqual(t);
    const iowa = 2294;
    const before = players[iowa].players, after = t.players[iowa].players;
    expect(after.length).toBe(Math.min(ROSTER_LIMIT, before.length));
    for (const p of before) {
      const now = after.find((x) => x.id === p.id);
      if (p.years + 1 >= 5) expect(now).toBeUndefined();
      if (!now) continue;
      expect(now.years).toBe(p.years + 1);
      expect(now.class).not.toBe("FR");
    }
    // With no surprise, a true freshman gains about 3 points (less past his potential).
    const fr = before.filter((p) => p.years === 0 && after.some((x) => x.id === p.id));
    const gain = fr.reduce((a, p) => a + after.find((x) => x.id === p.id)!.ovr - p.ovr, 0) / fr.length;
    expect(gain).toBeGreaterThan(2);
    expect(gain).toBeLessThan(4);
    // New freshmen rate like the team's real ones: around its level at each position, with as much spread.
    const fresh = t.added;
    expect(after.filter((p) => p.id >= 900_000_001).length).toBeGreaterThan(10);
    const m = freshModel(players);
    const res = fresh.map((p) => (z(p.ovr) - m.pos[p.pos].m - m.team[p.team_id]) / m.pos[p.pos].sd);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(avg(res))).toBeLessThan(0.1);
    expect(Math.sqrt(avg(res.map((x) => x * x)))).toBeGreaterThan(0.85);
    expect(Math.sqrt(avg(res.map((x) => x * x)))).toBeLessThan(1.25);
    // Strong programs' freshmen are better than weak programs'.
    expect(m.team[333]).toBeGreaterThan(m.team[2229] ?? 0);
    expect(fresh.every((p) => p.years === 0 && p.class === "FR" && p.first && p.last && p.hidden.potential > p.ovr - 5)).toBe(true);
    // Every team ends with a full depth chart and its scheme.
    for (const [id, tp] of Object.entries(t.players)) {
      expect(tp.depth.QB?.length).toBeGreaterThan(0);
      expect(tp.scheme).toBe(players[id].scheme);
    }
    expect(t.left.every((d) => ["graduated", "nfl", "released"].includes(d.reason))).toBe(true);
    for (const tp of Object.values(t.players)) expect(tp.players.length).toBeLessThanOrEqual(ROSTER_LIMIT);
    expect(new Set(t.added.map((p) => p.id)).size).toBe(t.added.length);
    expect(t.next_player_id).toBe(900_000_001 + t.added.length);
  });

  it("leaves younger players more room to their potential than older ones", () => {
    // Among each team's top 22 (the players a user looks at), by seasons in college.
    const room: number[][] = [[], [], [], [], []];
    for (const tp of Object.values(players)) {
      for (const p of [...tp.players].sort((a, b) => b.ovr - a.ovr).slice(0, 22)) room[Math.min(4, Math.floor(p.years))].push(p.hidden.potential - p.ovr);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const atCeiling = (xs: number[]) => xs.filter((x) => x <= 0).length / xs.length;
    for (let y = 1; y < 5; y++) expect(mean(room[y])).toBeLessThan(mean(room[y - 1]) - 1);
    expect(mean(room[0])).toBeGreaterThan(10);
    expect(atCeiling(room[0]) + atCeiling(room[1])).toBeLessThan(0.02);
    expect(atCeiling(room[4])).toBeGreaterThan(0.2);
  });

  it("repeats the schedule a year later with home and away swapped", () => {
    const games: Game[] = seed.schedule.map((g) => ({ ...g, kind: "regular", label: g.notes, status: "final", home_score: 1, away_score: 0, overtime: false }));
    const { start, schedule } = nextSchedule(games, seed.teams, seed.start_date, 9_500_000);
    expect(start >= "2027-08-22" && start <= "2027-08-28").toBe(true);
    expect(schedule).toHaveLength(seed.schedule.length);
    expect(schedule[0].id).toBe(9_500_000);
    const a = seed.schedule.find((g) => !g.neutral)!;
    const b = schedule.find((g) => g.home_id === a.away_id && g.away_id === a.home_id)!;
    expect(new Date(b.date).getUTCDay()).toBe(new Date(a.date).getUTCDay());
    const n = seed.schedule.find((g) => g.neutral);
    if (n) expect(schedule.find((g) => g.home_id === n.home_id && g.away_id === n.away_id)?.neutral).toBe(true);
  });

  it("estimates power from compiled ratings within a few points of the engine's", () => {
    const err: number[] = [];
    for (const [id, tp] of Object.entries(players)) {
      const r = seed.ratings[id]?.ratings;
      if (!r || seed.power[id] == null) continue;
      err.push(Math.abs(powerModel(compiled(r, tp)) - seed.power[id]));
    }
    err.sort((a, b) => a - b);
    expect(err[Math.floor(err.length / 2)]).toBeLessThan(1.5);
    expect(err[Math.floor(err.length * 0.95)]).toBeLessThan(3.5);
  });
});
