import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { autoDepth, type Game } from "@cfb/core";
import type { Action } from "./league.ts";
import type { LeagueManager } from "./manager.ts";

export interface ServerOptions {
  manager: LeagueManager; staticDir?: string; logoDir?: string;
  /** Code version the server started from; the launcher restarts a server whose code is out of date. */
  commit?: string;
  /** Shut down after this many minutes with no open game window (0 = never). */
  idleExitMinutes?: number;
  /** Called by POST /api/quit and by the idle timer. Without it, quitting is refused. */
  onQuit?: () => void;
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

/** HTTP API, logo cache, static client and the WebSocket that pushes every change to open clients. */
export function startServer(opts: ServerOptions, port: number): Server {
  const { manager } = opts;
  const logoDir = opts.logoDir ?? join(manager.dir, "..", ".logo-cache");
  mkdirSync(logoDir, { recursive: true });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://x");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "api") return send(res, 200, await api(req, parts.slice(1), url));
      if (parts[0] === "logos") return await logo(res, parts[1]);
      return serveStatic(res, url.pathname);
    } catch (e) {
      const err = e as Error;
      send(res, err instanceof HttpError ? err.status : /no such|unknown/.test(err.message) ? 404 : 400, { error: err.message });
    }
  });

  async function api(req: IncomingMessage, p: string[], url: URL): Promise<unknown> {
    if (p[0] === "health") return { ok: true, app: "cfb-dynasty", commit: opts.commit ?? "dev", saves: manager.dir, can_quit: !!opts.onQuit };
    if (p[0] === "quit" && req.method === "POST") {
      if (!opts.onQuit) throw new HttpError(403, "quit is disabled");
      setTimeout(opts.onQuit, 100);
      return { ok: true };
    }
    if (p[0] === "seed" && p[1] === "teams") return manager.seed().teams.filter((t) => t.level === "fbs");
    if (p[0] !== "leagues") throw new HttpError(404, "not found");
    if (p.length === 1) {
      if (req.method === "POST") {
        const b = await body(req);
        const lg = manager.create({ name: String(b.name || "My Dynasty"), user_team_id: b.team_id ?? null, seed: b.seed, settings: b.settings });
        return { id: lg.id };
      }
      return manager.list();
    }
    const lg = manager.get(p[1]);
    const S = lg.season, s = S.state;
    const route = p.slice(2).join("/");
    const gameRow = (g: Game) => ({ ...g, home_rank: S.rankOf(g.home_id), away_rank: S.rankOf(g.away_id) });
    switch (true) {
      case route === "" || route === "state": {
        const upcoming = s.events.filter((e) => e.date >= s.date && e.status !== "done" && e.type !== "game_day").slice(0, 8);
        const myGames = s.user_team_id == null ? [] : s.games.filter((g) => g.home_id === s.user_team_id || g.away_id === s.user_team_id);
        return {
          id: lg.id, name: lg.name, year: s.year, date: s.date, user_team_id: s.user_team_id, settings: s.settings, done: S.done,
          champion: s.champion, upcoming, my_next_game: myGames.find((g) => g.status !== "final") ?? null,
          ap: S.latestPoll("ap")?.ranks.slice(0, 25) ?? [], playoff: s.playoff,
          news: s.news.slice(-12).reverse(),
        };
      }
      case route === "actions" && req.method === "POST": {
        const a = (await body(req)) as Action;
        const reps = lg.apply(a, url.searchParams.get("user"));
        return { ok: true, date: s.date, days: reps.length, played: reps.reduce((n, r) => n + r.played.length, 0), stop: reps.at(-1)?.stop ?? null };
      }
      case route === "actions": return lg.actions();
      case route === "teams": return S.teams;
      case p[2] === "teams" && p.length === 4: {
        const id = Number(p[3]);
        const team = S.team(id);
        if (!team) throw new HttpError(404, "no such team");
        const roster = (lg.db.prepare("SELECT data FROM players WHERE team_id = ?").all(id) as { data: string }[]).map((r) => JSON.parse(r.data));
        const coaches = (lg.db.prepare("SELECT data FROM coaches WHERE team_id = ? ORDER BY id").all(id) as { data: string }[]).map((r) => JSON.parse(r.data));
        const games = s.games.filter((g) => g.home_id === id || g.away_id === id).map(gameRow);
        return { team, roster, coaches, games, power: s.power[id], rank: S.rankOf(id), players: S.roster(id), depth: S.depthChart(id), custom_depth: !!s.depth?.[id], injuries: S.injured(id) };
      }
      case p[2] === "teams" && p.length === 5 && p[4] === "depth": {
        const id = Number(p[3]);
        const injuries = S.injured(id);
        return { depth: S.depthChart(id), custom: !!s.depth?.[id], auto: autoDepth(S.roster(id), new Set(injuries.map((i) => i.pid))), players: S.roster(id), injuries };
      }
      case p[2] === "players" && p.length === 4: {
        const pl = S.playerById.get(Number(p[3]));
        if (!pl) throw new HttpError(404, "no such player");
        const name = `${pl.first} ${pl.last}`.trim();
        const depth = S.depthChart(pl.team_id);
        const slots = Object.entries(depth).flatMap(([slot, ids]) => (ids ?? []).map((x, i) => (x === pl.id ? `${slot}${i ? ` (${i + 1})` : ""}` : null))).filter(Boolean);
        // Game log: this player's line in each of his team's played games.
        const log = s.games.filter((g) => g.status === "final" && (g.home_id === pl.team_id || g.away_id === pl.team_id)).flatMap((g) => {
          const row = lg.db.prepare("SELECT data FROM game_details WHERE game_id = ?").get(g.id) as { data: string } | undefined;
          if (!row) return [];
          const d = JSON.parse(row.data);
          const line = (g.home_id === pl.team_id ? d.home_players : d.away_players)?.[name];
          const snaps = d.snaps?.[pl.id];
          return line || snaps ? [{ game: gameRow(g), line: line ?? {}, snaps: snaps ?? 0 }] : [];
        });
        return { player: pl, team: S.team(pl.team_id), slots, log, injury: S.injuryOf(pl.id), injuries: (s.injuries ?? []).filter((i) => i.pid === pl.id) };
      }
      case route === "schedule": {
        const team = url.searchParams.get("team"), date = url.searchParams.get("date"), week = url.searchParams.get("week");
        return s.games.filter((g) => (!team || g.home_id === Number(team) || g.away_id === Number(team)) && (!date || g.date === date) &&
          (!week || g.week === Number(week))).map(gameRow);
      }
      case p[2] === "games" && p.length === 4: {
        const id = Number(p[3]);
        const g = s.games.find((x) => x.id === id);
        if (!g) throw new HttpError(404, "no such game");
        const d = lg.db.prepare("SELECT data FROM game_details WHERE game_id = ?").get(id) as { data: string } | undefined;
        return { game: gameRow(g), detail: d ? JSON.parse(d.data) : null };
      }
      case route === "standings": return lg.standings();
      case route === "polls": return s.polls.map((x) => ({ ...x, ranks: x.ranks.slice(0, 25) }));
      case route === "news": {
        const kind = url.searchParams.get("kind"), author = url.searchParams.get("author"), team = url.searchParams.get("team");
        const skipStories = url.searchParams.get("stories") === "0";
        return s.news.filter((n) => (!kind || n.kind === kind) && (!author || n.author === Number(author)) &&
          (!team || n.team_ids.includes(Number(team))) && (!skipStories || n.kind !== "story"))
          .slice(-Number(url.searchParams.get("limit") || 100)).reverse();
      }
      case route === "writers": return s.writers.map(({ voter, ...w }) => ({ ...w, homer: voter.homer }));
      case p[2] === "writers" && p.length === 4: {
        const w = s.writers.find((x) => x.id === Number(p[3]));
        if (!w) throw new HttpError(404, "no such writer");
        const ballots = (lg.db.prepare("SELECT date, team_ids FROM ballots WHERE writer_id = ? AND poll = 'ap' ORDER BY date").all(w.id) as { date: string; team_ids: string }[])
          .map((b) => ({ date: b.date, team_ids: JSON.parse(b.team_ids) as number[] }));
        const { voter, ...profile } = w;
        return { writer: { ...profile, homer: voter.homer }, ballots, stories: s.news.filter((n) => n.author === w.id).reverse() };
      }
      case p[2] === "ballots" && p.length === 4: {
        const rows = lg.db.prepare("SELECT writer_id, team_ids FROM ballots WHERE date = ? AND poll = 'ap' ORDER BY writer_id").all(p[3]) as { writer_id: number; team_ids: string }[];
        return rows.map((r) => ({ writer_id: r.writer_id, team_ids: JSON.parse(r.team_ids) }));
      }
      case route === "calendar": {
        const from = url.searchParams.get("from") || s.date.slice(0, 7) + "-01", to = url.searchParams.get("to") || "9999";
        return { date: s.date, events: s.events.filter((e) => (e.end_date ?? e.date) >= from && e.date <= to) };
      }
      default: throw new HttpError(404, "not found");
    }
  }

  /**
   * Logos are fetched from the CFBD CDN once and cached on disk, never committed to the repo. When the
   * CDN cannot be reached, a badge in the team's colors stands in (and is not cached).
   */
  async function logo(res: ServerResponse, file: string | undefined): Promise<void> {
    const m = /^(\d+)(-dark)?\.png$/.exec(file || "");
    if (!m) throw new HttpError(404, "not found");
    const team = manager.seed().teams.find((t) => t.id === Number(m[1]));
    if (!team) throw new HttpError(404, "no such team");
    const path = join(logoDir, file!);
    if (!existsSync(path)) {
      const src = m[2] ? team.logo_dark : team.logo;
      const r = src ? await fetch(src).catch(() => null) : null;
      if (!r?.ok) {
        const esc = (x: string) => x.replace(/[^#A-Za-z0-9. -]/g, (ch) => (ch === "&" ? "&amp;" : ""));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${esc(team.color)}" stroke="${esc(team.alt_color)}" stroke-width="4"/>` +
          `<text x="32" y="38" font-family="Arial,sans-serif" font-weight="700" font-size="${team.abbr.length > 3 ? 15 : 19}" text-anchor="middle" fill="${esc(team.alt_color)}">${esc(team.abbr)}</text></svg>`;
        res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
        res.end(svg);
        return;
      }
      writeFileSync(path, Buffer.from(await r.arrayBuffer()));
    }
    res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=604800" });
    res.end(readFileSync(path));
  }

  function serveStatic(res: ServerResponse, pathname: string): void {
    const dir = opts.staticDir;
    if (!dir || !existsSync(dir)) { res.writeHead(404); res.end("client not built; run npm run dev"); return; }
    let file = normalize(join(dir, pathname));
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  }

  // WebSocket: /ws?league=<id>. Every applied action and day advance is pushed to every client on that league.
  const wss = new WebSocketServer({ server, path: "/ws" });
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (!opts.idleExitMinutes || !opts.onQuit || wss.clients.size > 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => wss.clients.size === 0 && opts.onQuit!(), opts.idleExitMinutes * 60_000);
  };
  armIdle();
  wss.on("connection", (ws: WebSocket, req) => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    const id = new URL(req.url || "", "http://x").searchParams.get("league") || "";
    let off: (() => void) | null = null;
    // A window on the league list connects with no league; it only keeps the server awake.
    if (!id) ws.send(JSON.stringify({ type: "hello", league: null }));
    else try {
      off = manager.get(id).subscribe((push) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(push)));
      ws.send(JSON.stringify({ type: "hello", league: id }));
    } catch {
      ws.close(1008, "no such league");
    }
    ws.on("close", () => { off?.(); armIdle(); });
  });

  server.listen(port);
  return server;
}
