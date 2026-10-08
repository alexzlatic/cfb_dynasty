import { describe, expect, it } from "vitest";
import { GameSim, Rng } from "@cfb/engine";
import { Caller, LiveGame, OFF_CALLS, Season, loadSeed, mixSeed, runSim, snapMod } from "../src/index.ts";

const seed = loadSeed();
const fbs = seed.teams.filter((t) => t.level === "fbs").map((t) => t.id);

describe("play calls", () => {
  it("coordinators calling both sides play like the calibrated engine", () => {
    const rng = new Rng(4);
    let plain = 0, called = 0, n = 0;
    for (let i = 0; i < 2000; i++) {
      const h = fbs[Math.floor(rng.random() * fbs.length)], a = fbs[Math.floor(rng.random() * fbs.length)];
      if (h === a) continue;
      const H = seed.ratings[h].ratings, A = seed.ratings[a].ratings;
      const p = new GameSim(H, A, { seed: i, record: false }).play();
      const c = new GameSim(H, A, { seed: i, record: false }).play(new Caller("home", new Rng(mixSeed(1, i, "calls"))).replay([]));
      plain += p.home.score + p.away.score; called += c.home.score + c.away.score; n++;
    }
    expect(Math.abs(called - plain) / n).toBeLessThan(1.5);
  });

  it("every call trades something: no offensive call beats the base defense on both completion and yards", () => {
    for (const o of OFF_CALLS.filter((c) => c.kind === "pass")) {
      const m = snapMod(o.id, "base");
      expect((m.comp ?? 0) > 0.05 && (m.ypcomp ?? 0) > 0.05).toBe(false);
    }
    expect(snapMod("deep", "prevent").comp!).toBeLessThan(snapMod("deep", "blitz").comp!);
    expect(snapMod("screen", "blitz").ypcomp!).toBeGreaterThan(snapMod("screen", "base").ypcomp ?? 0);
    expect(snapMod("qb_run", "base").rushers).toEqual(["QB"]);
  });
});

describe("live games", () => {
  const neb = seed.teams.find((t) => t.school === "Nebraska")!.id;
  const start = () => {
    const s = Season.create(seed, { seed: 3, user_team_id: neb });
    runSim(s, { kind: "my_next_game" });
    const g = s.state.games.find((x) => x.date === s.state.date && (x.home_id === neb || x.away_id === neb))!;
    return { s, g };
  };

  it("a game called live plays the same when the season replays the calls", () => {
    const { s, g } = start();
    const live = new LiveGame(s, g, { offense: "me", defense: "me" });
    const rng = new Rng(9);
    let stops = 0;
    while (!live.view().final) {
      const st = live.view().stop!;
      stops++;
      const o = st.options[Math.floor(rng.random() * st.options.length)].id;
      live.advance(rng.random() < 0.2 ? null : o === "true" ? true : o === "false" ? false : (o as never));
    }
    const v = live.view();
    expect(stops).toBeGreaterThan(100);
    expect(v.offense_calls.length + v.defense_calls.length).toBeGreaterThan(5);
    s.setCalls(g.id, live.calls);
    const rep = s.advanceDay();
    const done = rep.played.find((x) => x.id === g.id)!;
    expect([done.home_score, done.away_score]).toEqual([v.home_score, v.away_score]);
    expect(rep.details.find((d) => d.game_id === g.id)!.plays!.length).toBe(v.plays.length);
  });

  it("with coordinators calling, it stops only for alerts", () => {
    const { s, g } = start();
    const live = new LiveGame(s, g, { offense: "coordinator", defense: "coordinator" });
    const alerts: string[] = [];
    while (!live.view().final) { alerts.push(live.view().stop!.alert!); live.advance(null); }
    expect(alerts.every((a) => typeof a === "string")).toBe(true);
    expect(alerts.length).toBeLessThan(40);
  });

  it("sim to the end plays the whole game, even when you call every snap", () => {
    const { s, g } = start();
    const live = new LiveGame(s, g, { offense: "me", defense: "me" });
    live.advance("deep");
    live.advance(null, true);
    const v = live.view();
    expect(v.final).toBe(true);
    expect(v.stop).toBeNull();
    expect(v.plays.at(-1)!.play_type).toBe("END");
  });
});
