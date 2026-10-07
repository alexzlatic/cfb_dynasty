import { createHash, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  Season, runSim, records, SLOT_POS, type CalEvent, type DepthChart, type Slot, type DayReport, type Game, type SeasonState, type SeedBundle, type Settings, type SimCommand, type Team,
} from "@cfb/core";
import type { TeamRatings } from "@cfb/engine";
import { openDb, tx } from "./db.ts";

export type Action =
  | { type: "create"; payload: { name: string; seed: number; user_team_id: number | null; settings?: Partial<Settings> } }
  | { type: "sim"; payload: SimCommand }
  | { type: "set_user_team"; payload: { team_id: number | null } }
  | { type: "update_settings"; payload: Partial<Settings> }
  /** A team's depth chart; null puts back the opening depth chart. */
  | { type: "set_depth"; payload: { team_id: number; depth: DepthChart | null } };

export interface LoggedAction { seq: number; day: string; user: string | null; type: Action["type"]; payload: unknown; created_at: string }

export type Push =
  | { type: "action"; action: LoggedAction }
  | { type: "days"; from: string; to: string; played: number; stop: string | null; news: { headline: string; body: string; date: string }[] };

const j = JSON.stringify;
const META_KEYS = ["year", "seed", "date", "settings", "user_team_id", "power", "preseason_power", "poll_memory", "conf_champs", "playoff",
  "champion", "next_game_id", "stars", "depth"] as const;

/** A league file plus its in-memory season. All changes go through `apply`, which logs them first. */
export class League {
  season!: Season;
  name = "";
  private listeners = new Set<(p: Push) => void>();

  private constructor(public readonly id: string, public readonly db: DatabaseSync) {}

  /** Create a league file from the seed bundle. The create action is the first entry in the log. */
  static create(id: string, path: string, seed: SeedBundle, opts: { name: string; seed?: number; user_team_id: number | null; settings?: Partial<Settings> }): League {
    const db = openDb(path);
    const lg = new League(id, db);
    const payload = { name: opts.name, seed: opts.seed ?? randomInt(1, 2 ** 31), user_team_id: opts.user_team_id, settings: opts.settings };
    lg.season = Season.create(seed, { seed: payload.seed, user_team_id: payload.user_team_id, settings: payload.settings });
    lg.name = opts.name;
    tx(db, () => {
      const ins = (sql: string, rows: unknown[][]) => { const st = db.prepare(sql); for (const r of rows) st.run(...(r as never[])); };
      ins("INSERT OR IGNORE INTO conferences (name, data) VALUES (?, ?)", seed.conferences.map((c) => [c.name, j(c)]));
      ins("INSERT INTO teams (id, level, conference, data) VALUES (?, ?, ?, ?)", seed.teams.map((t) => [t.id, t.level, t.conference, j(t)]));
      const players: unknown[][] = [];
      for (const [tid, roster] of Object.entries(seed.rosters)) for (const p of roster) players.push([String(p.id), Number(tid), p.pos, j(p)]);
      ins("INSERT OR IGNORE INTO players (id, team_id, pos, data) VALUES (?, ?, ?, ?)", players);
      ins("INSERT INTO coaches (team_id, role, data) VALUES (?, ?, ?)", seed.coaches.map((c) => [c.team_id, c.role, j(c)]));
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

  /** Open an existing league file and rebuild the in-memory season from its tables. */
  static open(id: string, path: string): League {
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
      champion: meta.champion, next_game_id: meta.next_game_id, stars: meta.stars ?? {}, depth: meta.depth ?? {},
      writers: all("SELECT data FROM writers ORDER BY id"),
      games: all<Game>("SELECT data FROM games ORDER BY rowid"),
      events: all<CalEvent>("SELECT data FROM events ORDER BY date, id"),
      polls: all("SELECT data FROM polls ORDER BY id"),
      news: all("SELECT data FROM news ORDER BY rowid"),
    };
    lg.season = new Season(state, { teams, ratings } as SeedBundle);
    return lg;
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

  /** Validate, log and apply one action; returns the day reports it produced. */
  apply(a: Action, user: string | null = null): DayReport[] {
    const s = this.season.state;
    if (a.type === "create") throw new Error("create is only valid as a league's first action");
    if (a.type === "set_user_team" && a.payload.team_id != null && !this.season.teamById.has(a.payload.team_id)) throw new Error("unknown team");
    if (a.type === "sim" && this.season.done) throw new Error("the season is over");
    if (a.type === "set_depth") this.checkDepth(a.payload.team_id, a.payload.depth);
    let reports: DayReport[] = [];
    const logged = tx(this.db, () => {
      const l = this.log(a, user);
      if (a.type === "set_user_team") s.user_team_id = a.payload.team_id;
      if (a.type === "update_settings") {
        this.season.updateSettings(a.payload);
        this.db.exec("DELETE FROM events");
        const e = this.db.prepare("INSERT INTO events (id, date, type, status, data) VALUES (?, ?, ?, ?, ?)");
        for (const x of s.events) e.run(x.id, x.date, x.type, x.status, j(x));
      }
      if (a.type === "set_depth") this.season.setDepth(a.payload.team_id, a.payload.depth);
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

  private writeMeta(): void {
    const st = this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const s = this.season.state as unknown as Record<string, unknown>;
    for (const k of META_KEYS) st.run(k, j(s[k]));
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
