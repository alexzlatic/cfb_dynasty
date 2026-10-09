import { describe, expect, it } from "vitest";
import { GameSim, Rng } from "@cfb/engine";
import { Caller, DEFAULT_PLAN, LiveGame, OFF_CALLS, Season, loadSeed, mixSeed, runSim, snapMod, type GamePlan } from "../src/index.ts";

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

  it("the live box keeps pace with the plays and ends as the final box score", () => {
    const { s, g } = start();
    const live = new LiveGame(s, g, { offense: "coordinator", defense: "coordinator" });
    expect(live.box(0)).toBeNull();
    while (!live.view().final) live.advance(null);
    const n = live.view().plays.length;
    const half = live.box(Math.floor(n / 2))!, end = live.box()!;
    expect(half.at).toBeLessThanOrEqual(n / 2);
    expect(end.at).toBe(n);
    const yds = (rows: typeof end.home) => rows.reduce((a, r) => a + (r.rush_yds ?? 0), 0);
    expect(yds(half.home)).toBeLessThanOrEqual(yds(end.home) + 20);
    s.setCalls(g.id, live.calls);
    const d = s.advanceDay().details.find((x) => x.game_id === g.id)!;
    expect(end.home_box).toEqual(d.home_box);
    // Every ball carrier and defender is matched to a player on his team.
    for (const [rows, tid] of [[end.home, g.home_id], [end.away, g.away_id]] as const) {
      expect(rows.length).toBeGreaterThan(10);
      for (const r of rows) expect(s.playerById.get(r.pid!)?.team_id).toBe(tid);
    }
    expect(end.home.some((r) => r.tkl) && end.home.some((r) => r.car)).toBe(true);
  });
});

describe("game plans, practice and substitutions", () => {
  const neb = seed.teams.find((t) => t.school === "Nebraska")!.id;

  it("the coordinators follow the run/pass lean and call emphasis", () => {
    const H = seed.ratings[fbs[3]].ratings, A = seed.ratings[fbs[9]].ratings;
    const share = (plan: Partial<GamePlan>) => {
      let pass = 0, deep = 0, n = 0;
      for (let i = 0; i < 60; i++) {
        const c = new Caller("home", new Rng(mixSeed(1, i, "calls")), { plans: { home: { ...DEFAULT_PLAN, ...plan } } });
        const sim = new GameSim(H, A, { seed: i, record: true });
        sim.play(c.replay([]));
        for (const h of c.history) if (h.pair.side === "home") { n++; if (h.play.play_type === "PASS") pass++; if (h.pair.off === "deep") deep++; }
      }
      return { pass: pass / n, deep: deep / n };
    };
    const run = share({ run_pass: -2 }), mid = share({}), passy = share({ run_pass: 2, emphasis: { deep: 1 } });
    expect(run.pass).toBeLessThan(mid.pass - 0.04);
    expect(passy.pass).toBeGreaterThan(mid.pass + 0.04);
    expect(passy.deep).toBeGreaterThan(mid.deep * 1.5);
  });

  it("coordinators lean toward what is working this game", () => {
    const H = seed.ratings[fbs[3]].ratings, A = seed.ratings[fbs[9]].ratings;
    const c = new Caller("home", new Rng(1));
    const sim = new GameSim(H, A, { seed: 4, record: true });
    sim.play(c.replay([]));
    const adj = c.adjustments();
    expect(adj.length).toBeGreaterThan(0);
    for (const a of adj.filter((x) => x.call !== "load_box" && x.call !== "coverage")) expect(a.plays).toBeGreaterThan(0);
  });

  it("practice banks prep for the next game, and hard days can cost players", () => {
    const s = Season.create(seed, { seed: 8, user_team_id: neb });
    s.setPractice([{ intensity: "hard", focus: "offense" }, { intensity: "hard", focus: "offense" }, { intensity: "hard", focus: "defense" }, { intensity: "hard", focus: "situations" }]);
    let maxPrep = 0, hurt = 0;
    for (let d = 0; d < 70; d++) {
      const rep = s.advanceDay();
      maxPrep = Math.max(maxPrep, s.state.prep?.offense ?? 0);
      hurt += rep.news.filter((n) => n.kind === "injury" && /practice/.test(n.body)).length;
    }
    expect(maxPrep).toBeCloseTo(2.8);
    expect(s.state.injuries!.some((i) => i.game_id === 0)).toBe(hurt > 0);
  });

  it("a live game with a plan and substitutions replays exactly", () => {
    const s = Season.create(seed, { seed: 3, user_team_id: neb });
    s.setGamePlan({ ...DEFAULT_PLAN, run_pass: 1, tempo: "hurry", blitz: 1, coverage: "man", fourth_down: "aggressive", two_point: "aggressive" });
    s.setPractice([{ intensity: "hard", focus: "offense" }, { intensity: "light", focus: "defense" }, { intensity: "hard", focus: "situations" }, { intensity: "normal", focus: "opponent" }]);
    runSim(s, { kind: "my_next_game" });
    const g = s.state.games.find((x) => x.date === s.state.date && (x.home_id === neb || x.away_id === neb))!;
    expect(s.state.prep?.for_game).toBe(g.id);
    const live = new LiveGame(s, g, { offense: "me", defense: "coordinator" });
    let k = 0, subbed = 0;
    while (!live.view().final) {
      const v = live.view();
      if (k++ % 25 === 5) {
        const slot = v.sideline.find((x) => x.slot === (k % 2 ? "QB" : "LB1"))!;
        const backup = slot.options.find((o) => o.id !== slot.on && !o.hurt);
        if (backup) { live.substitute(slot.slot, backup.id); subbed++; }
      }
      live.advance(null);
    }
    expect(subbed).toBeGreaterThan(1);
    const v = live.view();
    s.setCalls(g.id, live.calls);
    s.setSubs(g.id, live.subs);
    const rep = s.advanceDay();
    const done = rep.played.find((x) => x.id === g.id)!;
    expect([done.home_score, done.away_score]).toEqual([v.home_score, v.away_score]);
    expect(rep.details.find((d) => d.game_id === g.id)!.plays!.length).toBe(v.plays.length);
    expect(s.state.prep).toBeNull();
  });
});
