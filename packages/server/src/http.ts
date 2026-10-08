import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { AWARD_NAMES, AREAS, EXPENSE_LINES, REVENUE_LINES, FOCUS_MAX, POSITIONS, activeContract, fmvCeiling, eligibilityLeft, revenueCap, FOOTBALL_SHARE, LAB_AREAS, LAB_SLOTS, REDSHIRT_GAMES, autoDepth, prepEdge, records, securityLabel, type Game, type GameDetail, type PlayerSeason } from "@cfb/core";
import { LEAGUE } from "@cfb/engine";
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
    if (p[0] === "seed" && p[1] === "coaches") {
      return Object.fromEntries(manager.seed().coaches.filter((c) => c.role === "HC").map((c) => [c.team_id, { first: c.first, last: c.last, career: c.career }]));
    }
    if (p[0] !== "leagues") throw new HttpError(404, "not found");
    if (p.length === 1) {
      if (req.method === "POST") {
        const b = await body(req);
        const lg = manager.create({ name: String(b.name || "My Dynasty"), user_team_id: b.team_id ?? null, seed: b.seed, settings: b.settings, career: b.career });
        return { id: lg.id };
      }
      return manager.list();
    }
    const lg = manager.get(p[1]);
    const S = lg.season, s = S.state;
    const route = p.slice(2).join("/");
    const gameRow = (g: Game) => ({ ...g, home_rank: S.rankOf(g.home_id), away_rank: S.rankOf(g.away_id) });
    const career = () => {
      const c = s.career;
      if (!c) return null;
      const sec = S.security()!;
      return { ...c, security: sec, label: securityLabel(sec) };
    };
    const statRow = (pid: number, st: PlayerSeason) => {
      const pl = S.playerById.get(pid);
      return pl ? { pid, name: `${pl.first} ${pl.last}`.trim(), pos: pl.pos, class: pl.class, years: pl.years, ovr: pl.ovr, ...st } : null;
    };
    switch (true) {
      case route === "" || route === "state": {
        const upcoming = s.events.filter((e) => e.date >= s.date && e.status !== "done" && e.type !== "game_day").slice(0, 8);
        const myGames = s.user_team_id == null ? [] : s.games.filter((g) => g.home_id === s.user_team_id || g.away_id === s.user_team_id);
        return {
          id: lg.id, name: lg.name, year: s.year, date: s.date, user_team_id: s.user_team_id, settings: s.settings, done: S.done,
          champion: s.champion, upcoming, my_next_game: myGames.find((g) => g.status !== "final") ?? null,
          ap: S.latestPoll("ap")?.ranks.slice(0, 25) ?? [], playoff: s.playoff,
          news: s.news.slice(-12).reverse(), career: career(),
        };
      }
      case route === "career": {
        const byId = new Map(s.games.map((g) => [g.id, g]));
        return { career: career(), trail: S.securityTrail().map((x) => ({ ...x, game: gameRow(byId.get(x.game_id)!) })) };
      }
      case route === "development": {
        // Your staff's read on your own team; nobody else's hidden scores are ever sent.
        const me = s.user_team_id;
        if (me == null) return { team_id: null };
        const v = S.staffView(me);
        const ctx = S.teamContext(me);
        const players = S.roster(me).map((pl) => ({ pid: pl.id, name: `${pl.first} ${pl.last}`.trim(), pos: pl.pos, class: pl.class, years: pl.years, ovr: pl.ovr }));
        return { team_id: me, lab: s.lab ?? {}, slots: LAB_SLOTS, areas: LAB_AREAS, context: ctx, staff: v, players, depth: S.depthChart(me) };
      }
      case route === "payroll": {
        // A team's revenue-share payroll (yours by default), and every school's in its conference.
        const team = Number(url.searchParams.get("team") ?? s.user_team_id ?? NaN);
        const t = S.teamById.get(team);
        if (!t) return { team_id: null };
        const starters = new Set(Object.values(S.depthChart(team)).map((ids) => ids[0]).filter((x) => x != null));
        const players = S.roster(team).map((pl) => ({ pid: pl.id, name: `${pl.first} ${pl.last}`.trim(), pos: pl.pos, class: pl.class, years: pl.years, ovr: pl.ovr,
          value: S.value(pl.id), contract: activeContract(s.contracts?.[pl.id], s.year), nil: s.nil?.[pl.id] ?? null, morale: s.player_morale?.[pl.id] ?? 0, eligibility: eligibilityLeft(pl), starter: starters.has(pl.id),
          gp: s.player_stats?.[pl.id]?.gp ?? 0 }));
        const conference = S.teams.filter((x) => x.level === "fbs" && x.conference === t.conference).map((x) => ({ team_id: x.id, pool: s.pools?.[x.id] ?? 0, payroll: S.payroll(x.id) }))
          .sort((a, b) => b.payroll - a.payroll);
        return { team_id: team, year: s.year, cap: revenueCap(s.year), football_share: FOOTBALL_SHARE, pool: s.pools?.[team] ?? 0, payroll: S.payroll(team),
          mine: team === s.user_team_id, players, conference, mood: team === s.user_team_id ? s.team_mood?.[team] ?? null : null };
      }
      case route === "collective": {
        // A school's collective: its money, its deals and what the review did to them.
        const team = Number(url.searchParams.get("team") ?? s.user_team_id ?? NaN);
        const c = s.collectives?.[team];
        if (!c) return { team_id: null };
        const deals = S.roster(team).filter((pl) => s.nil?.[pl.id]).map((pl) => ({ pid: pl.id, name: `${pl.first} ${pl.last}`.trim(), pos: pl.pos, ovr: pl.ovr,
          value: S.value(pl.id), ceiling: fmvCeiling(S.value(pl.id)), revenue_share: activeContract(s.contracts?.[pl.id], s.year)?.amount ?? 0, deal: s.nil![pl.id] }))
          .sort((a, b) => b.deal.amount - a.deal.amount);
        const conference = S.teams.filter((x) => x.level === "fbs" && x.conference === S.teamById.get(team)!.conference && s.collectives?.[x.id])
          .map((x) => ({ team_id: x.id, base: s.collectives![x.id].base, spent: S.roster(x.id).reduce((a, pl) => a + (s.nil?.[pl.id]?.amount ?? 0), 0) }))
          .sort((a, b) => b.spent - a.spent);
        return { team_id: team, mine: team === s.user_team_id, base: c.base, reserve: c.reserve, focus: c.focus ?? [], focus_max: FOCUS_MAX, positions: POSITIONS,
          spent: deals.reduce((a, d) => a + d.deal.amount, 0), deals, conference };
      }
      case route === "budget": {
        // A school's budget (yours by default), its home games and facilities, and its conference's budgets.
        const team = Number(url.searchParams.get("team") ?? s.user_team_id ?? NaN);
        const b = S.budget(team), inputs = s.budgets?.[team];
        if (!b || !inputs) return { team_id: null };
        const mine = team === s.user_team_id;
        const home = s.games.filter((g) => g.home_id === team && !g.neutral && (g.kind === "regular" || g.kind === "playoff")).map((g) => ({
          game: gameRow(g), price: S.ticketPrice(g), custom: s.ticket_prices?.[g.id] != null,
          attendance: g.status === "final" ? s.gate?.[g.id]?.attendance ?? null : S.expectedCrowd(g),
          revenue: g.status === "final" ? s.gate?.[g.id]?.revenue ?? null : S.expectedCrowd(g) * S.ticketPrice(g),
          // What a few other prices would draw, so you can see the trade-off.
          options: mine && g.status !== "final" ? [0.8, 1, 1.25, 1.5].map((k) => { const price = Math.round(inputs.price * k); const a = S.expectedCrowd(g, price); return { price, attendance: a, revenue: a * price }; }) : [],
        }));
        const conference = S.teams.filter((x) => x.level === "fbs" && x.conference === S.teamById.get(team)!.conference).map((x) => {
          const v = S.budget(x.id)!;
          const sum = (o: Record<string, number>) => Object.values(o).reduce((a, y) => a + y, 0);
          return { team_id: x.id, revenue: sum(v.revenue), expenses: sum(v.expenses), surplus: v.surplus };
        }).sort((a, b) => b.revenue - a.revenue);
        return { team_id: team, mine, year: s.year, ...b, labels: { revenue: REVENUE_LINES, expenses: EXPENSE_LINES }, usual_price: inputs.price, capacity: inputs.capacity,
          home, conference, facilities: s.facilities?.[team] ?? null, areas: AREAS, projects: (s.projects ?? []).filter((p) => p.team_id === team),
          requests: mine ? (s.requests ?? []).slice(-5).reverse() : [] };
      }
      case route === "awards": return { names: AWARD_NAMES, awards: s.awards ?? [] };
      case route === "leaders": {
        const fbs = new Set(S.teams.filter((t) => t.level === "fbs").map((t) => t.id));
        const rows = Object.entries(s.player_stats ?? {}).filter(([, x]) => fbs.has(x.team_id)).map(([pid, x]) => statRow(Number(pid), x)!).filter(Boolean);
        const KEYS = ["pass_yds", "pass_td", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "tkl", "tfl", "sacks", "def_int", "pd", "ff", "fgm"] as const;
        return Object.fromEntries(KEYS.map((k) => [k, rows.filter((r) => (r[k] ?? 0) > 0).sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0) || a.pid - b.pid).slice(0, 10)]));
      }
      case route === "actions" && req.method === "POST": {
        const a = (await body(req)) as Action;
        const reps = lg.apply(a, url.searchParams.get("user"));
        return { ok: true, date: s.date, days: reps.length, played: reps.reduce((n, r) => n + r.played.length, 0), stop: reps.at(-1)?.stop ?? null };
      }
      case route === "actions": return lg.actions();
      case route === "live" && req.method === "GET": return lg.live ? lg.live.view(Number(url.searchParams.get("since") ?? 0)) : null;
      case route === "live/start" && req.method === "POST": return lg.startLive((await body(req)).mode ?? {});
      case route === "live/call" && req.method === "POST": {
        const b = await body(req);
        return lg.liveCall(b.call ?? null, !!b.to_end, Number(b.since ?? 0));
      }
      case route === "live/mode" && req.method === "POST": return lg.liveMode((await body(req)).mode ?? {});
      case route === "live/sub" && req.method === "POST": {
        const b = await body(req);
        return lg.liveSub(b.slot, Number(b.pid));
      }
      case route === "plan": {
        const g = S.nextUserGame();
        const me = s.user_team_id;
        const oppId = g && me != null ? (g.home_id === me ? g.away_id : g.home_id) : null;
        let scout = null;
        if (oppId != null) {
          const rec = records(s.games, S.teams).get(oppId);
          const r = S.teamRatings(oppId);
          const last = s.games.filter((x) => x.status === "final" && (x.home_id === oppId || x.away_id === oppId)).slice(-3).reverse().map(gameRow);
          scout = {
            team_id: oppId, record: rec ?? null, rank: S.rankOf(oppId), power: s.power[oppId], last,
            injuries: S.injured(oppId).filter((i) => i.starter),
            ratings: r ? { offense: r.offense, defense: r.defense, pass_rate: r.pass_rate, plays_per_game: r.plays_per_game, aggressiveness: r.aggressiveness } : null,
          };
        }
        return { plan: S.gamePlan, practice: S.practicePlan, prep: s.prep ?? null, edge: prepEdge(s.prep), next_game: g ? gameRow(g) : null, scout, league: LEAGUE };
      }
      case route === "live/leave" && req.method === "POST": lg.live = null; return { ok: true };
      case route === "teams": return S.teams;
      case p[2] === "teams" && p.length === 4: {
        const id = Number(p[3]);
        const team = S.team(id);
        if (!team) throw new HttpError(404, "no such team");
        const roster = (lg.db.prepare("SELECT data FROM players WHERE team_id = ?").all(id) as { data: string }[]).map((r) => JSON.parse(r.data));
        let coaches = (lg.db.prepare("SELECT data FROM coaches WHERE team_id = ? ORDER BY id").all(id) as { data: string }[]).map((r) => JSON.parse(r.data));
        // Your team's head coach is you.
        const c = s.career;
        if (c && c.team_id === id && c.mode === "fresh") coaches = coaches.map((x) => (x.role === "HC" ? { ...x, first: c.coach.first, last: c.coach.last, career: [], source: "you" } : x));
        const stats = S.roster(id).flatMap((pl) => { const st = s.player_stats?.[pl.id]; return st ? [statRow(pl.id, st)!] : []; });
        const games = s.games.filter((g) => g.home_id === id || g.away_id === id).map(gameRow);
        return { team, roster, coaches, games, power: s.power[id], rank: S.rankOf(id), players: S.roster(id), depth: S.depthChart(id), custom_depth: !!s.depth?.[id], injuries: S.injured(id), stats };
      }
      case p[2] === "teams" && p.length === 5 && p[4] === "depth": {
        const id = Number(p[3]);
        const injuries = S.injured(id);
        const mine = id === s.user_team_id;
        const gp = Object.fromEntries(S.roster(id).map((pl) => [pl.id, s.player_stats?.[pl.id]?.gp ?? 0]));
        return { depth: S.depthChart(id), custom: !!s.depth?.[id], auto: autoDepth(S.roster(id), new Set(injuries.map((i) => i.pid))), players: S.roster(id), injuries,
          gp, redshirts: mine ? s.redshirts ?? [] : [], redshirt_games: REDSHIRT_GAMES };
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
          const d = JSON.parse(row.data) as GameDetail;
          const line = { ...((g.home_id === pl.team_id ? d.home_players : d.away_players)?.[name] as object | undefined), ...d.defense?.[pl.id] };
          const snaps = d.snaps?.[pl.id];
          return Object.keys(line).length || snaps ? [{ game: gameRow(g), line, snaps: snaps ?? 0 }] : [];
        });
        return { player: pl, team: S.team(pl.team_id), slots, log, injury: S.injuryOf(pl.id), injuries: (s.injuries ?? []).filter((i) => i.pid === pl.id),
          season: s.player_stats?.[pl.id] ?? null, awards: (s.awards ?? []).filter((a) => a.pid === pl.id),
          redshirt: s.redshirts?.includes(pl.id) ?? false, redshirt_games: REDSHIRT_GAMES,
          // Your staff's read on your own players (development so far, traits, his plan).
          staff: pl.team_id === s.user_team_id ? { ...S.staffView(pl.team_id)?.players.find((x) => x.pid === pl.id), plan: s.lab?.[pl.id] ?? null } : null };
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
        const detail = d ? (JSON.parse(d.data) as GameDetail) : null;
        // Defensive lines are by player id; send who they are.
        const defenders = Object.fromEntries(Object.keys(detail?.defense ?? {}).map((k) => {
          const pl = S.playerById.get(Number(k));
          return [k, pl ? { name: `${pl.first} ${pl.last}`.trim(), pos: pl.pos, team_id: pl.team_id } : null];
        }));
        return { game: gameRow(g), detail, defenders };
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
    const found = file.startsWith(dir) && existsSync(file) && !statSync(file).isDirectory();
    // A missing file with an extension (an asset from an older build) is a 404, not the page; sending the
    // page as JavaScript leaves a blank window.
    if (!found && extname(pathname)) { res.writeHead(404); res.end(); return; }
    if (!found) file = join(dir, "index.html");
    // Build assets have content hashes in their names and never change; the page must always be fresh so
    // an update's new asset names are picked up.
    const cache = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": cache });
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
