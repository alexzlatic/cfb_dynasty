import { describe, expect, it } from "vitest";
import { GameSim, Rng, averageTeam, type DecisionRequest } from "../src/index.ts";
import { runParity } from "./parity.ts";

describe("engine parity with the Python reference", () => {
  it("replays every fixture play exactly", () => {
    const rep = runParity();
    expect(rep.firstDivergence).toBeNull();
    expect(rep.playsMatched).toBe(rep.plays);
    expect(rep.gamesMatched).toBe(rep.games);
  });
});

describe("shared RNG", () => {
  it("matches the Python SharedRng stream for seed 42", () => {
    const r = new Rng(42);
    expect(r.random()).toBeCloseTo(0.563356057974, 12);
    expect(r.random()).toBeCloseTo(0.288961866871, 12);
    expect(r.random()).toBeCloseTo(0.005916276248, 12);
  });
  it("restores from a saved state", () => {
    const r = new Rng(7); r.random(); r.gauss(0, 1);
    const s = Rng.fromState(r.state());
    expect(s.random()).toBe(r.random());
  });
});

describe("calibration", () => {
  it("two average teams land on FBS averages", () => {
    let pts = 0, plays = 0, t3a = 0, t3c = 0;
    const n = 1500;
    for (let i = 0; i < n; i++) {
      const r = new GameSim(averageTeam("H", "HOM"), averageTeam("A", "AWY"), { seed: i, record: false }).play().result();
      for (const s of [r.home, r.away]) { pts += s.score; plays += s.box.scrimmage_plays; t3a += s.box.third_att; t3c += s.box.third_conv; }
    }
    expect(pts / 2 / n).toBeGreaterThan(25.5);
    expect(pts / 2 / n).toBeLessThan(28.0);
    expect(plays / 2 / n).toBeGreaterThan(65);
    expect(plays / 2 / n).toBeLessThan(69);
    expect(t3c / t3a).toBeGreaterThan(0.40);
    expect(t3c / t3a).toBeLessThan(0.45);
  });
});

describe("decision provider", () => {
  it("answering with the suggestion changes nothing", () => {
    const a = new GameSim(averageTeam(), averageTeam(), { seed: 5 }).play().result();
    const b = new GameSim(averageTeam(), averageTeam(), { seed: 5 }).play((req) => req.suggestion).result();
    expect(b.plays).toEqual(a.plays);
  });
  it("lets a coach override calls", () => {
    const seen = new Set<string>();
    const r = new GameSim(averageTeam("H", "HOM"), averageTeam("A", "AWY"), { seed: 9 }).play((req: DecisionRequest) => {
      seen.add(req.kind);
      if (req.kind === "playCall" && req.side === "home") return "run";
      if (req.kind === "fourthDown" && req.side === "home") return "go";
      return undefined;
    }).result();
    expect(seen.has("playCall")).toBe(true);
    expect(r.home.box.pass_att).toBe(0);
    expect(r.home.box.punts).toBe(0);
  });
});

describe("clock management", () => {
  const snaps = (r: ReturnType<GameSim["result"]>) => r.home.box.pass_att + r.home.box.rush_att + r.home.box.sacks_taken;
  const avgSnaps = (set: (g: GameSim) => void) => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) { const g = new GameSim(averageTeam("H", "HOM"), averageTeam("A", "AWY"), { seed, record: false }); set(g); n += snaps(g.play().result()); }
    return n / 30;
  };

  it("tempo changes how many snaps an offense gets", () => {
    const milk = avgSnaps((g) => { g.tempo.home = "milk"; }), base = avgSnaps(() => {}), up = avgSnaps((g) => { g.tempo.home = "uptempo"; }), hurry = avgSnaps((g) => { g.tempo.home = "hurry"; });
    expect(milk).toBeLessThan(base - 3);
    expect(up).toBeGreaterThan(base + 5);
    expect(hurry).toBeGreaterThan(up);
  });

  it("a timeout stops the clock where the last play ended", () => {
    let checked = 0;
    const g = new GameSim(averageTeam("H", "HOM"), averageTeam("A", "AWY"), { seed: 4 });
    g.play((req, game) => {
      if (req.kind !== "playCall" || req.side !== "home" || !game.clockRunning || game.home.timeouts === 0) return undefined;
      const before = game.clock, last = game.plays.at(-1)!, n = game.home.timeouts;
      expect(game.callTimeout("home")).toBe(true);
      expect(game.home.timeouts).toBe(n - 1);
      expect(game.clock).toBeGreaterThan(before);
      if (last.quarter === game.quarter) expect(game.clock).toBe(last.clock - 6);
      expect(game.plays.at(-1)!.play_type).toBe("TIMEOUT");
      expect(game.callTimeout("home")).toBe(false);
      checked++;
      return undefined;
    });
    expect(checked).toBeGreaterThan(4);
  });

  it("a side calling its own timeouts is asked, and the engine never spends them", () => {
    let asked = 0;
    const r = new GameSim(averageTeam("H", "HOM"), averageTeam("A", "AWY"), { seed: 11 });
    r.manualTimeouts.home = true;
    r.play((req) => { if (req.kind === "timeout") { expect(req.side).toBe("home"); asked++; } return undefined; });
    expect(asked).toBeGreaterThan(20);
    expect(r.plays.filter((p) => p.description.startsWith("Timeout HOM"))).toHaveLength(0);
  });

  it("a spike stops a running clock for a down; a kneel loses a yard", () => {
    const seen = new Set<string>();
    const g = new GameSim(averageTeam("H", "HOM"), averageTeam("A", "AWY"), { seed: 6 });
    g.play((req, game) => {
      if (req.kind !== "playCall" || req.side !== "home" || req.situation.down >= 3) return undefined;
      if (game.clockRunning && !seen.has("spike")) { game.clockPlay = "spike"; seen.add("spike"); }
      else if (seen.has("spike") && !seen.has("kneel")) { game.clockPlay = "kneel"; seen.add("kneel"); }
      return undefined;
    });
    const i = g.plays.findIndex((p) => p.play_type === "SPIKE"), k = g.plays.findIndex((p) => p.play_type === "KNEEL");
    expect(i).toBeGreaterThan(0);
    const spike = g.plays[i], next = g.plays.slice(i + 1).find((p) => p.down > 0)!;
    expect(next.down).toBe(spike.down + 1);
    expect(next.clock).toBe(spike.clock - 1);
    expect(g.plays[k].yards).toBe(-1);
  });
});
