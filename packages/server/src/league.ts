import { createHash, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  Season, LiveGame, POSITIONS, AREAS, type Area, type Pos, runSim, checkPlan, type CareerStart, type Coach, LAB_AREAS, type LabArea, type GameDetail, checkPractice, type GamePlan, type GameSub, type PracticePlan, records, SLOT_POS, packPlayer, unpackPlayers, isDefCall, isOffCall, type LiveMode, type LiveView, type UserCall, type Player, type CalEvent, type DepthChart, type Slot, type DayReport, type Game, type SeasonState, type SeedBundle, type Settings, type SimCommand, type Team,
} from "@cfb/core";
import type { TeamRatings } from "@cfb/engine";
import { openDb, tx } from "./db.ts";

export type Action =
  | { type: "create"; payload: { name: string; seed: number; user_team_id: number | null; settings?: Partial<Settings>; career?: CareerStart } }
  | { type: "sim"; payload: SimCommand }
  | { type: "set_user_team"; payload: { team_id: number | null } }
  | { type: "update_settings"; payload: Partial<Settings> }
  /** A team's depth chart; null puts back the opening depth chart. */
  | { type: "set_depth"; payload: { team_id: number; depth: DepthChart | null } }
  /** The user's calls from a game they called live (null = the coordinator's call); the game plays with them tonight. */
  | { type: "call_game"; payload: { game_id: number; calls: UserCall[]; subs?: GameSub[] } }
  /** The user's game plan; the coordinators call every game from it. */
  | { type: "set_game_plan"; payload: GamePlan }
  /** The user's practice plan, Monday to Thursday. */
  | { type: "set_practice"; payload: PracticePlan }
  /** Put one of your players on the redshirt list (he plays in up to four games), or take him off. */
  | { type: "set_redshirt"; payload: { pid: number; on: boolean } }
  /** Put one of your players on an individual development plan (null takes him off). */
  | { type: "set_lab"; payload: { pid: number; area: LabArea | null } }
  /** Sign one of your players to a revenue-share contract: dollars a year and seasons (amount 0 ends it). */
  | { type: "sign_contract"; payload: { pid: number; amount: number; years: number } }
  /** Ask your school's collective to spend on these positions (at most three). */
  | { type: "set_collective_focus"; payload: { focus: Pos[] } }
  /** Your ticket price for one of your home games (null for the usual price). */
  | { type: "set_ticket_price"; payload: { game_id: number; price: number | null } }
  /** Ask your athletic director to upgrade a facility one grade. */
  | { type: "request_project"; payload: { area: Area } };

export interface LoggedAction { seq: number; day: string; user: string | null; type: Action["type"]; payload: unknown; created_at: string }

export type Push =
  | { type: "action"; action: LoggedAction }
  | { type: "days"; from: string; to: string; played: number; stop: string | null; news: { headline: string; body: string; date: string }[] };

const j = JSON.stringify;
const META_KEYS = ["year", "seed", "date", "settings", "user_team_id", "power", "preseason_power", "poll_memory", "conf_champs", "playoff",
  "champion", "next_game_id", "stars", "depth", "injuries", "calls", "subs", "game_plan", "practice", "prep",
  "player_stats", "award_week", "awards", "redshirts", "career", "hidden_ctx", "morale", "lab", "contracts", "pools", "collectives", "nil", "player_morale", "team_mood",
  "budgets", "facilities", "projects", "ticket_prices", "gate", "requests"] as const;

/** A league file plus its in-memory season. All changes go through `apply`, which logs them first. */
export class League {
  season!: Season;
  name = "";
  /** The user's game being called live today, if any (in memory: a restart drops it and the coordinators play it). */
  live: LiveGame | null = null;
  private listeners = new Set<(p: Push) => void>();

  private constructor(public readonly id: string, public readonly db: DatabaseSync) {}

  /** Create a league file from the seed bundle. The create action is the first entry in the log. */
  static create(id: string, path: string, seed: SeedBundle, opts: { name: string; seed?: number; user_team_id: number | null; settings?: Partial<Settings>; career?: CareerStart }): League {
    const db = openDb(path);
    const lg = new League(id, db);
    const career = opts.career == null ? undefined : checkCareer(opts.career);
    const payload = { name: opts.name, seed: opts.seed ?? randomInt(1, 2 ** 31), user_team_id: opts.user_team_id, settings: opts.settings, career };
    lg.season = Season.create(seed, { seed: payload.seed, user_team_id: payload.user_team_id, settings: payload.settings, career });
    lg.name = opts.name;
    tx(db, () => {
      const ins = (sql: string, rows: unknown[][]) => { const st = db.prepare(sql); for (const r of rows) st.run(...(r as never[])); };
      ins("INSERT OR IGNORE INTO conferences (name, data) VALUES (?, ?)", seed.conferences.map((c) => [c.name, j(c)]));
      ins("INSERT INTO teams (id, level, conference, data) VALUES (?, ?, ?, ?)", seed.teams.map((t) => [t.id, t.level, t.conference, j(t)]));
      const players: unknown[][] = [];
      for (const [tid, roster] of Object.entries(seed.rosters)) for (const p of roster) players.push([String(p.id), Number(tid), p.pos, j(p)]);
      ins("INSERT OR IGNORE INTO players (id, team_id, pos, data) VALUES (?, ?, ?, ?)", players);
      ins("INSERT INTO coaches (team_id, role, data) VALUES (?, ?, ?)", seed.coaches.map((c) => [c.team_id, c.role, j(c)]));
      writeRated(db, seed);
      ins("INSERT INTO team_strength (team_id, as_of, source, data) VALUES (?, ?, ?, ?)",
        Object.entries(seed.ratings).map(([tid, r]) => [Number(tid), seed.start_date, r.source, j(r.ratings)]));
      lg.writeMeta(); lg.db.prepare("INSERT INTO meta (key, value) VALUES ('name', ?)").run(j(opts.name));
      ins("INSERT INTO writers (id, data) VALUES (?, ?)", lg.season.state.writers.map((w) => [w.id, j(w)]));
      const g = db.prepare("INSERT INTO games (id, date, kind, home_id, away_id, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const x of lg.season.state.games) g.run(x.id, x.date, x.kind, x.home_id, x.away_id, x.status, j(x));
      const e = db.prepare("INSERT INTO events (id, date, type, status, data) VALUES (?, ?, ?, ?, ?)");
      for (const x of lg.season.state.events) e.run(x.id, x.date, x.type, x.status, j(x));
      lg.log({ type: "create", payload }, null);
    });
    return lg;
  }

  /**
   * Open an existing league file and rebuild the in-memory season from its tables. A league saved
   * before players were rated takes them from `seed`.
   */
  static open(id: string, path: string, seed?: SeedBundle): League {
    const db = openDb(path);
    const lg = new League(id, db);
    const meta = Object.fromEntries((db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[]).map((r) => [r.key, JSON.parse(r.value)]));
    lg.name = meta.name;
    const teams = (db.prepare("SELECT data FROM teams").all() as { data: string }[]).map((r) => JSON.parse(r.data) as Team);
    const ratings: SeedBundle["ratings"] = {};
    for (const r of db.prepare("SELECT team_id, source, data FROM team_strength ORDER BY as_of").all() as { team_id: number; source: string; data: string }[]) {
      ratings[r.team_id] = { source: r.source, ratings: JSON.parse(r.data) as TeamRatings };
    }
    const all = <T>(sql: string) => (db.prepare(sql).all() as { data: string }[]).map((r) => JSON.parse(r.data) as T);
    const state: SeasonState = {
      year: meta.year, seed: meta.seed, date: meta.date, settings: meta.settings, user_team_id: meta.user_team_id, power: meta.power,
      preseason_power: meta.preseason_power, poll_memory: meta.poll_memory, conf_champs: meta.conf_champs, playoff: meta.playoff,
      champion: meta.champion, next_game_id: meta.next_game_id, stars: meta.stars ?? {}, depth: meta.depth ?? {}, injuries: meta.injuries ?? [], calls: meta.calls ?? {},
      subs: meta.subs ?? {}, game_plan: meta.game_plan ?? undefined, practice: meta.practice ?? undefined, prep: meta.prep ?? null,
      player_stats: meta.player_stats ?? undefined, award_week: meta.award_week ?? undefined, awards: meta.awards ?? undefined,
      redshirts: meta.redshirts ?? undefined, career: meta.career ?? null,
      hidden_ctx: meta.hidden_ctx ?? undefined, morale: meta.morale ?? undefined, lab: meta.lab ?? undefined,
      contracts: meta.contracts ?? undefined, pools: meta.pools ?? undefined, collectives: meta.collectives ?? undefined, nil: meta.nil ?? undefined,
      player_morale: meta.player_morale ?? undefined, team_mood: meta.team_mood ?? undefined,
      budgets: meta.budgets ?? undefined, facilities: meta.facilities ?? undefined, projects: meta.projects ?? undefined,
      ticket_prices: meta.ticket_prices ?? undefined, gate: meta.gate ?? undefined, requests: meta.requests ?? undefined,
      writers: all("SELECT data FROM writers ORDER BY id"),
      games: all<Game>("SELECT data FROM games ORDER BY rowid"),
      events: all<CalEvent>("SELECT data FROM events ORDER BY date, id"),
      polls: all("SELECT data FROM polls ORDER BY id"),
      news: all("SELECT data FROM news ORDER BY rowid"),
    };
    if (seed?.players && !db.prepare("SELECT 1 FROM rated_teams LIMIT 1").get()) tx(db, () => writeRated(db, seed));
    const rosters: Record<string, Player[]> = {};
    for (const r of db.prepare("SELECT team_id, data FROM players").all() as { team_id: number; data: string }[]) (rosters[r.team_id] ??= []).push(JSON.parse(r.data));
    const packed = Object.fromEntries((db.prepare("SELECT team_id, data FROM rated_teams").all() as { team_id: number; data: string }[]).map((r) => [r.team_id, JSON.parse(r.data)]));
    const players = Object.keys(packed).length ? unpackPlayers(packed, rosters) : undefined;
    lg.season = new Season(state, { teams, ratings, players } as SeedBundle);
    // Leagues saved before season stats and careers: rebuild stats from the box scores, and start the
    // career the way a new league would (as the school's real head coach).
    if (!("player_stats" in meta)) lg.season.rebuildStats(all<GameDetail>("SELECT data FROM game_details"));
    if (!("career" in meta)) lg.season.startCareer({ mode: "real" }, lg.coaches());
    // Leagues saved before hidden ratings: the truth comes from the league seed, so it is the same as if
    // it had been there from the start (games already played stay as they were).
    if (!meta.hidden_ctx) lg.season.startHidden(lg.coaches());
    // Leagues saved before money: athletic departments sign their contracts the way a new league's would.
    if (!meta.contracts) lg.season.startMoney();
    if (!meta.collectives) lg.season.startCollectives();
    if (!meta.team_mood) lg.season.weeklyMorale();
    if (!meta.budgets) lg.season.startFinance(seed?.finances);
    return lg;
  }

  coaches(): Coach[] {
    return (this.db.prepare("SELECT data FROM coaches ORDER BY id").all() as { data: string }[]).map((r) => JSON.parse(r.data));
  }

  close(): void { this.db.close(); }

  subscribe(fn: (p: Push) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(p: Push): void { for (const fn of this.listeners) fn(p); }

  // ---- actions -------------------------------------------------------------------------------
  private log(a: Action, user: string | null): LoggedAction {
    const created_at = new Date().toISOString();
    const r = this.db.prepare("INSERT INTO actions (day, user, team_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(this.season.state.date, user, this.season.state.user_team_id, a.type, j(a.payload), created_at);
    return { seq: Number(r.lastInsertRowid), day: this.season.state.date, user, type: a.type, payload: a.payload, created_at };
  }

  actions(): LoggedAction[] {
    return (this.db.prepare("SELECT * FROM actions ORDER BY seq").all() as any[]).map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  /** A depth chart may only list the team's own players, each at a position that can play the slot. */
  private checkDepth(teamId: number, depth: DepthChart | null): void {
    if (!this.season.teamById.has(teamId)) throw new Error("unknown team");
    if (!depth) return;
    const mine = new Map(this.season.roster(teamId).map((p) => [p.id, p]));
    for (const [slot, ids] of Object.entries(depth) as [Slot, number[]][]) {
      if (!SLOT_POS[slot]) throw new Error(`unknown slot ${slot}`);
      if (!Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length) throw new Error(`bad list for ${slot}`);
      for (const id of ids) if (!mine.has(id)) throw new Error(`player ${id} is not on this team`);
    }
  }

  private checkSubs(subs: unknown): void {
    if (subs == null) return;
    if (!Array.isArray(subs) || subs.length > 200) throw new Error("subs must be a list");
    const me = this.season.state.user_team_id;
    if (me == null) throw new Error("no user team");
    for (const x of subs) {
      if (!x || !Number.isInteger(x.at) || x.at < 0) throw new Error("bad sub");
      this.checkDepth(me, x.depth);
    }
  }

  /** Validate, log and apply one action; returns the day reports it produced. */
  apply(a: Action, user: string | null = null): DayReport[] {
    const s = this.season.state;
    if (a.type === "create") throw new Error("create is only valid as a league's first action");
    if (a.type === "set_user_team" && a.payload.team_id != null && !this.season.teamById.has(a.payload.team_id)) throw new Error("unknown team");
    if (a.type === "sim" && this.season.done) throw new Error("the season is over");
    if (a.type === "set_depth") this.checkDepth(a.payload.team_id, a.payload.depth);
    if (a.type === "call_game") { checkCalls(a.payload.calls); this.checkSubs(a.payload.subs); }
    if (a.type === "set_game_plan") a = { type: a.type, payload: checkPlan(a.payload) };
    if (a.type === "set_practice") a = { type: a.type, payload: checkPractice(a.payload) };
    if (a.type === "set_redshirt") a = { type: a.type, payload: { pid: Number(a.payload?.pid), on: !!a.payload?.on } };
    if (a.type === "set_lab") {
      const area = a.payload?.area ?? null;
      if (area != null && !Object.hasOwn(LAB_AREAS, area)) throw new Error(`unknown development area ${area}`);
      a = { type: a.type, payload: { pid: Number(a.payload?.pid), area } };
    }
    if (a.type === "sign_contract") {
      const amount = Math.round(Number(a.payload?.amount) / 1000) * 1000, years = Number(a.payload?.years);
      if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) throw new Error("a contract is $0 to $10M a year");
      if (amount > 0 && (!Number.isInteger(years) || years < 1 || years > 4)) throw new Error("a contract runs 1 to 4 seasons");
      a = { type: a.type, payload: { pid: Number(a.payload?.pid), amount, years: amount > 0 ? years : 0 } };
    }
    if (a.type === "set_collective_focus") {
      const focus = a.payload?.focus;
      if (!Array.isArray(focus) || focus.some((x) => !POSITIONS.includes(x))) throw new Error("focus must be a list of positions");
      a = { type: a.type, payload: { focus } };
    }
    if (a.type === "set_ticket_price") {
      const price = a.payload?.price == null ? null : Math.round(Number(a.payload.price));
      if (price != null && (!Number.isFinite(price) || price < 5 || price > 500)) throw new Error("a ticket costs $5 to $500");
      a = { type: a.type, payload: { game_id: Number(a.payload?.game_id), price } };
    }
    if (a.type === "request_project") {
      if (!Object.hasOwn(AREAS, a.payload?.area)) throw new Error(`unknown area ${a.payload?.area}`);
      a = { type: a.type, payload: { area: a.payload.area } };
    }
    // A live game is played from today's lineups and settings; changing them would make it a different game.
    if (this.live && (a.type === "set_depth" || a.type === "update_settings" || a.type === "set_user_team" || a.type === "set_game_plan" || a.type === "set_redshirt" || a.type === "set_lab")) throw new Error("finish or leave your live game first");
    if (this.live && a.type === "sim") this.live = null;
    let reports: DayReport[] = [];
    const logged = tx(this.db, () => {
      const l = this.log(a, user);
      if (a.type === "set_user_team") {
        // A new school is a new job: your name (and how you started) go with you; expectations start over.
        const c = s.career;
        s.user_team_id = a.payload.team_id;
        s.redshirts = [];
        s.lab = {};
        this.season.startCareer(c ? { mode: c.mode, first: c.coach.first, last: c.coach.last } : { mode: "real" }, this.coaches());
      }
      if (a.type === "update_settings") {
        this.season.updateSettings(a.payload);
        this.db.exec("DELETE FROM events");
        const e = this.db.prepare("INSERT INTO events (id, date, type, status, data) VALUES (?, ?, ?, ?, ?)");
        for (const x of s.events) e.run(x.id, x.date, x.type, x.status, j(x));
      }
      if (a.type === "set_depth") this.season.setDepth(a.payload.team_id, a.payload.depth);
      if (a.type === "call_game") { this.season.setCalls(a.payload.game_id, a.payload.calls); this.season.setSubs(a.payload.game_id, a.payload.subs ?? []); }
      if (a.type === "set_game_plan") this.season.setGamePlan(a.payload);
      if (a.type === "set_practice") this.season.setPractice(a.payload);
      if (a.type === "set_redshirt") this.season.setRedshirt(a.payload.pid, a.payload.on);
      if (a.type === "set_lab") this.season.setLab(a.payload.pid, a.payload.area);
      if (a.type === "sign_contract") this.season.setContract(a.payload.pid, a.payload.amount, a.payload.years);
      if (a.type === "set_collective_focus") this.season.setCollectiveFocus(a.payload.focus);
      if (a.type === "set_ticket_price") this.season.setTicketPrice(a.payload.game_id, a.payload.price);
      if (a.type === "request_project") this.season.requestProject(a.payload.area);
      if (a.type === "sim") reports = runSim(this.season, a.payload, (r) => this.persistDay(r));
      this.writeMeta();
      return l;
    });
    this.emit({ type: "action", action: logged });
    if (reports.length) {
      this.emit({
        type: "days", from: reports[0].date, to: reports[reports.length - 1].date, played: reports.reduce((n, r) => n + r.played.length, 0),
        stop: reports[reports.length - 1].stop, news: reports.flatMap((r) => r.news).slice(-20).map((n) => ({ headline: n.headline, body: n.body, date: n.date })),
      });
    }
    return reports;
  }

  // ---- live games ----------------------------------------------------------------------------
  /** Start calling the user's game today (or return the one in progress). */
  startLive(mode: Partial<LiveMode> = {}): LiveView {
    if (this.live) return this.live.view();
    const s = this.season.state, me = s.user_team_id;
    const g = s.games.find((x) => x.date === s.date && x.status !== "final" && me != null && (x.home_id === me || x.away_id === me));
    if (!g) throw new Error("your team does not play today");
    this.live = new LiveGame(this.season, g, mode);
    return this.finishIfDone(this.live.view());
  }

  /** Answer the live game's stop (null = the coordinator's call) and play on; at the final whistle the calls are saved and the day is played. */
  liveCall(call: UserCall, toEnd = false, since = 0): LiveView & { result?: Game } {
    if (!this.live) throw new Error("no live game");
    this.live.advance(call, toEnd);
    return this.finishIfDone(this.live.view(since));
  }

  /** Put a player in at a slot for the rest of the live game. */
  liveSub(slot: Slot, pid: number): LiveView {
    if (!this.live) throw new Error("no live game");
    this.live.substitute(slot, pid);
    return this.live.view(Number.MAX_SAFE_INTEGER);
  }

  liveMode(mode: Partial<LiveMode>): LiveView {
    if (!this.live) throw new Error("no live game");
    this.live.setMode(mode);
    return this.live.view();
  }

  private finishIfDone(v: LiveView): LiveView & { result?: Game } {
    if (!v.final || !this.live) return v;
    const live = this.live;
    this.live = null;
    this.apply({ type: "call_game", payload: { game_id: live.game.id, calls: live.calls, subs: live.subs } });
    this.apply({ type: "sim", payload: { kind: "day" } });
    return { ...v, result: this.season.state.games.find((g) => g.id === live.game.id) };
  }

  private writeMeta(): void {
    const st = this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const s = this.season.state as unknown as Record<string, unknown>;
    for (const k of META_KEYS) st.run(k, j(s[k] ?? null));
  }

  private persistDay(r: DayReport): void {
    const db = this.db;
    const g = db.prepare("INSERT INTO games (id, date, kind, home_id, away_id, status, data) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data, date = excluded.date");
    for (const x of [...r.new_games, ...r.played]) g.run(x.id, x.date, x.kind, x.home_id, x.away_id, x.status, j(x));
    const d = db.prepare("INSERT OR REPLACE INTO game_details (game_id, data) VALUES (?, ?)");
    for (const x of r.details) d.run(x.game_id, j(x));
    const e = db.prepare("INSERT INTO events (id, date, type, status, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data");
    const dates = new Set(r.new_games.map((x) => x.date));
    const touched = this.season.state.events.filter((x) => dates.has(x.date) && x.type === "game_day");
    for (const x of [...r.fired, ...r.new_events, ...touched]) e.run(x.id, x.date, x.type, x.status, j(x));
    const p = db.prepare("INSERT INTO polls (date, type, data) VALUES (?, ?, ?)");
    for (const x of r.polls) p.run(x.date, x.type, j(x));
    const n = db.prepare("INSERT OR REPLACE INTO news (id, date, kind, author, data) VALUES (?, ?, ?, ?, ?)");
    for (const x of r.news) n.run(x.id, x.date, x.kind, x.author ?? null, j(x));
    const b = db.prepare("INSERT OR REPLACE INTO ballots (date, poll, writer_id, team_ids) VALUES (?, ?, ?, ?)");
    for (const x of r.ballots) b.run(x.date, x.poll, x.writer_id, j(x.team_ids));
  }

  // ---- reads ---------------------------------------------------------------------------------
  /** A digest of every result and poll, for the replay gate. */
  digest(): string {
    const s = this.season.state;
    const h = createHash("sha256");
    for (const g of [...s.games].sort((a, b) => a.id - b.id)) h.update(`${g.id}:${g.date}:${g.home_id}:${g.away_id}:${g.home_score}:${g.away_score}|`);
    for (const p of s.polls) h.update(`${p.date}:${p.type}:${p.ranks.slice(0, 25).map((r) => r.team_id).join(",")}|`);
    return h.digest("hex");
  }

  standings() {
    const s = this.season;
    const recs = records(s.state.games, s.teams);
    const confs = new Map<string, { team_id: number; w: number; l: number; cw: number; cl: number }[]>();
    for (const t of s.teams) {
      if (t.level !== "fbs") continue;
      const r = recs.get(t.id)!;
      confs.set(t.conference, [...(confs.get(t.conference) || []), { team_id: t.id, ...r }]);
    }
    const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0);
    return [...confs].sort().map(([conference, rows]) => ({
      conference,
      rows: rows.sort((a, b) => pct(b.cw, b.cl) - pct(a.cw, a.cl) || pct(b.w, b.l) - pct(a.w, a.l) || b.cw - a.cw || a.team_id - b.team_id),
    }));
  }
}

/** The seed's rated players, in compact form, into a league file. */
function writeRated(db: DatabaseSync, seed: SeedBundle): void {
  const st = db.prepare("INSERT OR REPLACE INTO rated_teams (team_id, data) VALUES (?, ?)");
  for (const [tid, tp] of Object.entries(seed.players ?? {})) st.run(Number(tid), j({ ...tp, players: tp.players.map(packPlayer) }));
}

/** Re-run a league from its action log and seed into a scratch database; returns both digests. */
export function replay(src: League, seed: SeedBundle): { original: string; replayed: string } {
  const acts = src.actions();
  const create = acts[0];
  if (create?.type !== "create") throw new Error("league log does not start with create");
  const p = create.payload as Extract<Action, { type: "create" }>["payload"];
  const copy = League.create(src.id + "-replay", ":memory:", seed, p);
  for (const a of acts.slice(1)) copy.apply({ type: a.type, payload: a.payload } as Action, a.user);
  const out = { original: src.digest(), replayed: copy.digest() };
  copy.close();
  return out;
}

function checkCareer(x: CareerStart): CareerStart {
  if (!x || (x.mode !== "real" && x.mode !== "fresh")) throw new Error("career mode must be real or fresh");
  if (x.mode === "real") return { mode: "real" };
  const name = (v: unknown) => String(v ?? "").trim().slice(0, 40);
  return { mode: "fresh", first: name(x.first), last: name(x.last) };
}

function checkCalls(calls: unknown): void {
  if (!Array.isArray(calls) || calls.length > 1000) throw new Error("calls must be a list");
  for (const c of calls) {
    if (!(c === null || typeof c === "boolean" || isOffCall(c) || isDefCall(c) || c === "go" || c === "fg" || c === "punt")) throw new Error(`not a call: ${String(c)}`);
  }
}
