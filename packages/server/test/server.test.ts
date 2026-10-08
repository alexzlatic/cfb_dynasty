import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { WebSocket } from "ws";
import { LeagueManager, replay, startServer } from "../src/index.ts";

let manager: LeagueManager;
let server: Server;
let base = "";

beforeAll(() => {
  manager = new LeagueManager(mkdtempSync(join(tmpdir(), "cfb-test-")));
  server = startServer({ manager }, 0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); manager.closeAll(); });

const post = (path: string, b: unknown) => fetch(base + path, { method: "POST", body: JSON.stringify(b) }).then((r) => r.json());
const get = (path: string) => fetch(base + path).then((r) => r.json());

describe("full season gate", () => {
  it("plays every game once on its real date, Aug 24 through the title game", () => {
    const lg = manager.create({ name: "Gate season", user_team_id: null, seed: 11 });
    const seed = manager.seed();
    const t0 = performance.now();
    lg.apply({ type: "sim", payload: { kind: "end_of_season" } });
    expect(performance.now() - t0).toBeLessThan(120_000);
    const s = lg.season.state;
    expect(s.games.every((g) => g.status === "final")).toBe(true);
    const byId = new Map(s.games.map((g) => [g.id, g]));
    for (const g of seed.schedule) expect(byId.get(g.id)?.date).toBe(g.date);
    expect(s.games.filter((g) => g.title)).toHaveLength(1);
    expect(s.champion).not.toBeNull();
    expect(lg.season.done).toBe(true);
  });
});

describe("replay gate", () => {
  it("re-running a league from its action log and seed gives identical results", () => {
    const lg = manager.create({ name: "Replay", user_team_id: 135, seed: 99 });
    lg.apply({ type: "sim", payload: { kind: "my_next_game" } });
    lg.apply({ type: "sim", payload: { kind: "day" } });
    lg.apply({ type: "update_settings", payload: { keep_pbp: "all" } });
    lg.apply({ type: "set_user_team", payload: { team_id: 2509 } });
    lg.apply({ type: "sim", payload: { kind: "date", date: "2026-11-01" } });
    const r = replay(lg, manager.seed());
    expect(r.replayed).toBe(r.original);
  });
  it("a reopened league file matches the one in memory", async () => {
    const lg = manager.create({ name: "Reopen", user_team_id: 2509, seed: 5 });
    lg.apply({ type: "sim", payload: { kind: "date", date: "2026-10-01" } });
    const { League } = await import("../src/league.ts");
    const again = League.open("reopen-check", manager.path(lg.id));
    expect(again.digest()).toBe(lg.digest());
    // Players, injuries and lineups come back too, so the next game plays the same either way.
    expect(again.season.roster(2509).length).toBeGreaterThan(80);
    expect(lg.season.state.injuries!.length).toBeGreaterThan(20);
    expect(again.season.state.injuries).toEqual(lg.season.state.injuries);
    expect(again.season.teamRatings(2509)).toEqual(lg.season.teamRatings(2509));
    again.apply({ type: "sim", payload: { kind: "date", date: "2026-10-12" } });
    lg.apply({ type: "sim", payload: { kind: "date", date: "2026-10-12" } });
    expect(again.digest()).toBe(lg.digest());
    again.close();
  });
  it("a league saved before players were rated picks them up from the seed", async () => {
    const lg = manager.create({ name: "Old save", user_team_id: 2509, seed: 6 });
    lg.db.exec("DELETE FROM rated_teams");
    const { League } = await import("../src/league.ts");
    expect(League.open("old-check", manager.path(lg.id)).season.roster(2509)).toHaveLength(0);
    const again = League.open("old-check", manager.path(lg.id), manager.seed());
    expect(again.season.roster(2509).length).toBeGreaterThan(80);
    again.close();
  });
});

describe("sync gate", () => {
  it("a day advanced by one client shows in another within 2 seconds", async () => {
    const { id } = await post("/api/leagues", { name: "Sync", team_id: 2509, seed: 3 });
    const ws = new WebSocket(base.replace("http", "ws") + `/ws?league=${id}`);
    await new Promise((r) => ws.once("message", r)); // hello
    const got = new Promise<{ ms: number; msg: any }>((resolve) => {
      const t0 = performance.now();
      ws.on("message", (m) => { const msg = JSON.parse(String(m)); if (msg.type === "days") resolve({ ms: performance.now() - t0, msg }); });
    });
    const before = (await get(`/api/leagues/${id}/state`)).date;
    await post(`/api/leagues/${id}/actions`, { type: "sim", payload: { kind: "day" } });
    const { ms, msg } = await got;
    expect(ms).toBeLessThan(2000);
    expect(msg.from).toBe(before);
    expect((await get(`/api/leagues/${id}/state`)).date).not.toBe(before);
    ws.close();
  });
  it("serves the screens' data", async () => {
    const { id } = await post("/api/leagues", { name: "Reads", team_id: 2509, seed: 4 });
    await post(`/api/leagues/${id}/actions`, { type: "sim", payload: { kind: "date", date: "2026-09-08" } });
    const team = await get(`/api/leagues/${id}/teams/2509`);
    expect(team.team.school).toBe("Purdue");
    expect(team.roster.length).toBeGreaterThan(80);
    const played = team.games.find((g: any) => g.status === "final");
    const game = await get(`/api/leagues/${id}/games/${played.id}`);
    expect(game.detail.plays.length).toBeGreaterThan(100);
    expect((await get(`/api/leagues/${id}/standings`)).length).toBeGreaterThan(9);
    expect((await get(`/api/leagues/${id}/polls`))[0].ranks).toHaveLength(25);
  });
});

describe("launcher support", () => {
  it("reports health, lists leagues most recent first and refuses quit unless enabled", async () => {
    const h = await get("/api/health");
    expect(h).toMatchObject({ ok: true, app: "cfb-dynasty", can_quit: false });
    const list = await get("/api/leagues");
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].played_at).toBeGreaterThanOrEqual(list[i].played_at);
    const r = await fetch(base + "/api/quit", { method: "POST" });
    expect(r.status).toBe(403);
  });

  it("never caches the page and answers an asset from an older build with 404, not the page", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfb-static-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "assets", "index-new.js"), "1");
    const s = startServer({ manager, staticDir: dir }, 0);
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    try {
      for (const p of ["/", "/l/x/depth/1"]) {
        const r = await fetch(b + p);
        expect(r.status).toBe(200);
        expect(r.headers.get("cache-control")).toBe("no-cache");
      }
      const asset = await fetch(b + "/assets/index-new.js");
      expect(asset.headers.get("cache-control")).toContain("immutable");
      expect((await fetch(b + "/assets/index-old.js")).status).toBe(404);
    } finally { s.close(); }
  });
});

describe("depth charts", () => {
  it("serves rated rosters, applies a depth chart change, rejects other teams' players and replays", async () => {
    const { id } = await post("/api/leagues", { name: "Depth", team_id: 2509, seed: 5 });
    const d = await get(`/api/leagues/${id}/teams/2509/depth`);
    expect(d.players.length).toBeGreaterThan(80);
    expect(d.depth.QB.length).toBeGreaterThan(1);
    const lg = manager.get(id);
    const before = lg.season.teamRatings(2509)!;
    // Start the backup QB.
    const [q1, q2, ...rest] = d.depth.QB;
    const ok = await post(`/api/leagues/${id}/actions`, { type: "set_depth", payload: { team_id: 2509, depth: { ...d.depth, QB: [q2, q1, ...rest] } } });
    expect(ok.ok).toBe(true);
    const after = lg.season.teamRatings(2509)!;
    expect(after.qb).not.toBe(before.qb);
    expect(after.offense.comp_pct).not.toBe(before.offense.comp_pct);
    const other = (await get(`/api/leagues/${id}/teams/2509`)).custom_depth;
    expect(other).toBe(true);
    const bad = await post(`/api/leagues/${id}/actions`, { type: "set_depth", payload: { team_id: 2509, depth: { QB: [123456789] } } });
    expect(bad.error).toMatch(/not on this team/);
    await post(`/api/leagues/${id}/actions`, { type: "sim", payload: { kind: "date", date: "2026-09-08" } });
    const p = await get(`/api/leagues/${id}/players/${q2}`);
    expect(p.slots).toContain("QB");
    expect(p.log.length).toBeGreaterThan(0);
    const r = replay(lg, manager.seed());
    expect(r.replayed).toBe(r.original);
    await post(`/api/leagues/${id}/actions`, { type: "set_depth", payload: { team_id: 2509, depth: null } });
    expect(lg.season.teamRatings(2509)!.qb).toBe(before.qb);
  });
});

describe("live games", () => {
  it("calls a game over the API, plays the day at the final whistle, and the league replays it", async () => {
    const made = await post("/api/leagues", { name: "Live", team_id: 158, seed: 6 });
    expect(made.error).toBeUndefined();
    const id = made.id;
    expect((await post(`/api/leagues/${id}/actions`, { type: "set_game_plan", payload: { run_pass: 9 } })).error).toMatch(/run_pass/);
    expect((await post(`/api/leagues/${id}/actions`, { type: "set_game_plan", payload: { run_pass: -1, blitz: 1, emphasis: { outside_run: 1 } } })).error).toBeUndefined();
    expect((await post(`/api/leagues/${id}/actions`, { type: "set_practice", payload: [
      { intensity: "hard", focus: "offense" }, { intensity: "hard", focus: "defense" }, { intensity: "normal", focus: "situations" }, { intensity: "light", focus: "opponent" }] })).error).toBeUndefined();
    await post(`/api/leagues/${id}/actions`, { type: "sim", payload: { kind: "my_next_game" } });
    const plan = await get(`/api/leagues/${id}/plan`);
    expect(plan.plan.run_pass).toBe(-1);
    expect(plan.scout.team_id).toBeGreaterThan(0);
    expect(plan.edge.offense).toBeGreaterThan(0);
    let v = await post(`/api/leagues/${id}/live/start`, { mode: { offense: "me", defense: "coordinator" } });
    expect((await post(`/api/leagues/${id}/actions`, { type: "set_game_plan", payload: {} })).error).toMatch(/live game/);
    const qb = v.sideline.find((x: any) => x.slot === "QB");
    const backup = qb.options.find((o: any) => o.id !== qb.on);
    const subbed = await post(`/api/leagues/${id}/live/sub`, { slot: "QB", pid: backup.id });
    expect(subbed.error).toBeUndefined();
    expect(subbed.sideline.find((x: any) => x.slot === "QB").options[0].id).toBe(backup.id);
    expect(v.stop).not.toBeNull();
    expect((await post(`/api/leagues/${id}/actions`, { type: "set_depth", payload: { team_id: 158, depth: null } })).error).toMatch(/live game/);
    let since = 0, n = 0;
    while (!v.final && n < 400) {
      since += v.plays.length;
      const call = v.stop.kind !== "playCall" ? null : v.stop.role === "offense" ? (n % 3 === 0 ? "deep" : "inside_run") : "blitz";
      v = await post(`/api/leagues/${id}/live/call`, { call, since });
      if (v.error) throw new Error(v.error);
      n++;
    }
    expect(v.final).toBe(true);
    expect(v.result.status).toBe("final");
    expect([v.result.home_score, v.result.away_score]).toEqual([v.home_score, v.away_score]);
    expect(await get(`/api/leagues/${id}/live`)).toBeNull();
    const lg = manager.get(id);
    const r = replay(lg, manager.seed());
    expect(r.replayed).toBe(r.original);
  });
});

describe("career and season polish", () => {
  // Seasons here run synchronously; the server may drop idle keep-alive sockets meanwhile, so retry once.
  const getR = (path: string): Promise<any> => fetch(base + path).then((r) => r.json(), () => fetch(base + path).then((r) => r.json()));
  it("starts a fresh career, redshirts, credits defenders and hands out awards, and replays it all", async () => {
    const { id } = await post("/api/leagues", { name: "Career", team_id: 135, seed: 21, career: { mode: "fresh", first: "Pat", last: "Rowan" } });
    const lg = manager.get(id);
    const st = await getR(`/api/leagues/${id}/state`);
    expect(st.career.mode).toBe("fresh");
    expect(st.career.coach).toMatchObject({ first: "Pat", last: "Rowan", reputation: 30 });
    expect(st.career.expect.wins).toBeGreaterThan(0);
    const team = await getR(`/api/leagues/${id}/teams/135`);
    expect(team.coaches.find((c: any) => c.role === "HC")).toMatchObject({ first: "Pat", last: "Rowan" });

    // Redshirt the three best true freshmen; another team's player is refused.
    const fr = lg.season.roster(135).filter((p) => p.years === 0).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    for (const p of fr) expect((await post(`/api/leagues/${id}/actions`, { type: "set_redshirt", payload: { pid: p.id, on: true } })).ok).toBe(true);
    const other = lg.season.roster(2509)[0];
    expect((await post(`/api/leagues/${id}/actions`, { type: "set_redshirt", payload: { pid: other.id, on: true } })).error).toMatch(/own players/);

    lg.apply({ type: "sim", payload: { kind: "end_of_season" } });
    const s = lg.season.state;
    for (const p of fr) expect(s.player_stats![p.id]?.gp ?? 0).toBeLessThanOrEqual(4);
    const depth = await getR(`/api/leagues/${id}/teams/135/depth`);
    expect(depth.redshirts).toHaveLength(3);

    // Every final box score credits about a game's worth of tackles on each side.
    const any = s.games.find((g) => g.status === "final" && g.home_id === 135)!;
    const game = await getR(`/api/leagues/${id}/games/${any.id}`);
    const tackles = Object.values(game.detail.defense as Record<string, { tkl?: number }>).reduce((n, l) => n + (l.tkl ?? 0), 0);
    expect(tackles).toBeGreaterThan(60);
    expect(tackles).toBeLessThan(160);

    const aw = await getR(`/api/leagues/${id}/awards`);
    expect(aw.awards.filter((a: any) => a.type === "heisman")).toHaveLength(1);
    expect(aw.awards.filter((a: any) => a.type === "heisman_finalist")).toHaveLength(3);
    expect(aw.awards.filter((a: any) => a.type === "all_american" && a.team === 1)).toHaveLength(25);
    expect(aw.awards.filter((a: any) => a.type === "potw_off").length).toBeGreaterThan(10);
    const leaders = await getR(`/api/leagues/${id}/leaders`);
    expect(leaders.sacks[0].sacks).toBeGreaterThan(8);
    expect(leaders.pass_yds[0].pass_yds).toBeGreaterThan(3000);

    const career = await getR(`/api/leagues/${id}/career`);
    expect(career.career.meetings.map((m: any) => m.kind)).toEqual(["preseason", "midseason", "end"]);
    expect(career.trail.length).toBeGreaterThanOrEqual(12);
    expect(s.news.filter((n) => n.kind === "ad")).toHaveLength(3);

    const r = replay(lg, manager.seed());
    expect(r.replayed).toBe(r.original);
    const { League } = await import("../src/league.ts");
    const again = League.open("career-check", manager.path(id));
    expect(again.season.state.awards).toEqual(s.awards);
    expect(again.season.state.career).toEqual(s.career);
    again.close();
  }, 240_000);

  it("a league saved before stats and careers rebuilds stats from its box scores and starts the real coach's career", async () => {
    const lg = manager.create({ name: "Pre-career save", user_team_id: 2509, seed: 8 });
    lg.apply({ type: "sim", payload: { kind: "date", date: "2026-09-20" } });
    lg.db.exec("DELETE FROM meta WHERE key IN ('player_stats', 'award_week', 'awards', 'redshirts', 'career')");
    const { League } = await import("../src/league.ts");
    const again = League.open("pre-career", manager.path(lg.id));
    const was = lg.season.state.player_stats!, now = again.season.state.player_stats!;
    const qb = Object.entries(was).filter(([, x]) => x.team_id === 2509).sort((a, b) => (b[1].pass_yds ?? 0) - (a[1].pass_yds ?? 0))[0];
    expect(now[Number(qb[0])].pass_yds).toBe(qb[1].pass_yds);
    expect(now[Number(qb[0])].gp).toBe(qb[1].gp);
    expect(again.season.state.career).toMatchObject({ mode: "real", team_id: 2509 });
    expect(again.season.state.career!.coach.reputation).toBeGreaterThan(30);
    again.close();
  }, 60_000);
});

describe("hidden ratings and development plans", () => {
  // As above: the server may drop idle keep-alive sockets while a season runs synchronously, so retry once.
  const postR = (path: string, b: unknown): Promise<any> => post(path, b).catch(() => post(path, b));
  const getR = (path: string): Promise<any> => get(path).catch(() => get(path));
  it("runs development plans through the action log, shows only your staff's read, and replays", async () => {
    const { id } = await postR("/api/leagues", { name: "Development", team_id: 2509, seed: 31 });
    const lg = manager.get(id);
    const mine = lg.season.roster(2509).sort((a, b) => b.ovr - a.ovr);
    const act = (payload: unknown) => postR(`/api/leagues/${id}/actions`, { type: "set_lab", payload });
    for (const p of mine.slice(0, 8)) expect((await act({ pid: p.id, area: "technique" })).ok).toBe(true);
    expect((await act({ pid: mine[8].id, area: "film" })).error).toMatch(/at once/);
    expect((await act({ pid: mine[0].id, area: "juggling" })).error).toMatch(/unknown development area/);
    expect((await act({ pid: mine[0].id, area: "toString" })).error).toMatch(/unknown development area/);
    expect((await act({ pid: lg.season.roster(135)[0].id, area: "film" })).error).toMatch(/own players/);
    expect((await act({ pid: mine[7].id, area: null })).ok).toBe(true);
    expect((await act({ pid: mine[8].id, area: "leadership" })).ok).toBe(true);

    lg.apply({ type: "sim", payload: { kind: "date", date: "2026-09-10" } });
    const dev = await getR(`/api/leagues/${id}/development`);
    expect(dev.team_id).toBe(2509);
    expect(Object.keys(dev.lab)).toHaveLength(8);
    expect(dev.staff.known).toBeGreaterThan(0.5);
    expect(dev.staff.players.length).toBe(mine.length);
    expect(Object.keys(dev.staff.units.off)).toEqual(["development", "fit", "chemistry"]);
    const pl = await getR(`/api/leagues/${id}/players/${mine[0].id}`);
    expect(pl.staff.plan.area).toBe("technique");
    expect((await getR(`/api/leagues/${id}/players/${lg.season.roster(135)[0].id}`)).staff).toBeNull();
    expect(lg.season.state.news.some((n) => n.kind === "staff")).toBe(true);

    const r = replay(lg, manager.seed());
    expect(r.replayed).toBe(r.original);
    const { League } = await import("../src/league.ts");
    const again = League.open("dev-check", manager.path(id));
    expect(again.season.state.lab).toEqual(lg.season.state.lab);
    expect(again.season.state.morale).toEqual(lg.season.state.morale);
    again.close();
  }, 120_000);

  it("a league saved before hidden ratings draws the same truth from its seed", async () => {
    const lg = manager.create({ name: "Pre-hidden save", user_team_id: 2509, seed: 9 });
    const ctx = lg.season.state.hidden_ctx;
    lg.db.exec("DELETE FROM meta WHERE key IN ('hidden_ctx', 'morale', 'lab')");
    const { League } = await import("../src/league.ts");
    const again = League.open("pre-hidden", manager.path(lg.id));
    expect(again.season.state.hidden_ctx).toEqual(ctx);
    expect(again.season.hiddenStrength(2509, "2026-11-15")).toEqual(lg.season.hiddenStrength(2509, "2026-11-15"));
    again.close();
  }, 60_000);
});
