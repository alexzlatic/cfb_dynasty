import { describe, expect, it } from "vitest";
import { GameSim, Rng } from "@cfb/engine";
import { GameDay, TYPICAL_TIREDNESS, compileTeam, lineup, loadSeed, mixSeed, withFatigue, type Group, type Slot } from "../src/index.ts";

const seed = loadSeed();
const fbs = seed.teams.filter((t) => t.level === "fbs").map((t) => t.id);
const setup = (id: number) => {
  const tp = seed.players![id];
  return { team_id: id, base: seed.ratings[id].ratings, players: tp, depth: tp.depth, out: new Set<number>() };
};

function games(n: number, injuries = 1) {
  const rng = new Rng(3);
  return Array.from({ length: n }, (_, i) => {
    const h = fbs[Math.floor(rng.random() * fbs.length)], a = fbs[(fbs.indexOf(h) + 1 + Math.floor(rng.random() * 50)) % fbs.length];
    const hs = setup(h), as = setup(a);
    const gd = new GameDay(hs, as, new Rng(mixSeed(9, i, "gameday")), { injuries });
    const k = gd.kickoff();
    const sim = new GameSim(k.home, k.away, { seed: i, record: true }).play(gd.provider());
    return { sides: [hs, as], day: gd.result(), sim };
  });
}

describe("game day", () => {
  const played = games(300);
  const share = (slot: Slot, side: "offense" | "defense") => {
    const xs = played.flatMap(({ sides, day }) => sides.map((s) => (day.snaps[s.depth[slot]![0]] ?? 0) / Math.max(1, day.plays[s.team_id][side])));
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  it("rotates defensive linemen heavily and quarterbacks and linemen rarely", () => {
    expect(share("DT1", "defense")).toBeGreaterThan(0.5);
    expect(share("DT1", "defense")).toBeLessThan(0.72);
    expect(share("DE1", "defense")).toBeLessThan(0.75);
    expect(share("QB", "offense")).toBeGreaterThan(0.85);
    expect(share("C", "offense")).toBeGreaterThan(0.9);
  });

  it("hurts about as many players as real football and notes them in the play-by-play", () => {
    const all = played.flatMap((p) => p.day.injuries);
    const perTeamGame = all.length / (2 * played.length);
    expect(perTeamGame).toBeGreaterThan(1);
    expect(perTeamGame).toBeLessThan(2.5);
    const missTime = all.filter((x) => (x.days ?? 0) >= 5).length / (2 * played.length);
    expect(missTime).toBeGreaterThan(0.4);
    expect(missTime).toBeLessThan(1.2);
    const notes = played.flatMap((p) => p.sim.plays.filter((x) => x.play_type === "INJURY"));
    expect(notes.length).toBe(all.length);
  });

  it("puts an injured player's backup in for the rest of the game", () => {
    const hurt = played.flatMap(({ day, sides }) => day.injuries.filter((x) => x.days != null && x.pos === "QB").map((x) => ({ x, day, sides })));
    expect(hurt.length).toBeGreaterThan(0);
    for (const { x, day } of hurt) {
      // A starter hurt early played fewer snaps than his team ran.
      if (x.quarter <= 2) expect(day.snaps[x.pid]).toBeLessThan(day.plays[x.team_id].offense);
    }
  });

  it("with injuries off, nobody gets hurt, and the same inputs give the same game", () => {
    const off = games(20, 0);
    expect(off.flatMap((p) => p.day.injuries)).toHaveLength(0);
    const again = games(20, 0);
    expect(again.map((p) => p.sim.home.score)).toEqual(off.map((p) => p.sim.home.score));
  });

  it("a team plays at its ratings when typically tired, better fresh, and fatigue makes a unit worse", () => {
    const s = setup(2509);
    const fresh = compileTeam(s.base, lineup(s.depth, new Map(s.players.players.map((p) => [p.id, p]))), s.players.scheme, s.players.kicking);
    const gd = new GameDay(s, setup(135), new Rng(1));
    const rested = Object.fromEntries(Object.entries(TYPICAL_TIREDNESS).map(([g, t]) => [g, -t])) as Record<Group, number>;
    const kick = gd.kickoff().home;
    expect(kick.offense).toEqual(withFatigue(fresh, rested).offense);
    expect(kick.defense.sack_rate).toBeGreaterThan(fresh.defense.sack_rate);
    const tired = withFatigue(fresh, { dl: 0.3 });
    expect(tired.defense.sack_rate).toBeLessThan(fresh.defense.sack_rate);
    expect(tired.defense.rush_stuff).toBeLessThan(fresh.defense.rush_stuff);
    expect(tired.offense).toEqual(fresh.offense);
  });
});
