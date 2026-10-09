import { describe, expect, it } from "vitest";
import { answerDays, askFor, renewalNudge, lengthPremium, maxYears, openingAsk, payFor, reasonsOf, respond, stayScore, watchOf, type StayContext } from "../src/portal.ts";
import type { Persona } from "../src/valuation.ts";
import { loadSeed } from "../src/seed.ts";
import { Season } from "../src/season.ts";
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

describe("multi-year deals", () => {
  const steady: Persona = { ...avg, kind: "steady", loyalty: 1.8, money: 0.8, fit: 1.3 };
  const home: Persona = { ...avg, kind: "homebody", home: 1.8, loyalty: 1.3, winning: 0.8 };

  it("most players want more a year to lock in; loyal and homebody players hardly ask, mercenaries won't sign", () => {
    expect(lengthPremium(avg)).toBeCloseTo(0.08, 3);
    expect(lengthPremium(steady)).toBeLessThan(0.02);
    expect(lengthPremium(home)).toBeLessThan(0.03);
    expect(maxYears(merc)).toBe(1);
    expect(maxYears(steady)).toBe(4);
    expect(askFor(500_000, avg, 3)).toBe(580_000);
  });

  it("a locked deal holds a player much more than a deal he can renegotiate", () => {
    expect(stayScore({ ...base, contract: true, locked: true }, avg).p).toBeLessThan(stayScore({ ...base, contract: true }, avg).p * 0.5);
  });

  it("answers a longer offer by its length: too long costs no patience, and the price rises by his premium", () => {
    const t = { ask: 550_000, walk: 500_000, patience: 3 };
    const long = respond(t, 900_000, 3, merc);
    expect(long.accepted).toBe(false);
    expect(long.too_long).toBe(1);
    expect(long.patience).toBe(3);
    // The one-year number isn't enough for three years; his premium on top is.
    expect(respond(t, 500_000, 3, avg).accepted).toBe(false);
    expect(respond(t, askFor(500_000, avg, 3), 3, avg).accepted).toBe(true);
    // A loyal player signs for three at about his one-year number.
    expect(respond(t, 505_000, 3, steady).accepted).toBe(true);
  });
});

describe("renewals", () => {
  it("a renewal is about his pay now: a little more after a big season, a little less after a quiet one", () => {
    expect(renewalNudge(1)).toBeGreaterThan(1.05);
    expect(renewalNudge(0.5)).toBeCloseTo(1.015, 3);
    expect(renewalNudge(0)).toBeGreaterThanOrEqual(0.95);
    expect(renewalNudge(null)).toBeLessThan(1);
    expect(renewalNudge(0.5, "all_american")).toBeGreaterThan(renewalNudge(0.5));
  });

  it("the standing rule renews players at about their pay, waiting on you; you confirm, renegotiate or revoke", () => {
    const seed = loadSeed();
    const me = seed.teams.find((t) => t.school === "UCLA")!.id;
    const season = Season.create(seed, { seed: 7, user_team_id: me, settings: { keep_pbp: "none" } as never });
    while (!season.state.talks) season.advanceDay();
    const talks = Object.values(season.state.talks!);
    const pending = talks.filter((t) => t.pending);
    expect(pending.length).toBeGreaterThan(10);
    // Renewals of players happy to stay hold their pay (revenue share and NIL), give or take their season.
    for (const t of pending) {
      const was = season.pay(t.pid);
      if (was > 50_000 && t.status === "staying") { expect(t.deal!.amount).toBeGreaterThan(0.93 * was); expect(t.deal!.amount).toBeLessThan(1.15 * was); }
    }
    const [a, b, c] = pending;
    season.setTalk(b.pid, { reopen: true });
    expect(season.state.talks![b.pid].outcome).toBeUndefined();
    expect(season.state.next_deals?.[b.pid]).toBeUndefined();
    season.setTalk(c.pid, { let_go: true });
    expect(season.state.talks![c.pid].outcome).toBe("let_go");
    expect(season.confirmRenewals([a.pid])).toBe(1);
    expect(season.state.talks![a.pid].pending).toBeUndefined();
    expect(() => season.setTalk(a.pid, { let_go: true })).toThrow();
    // The rest are confirmed by your staff when the portal opens; the one you revoked enters it.
    while (!season.state.portal) season.advanceDay();
    expect(Object.values(season.state.talks!).some((t) => t.pending)).toBe(false);
    expect(season.state.portal!.entries.some((e) => e.pid === c.pid)).toBe(true);
  }, 120_000);
});
