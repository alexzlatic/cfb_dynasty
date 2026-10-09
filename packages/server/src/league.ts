import { createHash, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  Season, LiveGame, playerName, POSITIONS, AREAS, REGIONS, type Region, type StaffTime, type Area, type Pos, runSim, checkPlan, type CareerStart, type Coach, LAB_AREAS, type LabArea, type GameDetail, checkPractice, type GamePlan, type GameSub, type PracticePlan, records, SLOT_POS, packPlayer, unpackPlayers, isDefCall, isOffCall, isClockPlay, TEMPOS, type ClockEvent, type LiveMode, type LiveView, type UserCall, type Player, type CalEvent, type DepthChart, type Slot, type DayReport, type Game, type SeasonState, type SeedBundle, type Settings, type SimCommand, type Team, type RenewalRule, type ConferenceSetup, type Role, type InboxMessage,
} from "@cfb/core";
import type { TeamRatings, Tempo } from "@cfb/engine";
import { openDb, tx } from "./db.ts";

export type Action =
  | { type: "create"; payload: { name: string; seed: number; user_team_id: number | null; settings?: Partial<Settings>; career?: CareerStart; conferences?: ConferenceSetup | null } }
  | { type: "sim"; payload: SimCommand }
  | { type: "set_user_team"; payload: { team_id: number | null } }
  | { type: "update_settings"; payload: Partial<Settings> }
  | { type: "set_conferences"; payload: ConferenceSetup }
  /** A team's depth chart; null puts back the opening depth chart. */
  | { type: "set_depth"; payload: { team_id: number; depth: DepthChart | null } }
  /** The user's calls from a game they called live (null = the coordinator's call); the game plays with them tonight. */
  | { type: "call_game"; payload: { game_id: number; calls: UserCall[]; subs?: GameSub[]; clock?: ClockEvent[] } }
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
  | { type: "request_project"; payload: { area: Area } }
  /** Let your staff run your recruiting board (on), or run it yourself (off). */
  | { type: "recruit_auto"; payload: { on: boolean } }
  /** Your contact hours a week on a prospect (0 takes him off your board). */
  | { type: "recruit_hours"; payload: { pid: number; hours: number } }
  /** Offer a prospect a scholarship, or pull the offer. */
  | { type: "recruit_offer"; payload: { pid: number; on: boolean } }
  /** Send your scouts to evaluate a prospect: `trips` times, then they report back (without a count, each week until taken off the list). */
  | { type: "scout_prospect"; payload: { pid: number; on: boolean; trips?: number; at?: number } }
  /** Your scouts' weekly hours in a region (0 takes them off it): they find prospects there and report every 24 hours. */
  | { type: "region_hours"; payload: { region: Region; hours: number } }
  /** Put a prospect on your big board (at a place in it, or the end), or take him off. */
  | { type: "recruit_board"; payload: { pid: number; on: boolean; at?: number } }
  /** Hire a regional scout (or let one go). */
  | { type: "scout_region"; payload: { region: Region; on: boolean } }
  /** How your staff splits its week between recruiting, scouting and game preparation. */
  | { type: "staff_time"; payload: StaffTime }
  /** Talk with one of your players (five a week): you learn his real reasons. */
  | { type: "talk_player"; payload: { pid: number } }
  /** Renewal talks: an offer for next season (he answers in a day or two), your standing rule, a starting-job promise, letting him go or keeping him off the staff's plan. */
  | { type: "renewal_offer"; payload: { pid: number; amount: number; years: number } }
  | { type: "renewal_rule"; payload: Partial<RenewalRule> }
  | { type: "renewal_promise"; payload: { pid: number; on: boolean } }
  | { type: "renewal_talk"; payload: { pid: number; let_go?: boolean; mine?: boolean; reopen?: boolean } }
  /** Offer one of your players a deal (he answers in a day or two), or take back an offer he hasn't answered. */
  | { type: "contract_offer"; payload: { pid: number; amount: number; years: number } }
  | { type: "contract_withdraw"; payload: { pid: number } }
  /** Make the standing rule's renewals official (these players, or every one waiting). */
  | { type: "renewal_confirm"; payload: { pids?: number[] } }
  /** The transfer portal: bid for a player (0 withdraws), or a pitch call. */
  | { type: "portal_offer"; payload: { pid: number; amount: number; years: number } }
  | { type: "portal_pitch"; payload: { pid: number } }
  /** Your staff: hire a coordinator (whoever holds the job is let go), or let one go. */
  | { type: "hire_coach"; payload: { role: Role; coach_id: number } }
  | { type: "fire_coach"; payload: { role: Role } }
  /** Take a job offer, or turn it down. */
  | { type: "answer_offer"; payload: { team_id: number; accept: boolean } }
  /** Mark inbox messages read or unread (ids null = every message). */
  | { type: "inbox_read"; payload: { ids: string[] | null; read: boolean } };

export interface LoggedAction { seq: number; day: string; user: string | null; type: Action["type"]; payload: unknown; created_at: string }

export type Push =
  | { type: "action"; action: LoggedAction }
  | { type: "days"; from: string; to: string; played: number; stop: string | null; news: { headline: string; body: string; date: string }[] };

const j = JSON.stringify;
const META_KEYS = ["year", "seed", "date", "settings", "user_team_id", "power", "preseason_power", "poll_memory", "conf_champs", "playoff",
  "champion", "next_game_id", "stars", "depth", "injuries", "calls", "subs", "clock_calls", "game_plan", "practice", "prep",
  "player_stats", "team_stats", "award_week", "awards", "redshirts", "career", "hidden_ctx", "schemes", "film", "morale", "lab", "dev_track", "contracts", "pools", "retention", "collectives", "nil", "player_morale", "team_mood",
  "budgets", "facilities", "projects", "ticket_prices", "gate", "requests", "fresh_model", "next_player_id", "past", "recruiting",
  "declared", "draft_pool", "draft", "draft_history",
  "talks", "contract_offers", "renewal_rule", "next_deals", "promises", "talked", "watch", "portal", "moves", "arrived", "fortunes", "fin_history", "charges", "conferences", "tie_ins", "realign", "coaching"] as const;

/** A league file plus its in-memory season. All changes go through `apply`, which logs them first. */
export class League {
  season!: Season;
  name = "";
  /** The user's game being called live today, if any (in memory: a restart drops it and the coordinators play it). */
  live: LiveGame | null = null;
  private listeners = new Set<(p: Push) => void>();

  private constructor(public readonly id: string, public readonly db: DatabaseSync) {}

  /** Create a league file from the seed bundle. The create action is the first entry in the log. */
  static create(id: string, path: string, seed: SeedBundle, opts: { name: string; seed?: number; user_team_id: number | null; settings?: Partial<Settings>; career?: CareerStart; conferences?: ConferenceSetup | null }): League {
    const db = openDb(path);
    const lg = new League(id, db);
    const career = opts.career == null ? undefined : checkCareer(opts.career);
    const payload = { name: opts.name, seed: opts.seed ?? randomInt(1, 2 ** 31), user_team_id: opts.user_team_id, settings: opts.settings, career, conferences: opts.conferences ?? null };
    lg.season = Season.create(seed, { seed: payload.seed, user_team_id: payload.user_team_id, settings: payload.settings, career, conferences: payload.conferences });
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
      subs: meta.subs ?? {}, clock_calls: meta.clock_calls ?? {}, game_plan: meta.game_plan ?? undefined, practice: meta.practice ?? undefined, prep: meta.prep ?? null,
      player_stats: meta.player_stats ?? undefined, award_week: meta.award_week ?? undefined, awards: meta.awards ?? undefined,
      redshirts: meta.redshirts ?? undefined, career: meta.career ?? null,
      hidden_ctx: meta.hidden_ctx ?? undefined, schemes: meta.schemes ?? undefined, film: meta.film ?? null, morale: meta.morale ?? undefined, lab: meta.lab ?? undefined,
      contracts: meta.contracts ?? undefined, pools: meta.pools ?? undefined, retention: meta.retention ?? undefined, collectives: meta.collectives ?? undefined, nil: meta.nil ?? undefined,
      player_morale: meta.player_morale ?? undefined, team_mood: meta.team_mood ?? undefined,
      budgets: meta.budgets ?? undefined, facilities: meta.facilities ?? undefined, projects: meta.projects ?? undefined,
      ticket_prices: meta.ticket_prices ?? undefined, gate: meta.gate ?? undefined, requests: meta.requests ?? undefined,
      fresh_model: meta.fresh_model ?? undefined, next_player_id: meta.next_player_id ?? undefined, past: meta.past ?? undefined,
      recruiting: meta.recruiting ?? undefined,
      declared: meta.declared ?? undefined, draft_pool: meta.draft_pool ?? undefined, draft: meta.draft ?? null, draft_history: meta.draft_history ?? undefined,
      talks: meta.talks ?? undefined, contract_offers: meta.contract_offers ?? undefined, renewal_rule: meta.renewal_rule ?? undefined, next_deals: meta.next_deals ?? undefined, promises: meta.promises ?? undefined,
      talked: meta.talked ?? undefined, watch: meta.watch ?? undefined, portal: meta.portal ?? undefined, moves: meta.moves ?? undefined, arrived: meta.arrived ?? undefined,
      writers: all("SELECT data FROM writers ORDER BY id"),
      // This season's rows; past seasons' are tagged with their year.
      games: all<Game>("SELECT data FROM games WHERE season IS NULL ORDER BY rowid"),
      events: all<CalEvent>("SELECT data FROM events WHERE season IS NULL ORDER BY date, id"),
      polls: all("SELECT data FROM polls WHERE season IS NULL ORDER BY id"),
      news: all("SELECT data FROM news WHERE season IS NULL ORDER BY rowid"),
      inbox: all("SELECT data FROM inbox WHERE season IS NULL ORDER BY rowid"),
    };
    // Anything saved that the list above doesn't name comes back as it was.
    for (const k of META_KEYS) if (meta[k] != null && (state as unknown as Record<string, unknown>)[k] === undefined) (state as unknown as Record<string, unknown>)[k] = meta[k];
    if (seed?.players && !db.prepare("SELECT 1 FROM rated_teams LIMIT 1").get()) tx(db, () => writeRated(db, seed));
    const rosters: Record<string, Player[]> = {};
    for (const r of db.prepare("SELECT team_id, data FROM players WHERE status = 'active'").all() as { team_id: number; data: string }[]) (rosters[r.team_id] ??= []).push(JSON.parse(r.data));
    const packed = Object.fromEntries((db.prepare("SELECT team_id, data FROM rated_teams").all() as { team_id: number; data: string }[]).map((r) => [r.team_id, JSON.parse(r.data)]));
    const players = Object.keys(packed).length ? unpackPlayers(packed, rosters) : undefined;
    lg.season = new Season(state, { teams, ratings, players, finances: seed?.finances, styles: seed?.styles, recruiting: seed?.recruiting, coaches: lg.coaches() } as SeedBundle);
    // Leagues saved before season stats and careers: rebuild stats from the box scores, and start the
    // career the way a new league would (as the school's real head coach).
    if (!("player_stats" in meta) || !("team_stats" in meta)) lg.season.rebuildStats(all<GameDetail>("SELECT data FROM game_details"));
    // Leagues saved before the carousel: every coach starts where the league's seed put him, you among them.
    if (!meta.coaching) {
      const c = lg.season.state.career;
      lg.season.startCoaching(c ? { mode: c.mode, first: c.coach.first, last: c.coach.last } : { mode: "real" }, lg.coaches(), seed?.coach_pool ?? []);
    }
    lg.season.upgradeCoaching();
    if (!("career" in meta)) lg.season.startCareer({ mode: "real" }, lg.coaches());
    // Leagues saved before hidden ratings: the truth comes from the league seed, so it is the same as if
    // it had been there from the start (games already played stay as they were).
    if (!meta.hidden_ctx) lg.season.startHidden(lg.coaches());
    // Leagues saved before money: athletic departments sign their contracts the way a new league's would.
    if (!meta.contracts) lg.season.startMoney();
    if (!meta.collectives) lg.season.startCollectives();
    if (!meta.team_mood) lg.season.weeklyMorale();
    if (!meta.budgets) lg.season.startFinance(seed?.finances);
    // Leagues saved before recruiting: the four classes start the way a new league's would.
    if (!meta.recruiting) lg.season.startRecruiting();
    // ...and before the service rated every junior, or before staffs had to find prospects.
    lg.season.upgradeRecruiting();
    lg.season.upgradeDraft();
    lg.season.upgradePortal();
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
    if (a.type === "set_depth") this.checkDepth(a.payload.team_id, a.payload.depth);
    if (a.type === "call_game") { checkCalls(a.payload.calls); this.checkSubs(a.payload.subs); checkClock(a.payload.clock); }
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
    if (a.type === "recruit_auto") a = { type: a.type, payload: { on: !!a.payload?.on } };
    if (a.type === "recruit_hours") {
      const hours = Math.round(Number(a.payload?.hours));
      if (!Number.isFinite(hours) || hours < 0 || hours > 40) throw new Error("contact hours are 0 to 40 a week");
      a = { type: a.type, payload: { pid: Number(a.payload?.pid), hours } };
    }
    if (a.type === "recruit_offer") a = { type: a.type, payload: { pid: Number(a.payload?.pid), on: !!a.payload?.on } };
    if (a.type === "scout_prospect") {
      const trips = a.payload?.trips == null ? undefined : Math.round(Number(a.payload.trips));
      if (trips != null && (!Number.isFinite(trips) || trips < 1 || trips > 10)) throw new Error("an assignment is 1 to 10 trips");
      const at = a.payload?.at == null ? undefined : Number(a.payload.at);
      if (at != null && !Number.isInteger(at)) throw new Error("at is a place in the list");
      a = { type: a.type, payload: { pid: Number(a.payload?.pid), on: !!a.payload?.on, ...(trips != null ? { trips } : {}), ...(at != null ? { at } : {}) } };
    }
    if (a.type === "region_hours") {
      if (!Object.hasOwn(REGIONS, a.payload?.region)) throw new Error(`unknown region ${a.payload?.region}`);
      const hours = Math.round(Number(a.payload?.hours));
      if (!Number.isFinite(hours) || hours < 0 || hours > 60) throw new Error("region hours are 0 to 60 a week");
      a = { type: a.type, payload: { region: a.payload.region, hours } };
    }
    if (a.type === "recruit_board") {
      const at = a.payload?.at == null ? undefined : Number(a.payload.at);
      if (at != null && !Number.isInteger(at)) throw new Error("at is a place on the board");
      a = { type: a.type, payload: { pid: Number(a.payload?.pid), on: !!a.payload?.on, ...(at != null ? { at } : {}) } };
    }
    if (a.type === "scout_region") {
      if (!Object.hasOwn(REGIONS, a.payload?.region)) throw new Error(`unknown region ${a.payload?.region}`);
      a = { type: a.type, payload: { region: a.payload.region, on: !!a.payload?.on } };
    }
    if (a.type === "staff_time") {
      // Splits sent before development had its own share leave it out (it comes out of practice).
      const t: StaffTime = { recruiting: Number(a.payload?.recruiting), scouting: Number(a.payload?.scouting), prep: Number(a.payload?.prep), opponent: Number(a.payload?.opponent ?? 0.15),
        ...(a.payload?.develop != null ? { develop: Number(a.payload.develop) } : {}) };
      if (Object.values(t).some((x) => !Number.isFinite(x) || x < 0) || t.recruiting + t.scouting + t.prep + t.opponent! + (t.develop ?? 0) <= 0) throw new Error("staff time is shares that add up to more than 0");
      a = { type: a.type, payload: t };
    }
    if (a.type === "hire_coach" || a.type === "fire_coach") {
      const role = a.payload?.role;
      if (role !== "OC" && role !== "DC" && role !== "STC") throw new Error("you hire and fire coordinators (OC, DC, STC)");
      a = a.type === "hire_coach" ? { type: a.type, payload: { role, coach_id: Number(a.payload.coach_id) } } : { type: a.type, payload: { role } };
    }
    if (a.type === "inbox_read") {
      const ids = a.payload?.ids;
      if (ids != null && (!Array.isArray(ids) || ids.length > 5000 || ids.some((x) => typeof x !== "string"))) throw new Error("ids must be a list of message ids");
      a = { type: a.type, payload: { ids: ids ?? null, read: a.payload?.read !== false } };
    }
    if (a.type === "answer_offer") a = { type: a.type, payload: { team_id: Number(a.payload?.team_id), accept: !!a.payload?.accept } };
    if (a.type === "talk_player" || a.type === "portal_pitch") a = { type: a.type, payload: { pid: Number(a.payload?.pid) } };
    if (a.type === "renewal_offer" || a.type === "portal_offer") {
      const x = { pid: Number(a.payload?.pid), amount: Number(a.payload?.amount), years: Math.round(Number(a.payload?.years ?? 1)) };
      if (!Number.isFinite(x.amount) || x.amount < 0 || x.amount > 20_000_000) throw new Error("amount must be between $0 and $20M");
      a = { type: a.type, payload: x };
    }
    if (a.type === "renewal_rule") {
      const r: Partial<RenewalRule> = {};
      for (const k of ["auto_up_to", "offer_up_to", "release_over", "budget_share"] as const) {
        if (a.payload?.[k] == null) continue;
        const v = Number(a.payload[k]);
        if (!Number.isFinite(v) || v < 0 || (k === "budget_share" && v > 1) || (k !== "budget_share" && k !== "release_over" && v > 3)) throw new Error(`bad ${k}`);
        r[k] = v;
      }
      a = { type: a.type, payload: r };
    }
    if (a.type === "renewal_promise") a = { type: a.type, payload: { pid: Number(a.payload?.pid), on: !!a.payload?.on } };
    if (a.type === "renewal_talk") a = { type: a.type, payload: { pid: Number(a.payload?.pid), ...(a.payload?.let_go != null ? { let_go: !!a.payload.let_go } : {}), ...(a.payload?.mine != null ? { mine: !!a.payload.mine } : {}), ...(a.payload?.reopen ? { reopen: true } : {}) } };
    if (a.type === "contract_offer") a = { type: a.type, payload: { pid: Number(a.payload?.pid), amount: Math.round(Number(a.payload?.amount)), years: Math.max(1, Math.round(Number(a.payload?.years) || 1)) } };
    if (a.type === "contract_withdraw") a = { type: a.type, payload: { pid: Number(a.payload?.pid) } };
    if (a.type === "renewal_confirm") a = { type: a.type, payload: Array.isArray(a.payload?.pids) ? { pids: a.payload.pids.map(Number) } : {} };
    // A live game is played from today's lineups and settings; changing them would make it a different game.
    if (this.live && (a.type === "set_depth" || a.type === "update_settings" || a.type === "set_conferences" || a.type === "set_user_team" || a.type === "set_game_plan" || a.type === "set_redshirt" || a.type === "set_lab" || a.type === "hire_coach" || a.type === "fire_coach" || a.type === "answer_offer")) throw new Error("finish or leave your live game first");
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
      if (a.type === "set_conferences") {
        this.season.setConferences(a.payload);
        this.db.exec("DELETE FROM games WHERE season IS NULL AND kind = 'regular'");
        const g = this.db.prepare("INSERT INTO games (id, date, kind, home_id, away_id, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)");
        for (const x of s.games) if (x.kind === "regular") g.run(x.id, x.date, x.kind, x.home_id, x.away_id, x.status, j(x));
      }
      if (a.type === "set_depth") this.season.setDepth(a.payload.team_id, a.payload.depth);
      if (a.type === "call_game") {
        this.season.setCalls(a.payload.game_id, a.payload.calls);
        this.season.setSubs(a.payload.game_id, a.payload.subs ?? []);
        this.season.setClockCalls(a.payload.game_id, a.payload.clock ?? []);
      }
      if (a.type === "set_game_plan") this.season.setGamePlan(a.payload);
      if (a.type === "set_practice") this.season.setPractice(a.payload);
      if (a.type === "set_redshirt") this.season.setRedshirt(a.payload.pid, a.payload.on);
      if (a.type === "set_lab") this.season.setLab(a.payload.pid, a.payload.area);
      if (a.type === "sign_contract") this.season.setContract(a.payload.pid, a.payload.amount, a.payload.years);
      if (a.type === "set_collective_focus") this.season.setCollectiveFocus(a.payload.focus);
      if (a.type === "set_ticket_price") this.season.setTicketPrice(a.payload.game_id, a.payload.price);
      if (a.type === "request_project") this.season.requestProject(a.payload.area);
      if (a.type === "recruit_auto") this.season.setRecruitAuto(a.payload.on);
      if (a.type === "recruit_hours") this.season.setRecruitHours(a.payload.pid, a.payload.hours);
      if (a.type === "recruit_offer") this.season.setOffer(a.payload.pid, a.payload.on);
      if (a.type === "scout_prospect") this.season.setScoutTarget(a.payload.pid, a.payload.on, a.payload.trips, a.payload.at);
      if (a.type === "region_hours") this.season.setRegionHours(a.payload.region, a.payload.hours);
      if (a.type === "recruit_board") this.season.setBoard(a.payload.pid, a.payload.on, a.payload.at);
      if (a.type === "scout_region") this.season.setScoutRegion(a.payload.region, a.payload.on);
      if (a.type === "staff_time") this.season.setStaffTime(a.payload);
      if (a.type === "talk_player") this.season.talkTo(a.payload.pid);
      if (a.type === "renewal_offer") this.season.renewalOffer(a.payload.pid, a.payload.amount, a.payload.years);
      if (a.type === "renewal_rule") this.season.setRenewalRule(a.payload);
      if (a.type === "renewal_promise") this.season.setPromise(a.payload.pid, a.payload.on);
      if (a.type === "renewal_talk") this.season.setTalk(a.payload.pid, a.payload);
      if (a.type === "renewal_confirm") this.season.confirmRenewals(a.payload.pids);
      if (a.type === "contract_offer") this.season.contractOffer(a.payload.pid, a.payload.amount, a.payload.years);
      if (a.type === "contract_withdraw") this.season.withdrawOffer(a.payload.pid);
      if (a.type === "portal_offer") this.season.portalOffer(a.payload.pid, a.payload.amount, a.payload.years);
      if (a.type === "portal_pitch") this.season.portalPitch(a.payload.pid);
      if (a.type === "hire_coach") this.season.hireCoach(a.payload.role, a.payload.coach_id);
      if (a.type === "fire_coach") this.season.fireCoach(a.payload.role);
      if (a.type === "answer_offer") this.season.answerOffer(a.payload.team_id, a.payload.accept);
      if (a.type === "inbox_read") this.markRead(a.payload.ids, a.payload.read);
      if (a.type === "sim") {
        // A sim after the season has ended starts the next one.
        if (this.season.done) this.nextSeason();
        reports = runSim(this.season, a.payload, (r) => this.persistDay(r));
      }
      this.writeInbox();
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

  /** Roll the league into its next season (inside an action's transaction): rosters, schedule, calendar. */
  private nextSeason(): void {
    const db = this.db, old = this.season.state;
    // Last season's stats go into the history before the season's state is replaced.
    const ps = db.prepare("INSERT OR REPLACE INTO player_seasons (pid, year, team_id, data) VALUES (?, ?, ?, ?)");
    for (const [pid, st] of Object.entries(old.player_stats ?? {})) {
      const p = this.season.playerById.get(Number(pid));
      ps.run(Number(pid), old.year, st.team_id, j({ ...st, name: p ? playerName(p) : "", pos: p?.pos ?? "", class: p?.class ?? "" }));
    }
    const ts = db.prepare("INSERT OR REPLACE INTO team_seasons (team_id, year, data) VALUES (?, ?, ?)");
    for (const [tid, st] of Object.entries(old.team_stats ?? {})) ts.run(Number(tid), old.year, j(st));
    const { next, left } = this.season.nextSeason(this.coaches());
    const s = next.state;
    // Last season's rows stay in the file under its year; what's still ahead on the calendar carries over.
    const ahead = new Set(s.events.filter((e) => e.date >= s.date).map((e) => e.id));
    db.prepare("UPDATE games SET season = ? WHERE season IS NULL").run(old.year);
    db.prepare("UPDATE polls SET season = ? WHERE season IS NULL").run(old.year);
    db.prepare("UPDATE news SET season = ? WHERE season IS NULL").run(old.year);
    this.writeInbox();
    db.prepare("UPDATE inbox SET season = ? WHERE season IS NULL").run(old.year);
    const keep = db.prepare("SELECT id FROM events WHERE season IS NULL").all() as { id: string }[];
    const tag = db.prepare("UPDATE events SET season = ? WHERE id = ?");
    for (const r of keep) if (!ahead.has(r.id)) tag.run(old.year, r.id);
    const e = db.prepare("INSERT INTO events (id, date, type, status, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data");
    for (const x of s.events) e.run(x.id, x.date, x.type, x.status, j(x));
    const g = db.prepare("INSERT INTO games (id, date, kind, home_id, away_id, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const x of s.games) g.run(x.id, x.date, x.kind, x.home_id, x.away_id, x.status, j(x));
    const n = db.prepare("INSERT OR REPLACE INTO news (id, date, kind, author, data) VALUES (?, ?, ?, ?, ?)");
    for (const x of s.news) n.run(x.id, x.date, x.kind, x.author ?? null, j(x));
    // Players: everyone still playing with his new class (and the freshmen), and who left and why.
    const pl = db.prepare("INSERT INTO players (id, team_id, pos, status, data) VALUES (?, ?, ?, 'active', ?) ON CONFLICT(id) DO UPDATE SET team_id = excluded.team_id, pos = excluded.pos, status = 'active', data = excluded.data");
    for (const t of next.teams) {
      for (const p of next.roster(t.id)) {
        const ident: Player = { id: p.id, first: p.first, last: p.last, pos: p.listed, class: p.class, jersey: p.jersey, height: p.height, weight: p.weight, home: p.home, recruit_ids: [] };
        const prev = db.prepare("SELECT data FROM players WHERE id = ?").get(String(p.id)) as { data: string } | undefined;
        if (prev) ident.recruit_ids = (JSON.parse(prev.data) as Player).recruit_ids ?? [];
        pl.run(String(p.id), t.id, p.listed, j(ident));
      }
    }
    const gone = db.prepare("UPDATE players SET status = ? WHERE id = ?");
    // (A transfer is still playing: his row moved to his new school above.)
    for (const d of left) if (d.reason !== "transfer") gone.run(d.reason, String(d.pid));
    writeRated(db, { players: Object.fromEntries(next.teams.flatMap((t) => { const tp = next.teamPlayers(t.id); return tp ? [[t.id, tp]] : []; })) } as SeedBundle);
    this.season = next;
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

  /** Change your tempo or who calls your timeouts in the live game. */
  liveClock(c: { tempo?: Tempo | "auto"; manual_timeouts?: boolean }): LiveView {
    if (!this.live) throw new Error("no live game");
    this.live.setClock(c);
    return this.live.view(Number.MAX_SAFE_INTEGER);
  }

  /** Call a timeout in the live game. */
  liveTimeout(since = 0): LiveView {
    if (!this.live) throw new Error("no live game");
    this.live.timeout();
    return this.live.view(since);
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
    this.apply({ type: "call_game", payload: { game_id: live.game.id, calls: live.calls, subs: live.subs, clock: live.clock } });
    this.apply({ type: "sim", payload: { kind: "day" } });
    return { ...v, result: this.season.state.games.find((g) => g.id === live.game.id) };
  }

  /** The season and recruiting revision last saved (recruiting is several megabytes, so it's saved only when it changed). */
  private savedRecruiting: { season: Season; rev: number } | null = null;

  private writeMeta(): void {
    const st = this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const s = this.season.state as unknown as Record<string, unknown>;
    for (const k of META_KEYS) {
      if (k === "recruiting") {
        if (this.savedRecruiting?.season === this.season && this.savedRecruiting.rev === this.season.recruitRev) continue;
        this.savedRecruiting = { season: this.season, rev: this.season.recruitRev };
      }
      st.run(k, j(s[k] ?? null));
    }
  }

  /** Messages saved so far this season (the inbox is append-only within a season). */
  private savedInbox: { season: Season; n: number } | null = null;

  /** New inbox messages into the file. */
  private writeInbox(): void {
    const box = this.season.state.inbox ?? [];
    if (this.savedInbox?.season !== this.season) {
      this.savedInbox = { season: this.season, n: (this.db.prepare("SELECT COUNT(*) AS n FROM inbox WHERE season IS NULL").get() as { n: number }).n };
    }
    if (this.savedInbox.n >= box.length) return;
    const st = this.db.prepare("INSERT OR IGNORE INTO inbox (id, date, category, data) VALUES (?, ?, ?, ?)");
    for (const m of box.slice(this.savedInbox.n)) st.run(m.id, m.date, m.category, j(m));
    this.savedInbox.n = box.length;
  }

  private markRead(ids: string[] | null, read: boolean): void {
    this.writeInbox();
    if (ids == null) { this.db.prepare("UPDATE inbox SET read = ?").run(read ? 1 : 0); return; }
    const st = this.db.prepare("UPDATE inbox SET read = ? WHERE id = ?");
    for (const id of ids) st.run(read ? 1 : 0, id);
  }

  /** Inbox messages, newest first, with whether each has been read; `year` reads a past season's. */
  inbox(opts: { year?: number; category?: string; unread?: boolean; limit?: number } = {}): { messages: (InboxMessage & { read: boolean })[]; unread: number } {
    this.writeInbox();
    const s = this.season.state, past = opts.year != null && opts.year !== s.year;
    const where = [past ? "season = ?" : "season IS NULL"], args: (string | number)[] = past ? [opts.year!] : [];
    if (opts.category) { where.push("category = ?"); args.push(opts.category); }
    if (opts.unread) where.push("read = 0");
    const rows = this.db.prepare(`SELECT read, data FROM inbox WHERE ${where.join(" AND ")} ORDER BY date DESC, rowid DESC LIMIT ?`)
      .all(...args, Math.max(1, Math.min(opts.limit ?? 500, 5000))) as { read: number; data: string }[];
    const unread = (this.db.prepare("SELECT COUNT(*) AS n FROM inbox WHERE read = 0 AND season IS NULL").get() as { n: number }).n;
    return { messages: rows.map((r) => ({ ...(JSON.parse(r.data) as InboxMessage), read: !!r.read })), unread };
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
    if (!(c === null || typeof c === "boolean" || isOffCall(c) || isDefCall(c) || isClockPlay(c) || c === "go" || c === "fg" || c === "punt")) throw new Error(`not a call: ${String(c)}`);
  }
}

function checkClock(clock: unknown): void {
  if (clock == null) return;
  if (!Array.isArray(clock) || clock.length > 500) throw new Error("clock must be a list");
  for (const e of clock) {
    if (!e || !Number.isInteger(e.at) || e.at < 0) throw new Error("bad clock event");
    if (e.tempo != null && !TEMPOS.some((t) => t.id === e.tempo)) throw new Error(`unknown tempo ${String(e.tempo)}`);
    if (e.manual_timeouts != null && typeof e.manual_timeouts !== "boolean") throw new Error("bad clock event");
    if (e.timeout != null && e.timeout !== true) throw new Error("bad clock event");
  }
}
