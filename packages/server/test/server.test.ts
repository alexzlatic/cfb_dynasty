import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
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
