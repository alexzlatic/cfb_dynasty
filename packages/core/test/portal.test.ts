import { describe, expect, it } from "vitest";
import { answerDays, openingAsk, payFor, reasonsOf, respond, stayScore, watchOf, type StayContext } from "../src/portal.ts";
import type { Persona } from "../src/valuation.ts";
import { loadSeed } from "../src/seed.ts";
import { freshModel, rollRosters } from "../src/rollover.ts";

const avg: Persona = { kind: "steady", money: 1, playing: 1, development: 1, fit: 1, winning: 1, home: 1, loyalty: 1 };
const merc: Persona = { ...avg, kind: "mercenary", money: 1.8, loyalty: 0.5 };
/** A fourth-year power-conference starter paid at the market, at a school that develops players. */
const base: StayContext = {
  value: 400_000, pay: 400_000, ratio_away: 1, demand: 1, start_here: 1, start_away: 0.6, dev_here: 0.5, fit: 0, win_here: 0, win_away: 0,
  home_here: 0, home_away: 0, morale: 0, years: 3, tier: 0, tier_away: 0, noise: 0,
};

describe("stay or go", () => {
  it("underpaying a player pushes him toward the portal, and the reasons say it's money", () => {
    const fair = stayScore(base, avg), cheap = stayScore({ ...base, pay: 120_000 }, avg);
    expect(cheap.p).toBeGreaterThan(fair.p + 0.1);
    expect(reasonsOf(cheap)[0].reason).toBe("pay");
    // Money matters more to a mercenary.
    expect(stayScore({ ...base, pay: 120_000 }, merc).p).toBeGreaterThan(cheap.p);
  });

  it("pay fixes a money problem: payFor finds the pay that settles him", () => {
    const c = { ...base, pay: 120_000 };
    const keep = payFor(c, avg, 0.12)!;
    expect(keep).toBeGreaterThan(c.pay);
    expect(stayScore({ ...c, pay: keep }, avg).p).toBeLessThan(0.125);
    // Walk-away (30%) is below settled (12%).
    expect(payFor(c, avg, 0.3)!).toBeLessThan(keep);
  });

  it("money won't fix a backup who'd start elsewhere and is unhappy", () => {
    const c = { ...base, start_here: 0, start_away: 1, morale: -2, years: 2 };
    expect(payFor(c, avg, 0.12)).toBeNull();
    expect(reasonsOf(stayScore(c, avg)).map((r) => r.reason)).toContain("playing");
    // A promised starting job helps.
    expect(stayScore({ ...c, promise: true }, avg).p).toBeLessThan(stayScore(c, avg).p);
  });

  it("a second transfer that costs a season, a contract or nowhere better to play keeps him", () => {
    const c = { ...base, pay: 150_000 };
    expect(stayScore({ ...c, costs_season: true }, avg).p).toBeLessThan(stayScore(c, avg).p);
    expect(stayScore({ ...c, contract: true }, avg).p).toBeLessThan(stayScore(c, avg).p);
    expect(stayScore({ ...c, start_away: 0, start_here: 0 }, avg).p).toBeLessThan(stayScore({ ...c, start_here: 0, start_away: 0.4 }, avg).p);
  });

  it("watch levels", () => {
    expect([0.05, 0.2, 0.45, 0.8].map(watchOf)).toEqual(["settled", "restless", "shopping", "gone"]);
  });
});

describe("renewal talks", () => {
  const t = { ask: 500_000, walk: 400_000, patience: 3, counter: undefined as number | undefined };
  it("he stays at or above his walk-away number", () => {
    expect(respond(t, 400_000).accepted).toBe(true);
    expect(respond(t, 500_000).accepted).toBe(true);
  });
  it("he declines below it, names a number between his ask and his walk-away, and loses patience", () => {
    const a = respond(t, 380_000);
    expect(a.accepted).toBe(false);
    expect(a.counter).toBeGreaterThanOrEqual(400_000);
    expect(a.counter).toBeLessThan(500_000);
    expect(a.patience).toBe(2);
    expect(a.insulted).toBe(false);
    // His number comes down each round, never below his walk-away.
    const b = respond({ ...t, counter: a.counter!, patience: a.patience }, 380_000);
    expect(b.counter!).toBeLessThan(a.counter!);
    expect(b.counter!).toBeGreaterThanOrEqual(400_000);
  });
  it("a lowball insults him and costs two rounds of patience", () => {
    const a = respond(t, 200_000);
    expect(a.insulted).toBe(true);
    expect(a.patience).toBe(1);
  });
  it("money-first players open higher; answers take a day or two", () => {
    expect(openingAsk(400_000, merc)).toBeGreaterThan(openingAsk(400_000, avg));
    expect(openingAsk(400_000, avg)).toBeGreaterThan(400_000);
    const days = new Set(Array.from({ length: 50 }, (_, i) => answerDays(7, i, 3)));
    expect([...days].sort()).toEqual([1, 2]);
  });
});

describe("transfers in the rollover", () => {
  it("a committed transfer joins his new school a year older; an entrant with no school leaves", () => {
    const seed = loadSeed(), players = seed.players!;
    const iowa = 2294, ohio = 194;
    const mover = players[iowa].players.find((p) => p.years === 1)!, quitter = players[iowa].players.find((p) => p.years === 2)!;
    const t = rollRosters({ seed: 3, year: 2026, teams: seed.teams, players, model: freshModel(players), next_player_id: 900_000_001, growth: () => new Map(), gp: {},
      transfers: new Map([[mover.id, ohio]]), gone: new Set([quitter.id]) });
    expect(t.players[iowa].players.some((p) => p.id === mover.id)).toBe(false);
    const there = t.players[ohio].players.find((p) => p.id === mover.id)!;
    expect(there.team_id).toBe(ohio);
    expect(there.years).toBe(mover.years + 1);
    expect(t.left.find((d) => d.pid === mover.id)).toMatchObject({ reason: "transfer", to: ohio });
    expect(t.left.find((d) => d.pid === quitter.id)?.reason).toBe("left");
    expect(Object.values(t.players).some((x) => x.players.some((p) => p.id === quitter.id))).toBe(false);
  });
});
