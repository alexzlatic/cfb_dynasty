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
