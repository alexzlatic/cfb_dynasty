import { GameSim, Rng, type TeamRatings } from "@cfb/engine";
import { compileTeam, lineup, type DepthChart } from "./compiler.ts";
import { GameDay, type SideSetup } from "./gameday.ts";
import { Caller, type UserCall } from "./calls.ts";
import { POSITIONS, type RatedPlayer } from "./players.ts";
import { addDays, type ISODate } from "./dates.ts";
import { postseasonEvents, seasonEvents, sortEvents } from "./calendar.ts";
import { mixSeed } from "./hash.ts";
import { AP_PANEL, COMMITTEE_PANEL, bcsStandings, runPoll, type PanelMemory, type PanelSpec } from "./polls.ts";
import { bracketOrder, mainRounds, openingPairs, slotCount, validatePlayoff } from "./playoff.ts";
import { records, updatePower } from "./ranking.ts";
import { generateWriters, starLine, writeStory, type Writer } from "./writers.ts";
import {
  DEFAULT_SETTINGS, type Ballot, type CalEvent, type Game, type GameDetail, type GameKind, type Injury, type NewsItem, type Poll, type SeedBundle,
  type Settings, type Team,
} from "./types.ts";

export interface Seeded { seed: number; team_id: number }

export interface PlayoffState {
  format: Settings["playoff"]["format"];
  field: Seeded[];
  /** Rounds in the whole event, the last one built, and the teams still alive in bracket order. */
  rounds: number;
  round: number;
  alive: Seeded[] | null;
}

/** Everything that changes as the season runs. Plain data, so the server can persist and reload it. */
export interface SeasonState {
  year: number;
  seed: number;
  date: ISODate;
  settings: Settings;
  user_team_id: number | null;
  games: Game[];
  events: CalEvent[];
  polls: Poll[];
  news: NewsItem[];
  power: Record<number, number>;
  preseason_power: Record<number, number>;
  poll_memory: Record<string, PanelMemory>;
  conf_champs: Record<string, number>;
  playoff: PlayoffState | null;
  /** AP voters, and a line on each team's best player in its latest game (for their stories). */
  writers: Writer[];
  stars: Record<number, string>;
  champion: number | null;
  next_game_id: number;
  /** Depth charts changed from the seed's, by team. */
  depth?: Record<number, DepthChart>;
  /** Every injury that cost a player games, oldest first. */
  injuries?: Injury[];
  /** The user's play calls in games they called live, by game id, in the order the game asked for them. */
  calls?: Record<number, UserCall[]>;
}

export interface DayReport {
  date: ISODate;
  fired: CalEvent[];
  played: Game[];
  details: GameDetail[];
  new_games: Game[];
  new_events: CalEvent[];
  polls: Poll[];
  ballots: Ballot[];
  news: NewsItem[];
  stop: string | null;
}

const gameOrder = (a: Game, b: Game) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);

/** "is out for the season", "will miss about 3 weeks", ... */
export function injuryOutlook(days: number): string {
  if (days >= 90) return "is out for the season";
  if (days < 5) return "is day to day";
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? "will miss about a week" : `will miss about ${weeks} weeks`;
}

const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const INDEPENDENT = "FBS Independents";

export class Season {
  readonly teams: Team[];
  readonly teamById: Map<number, Team>;
  private ratings: Map<number, TeamRatings>;
  private seed: SeedBundle;
  readonly playerById = new Map<number, RatedPlayer>();
  /** Each team's compiled lineup and the injured players it was compiled without. */
  private compiled = new Map<number, { out: string; r: TeamRatings }>();

  constructor(public state: SeasonState, seed: SeedBundle) {
    this.seed = seed;
    // Teams in id order, the order a league file returns them in, so polls draw the same noise after a reopen.
    this.teams = [...seed.teams].sort((a, b) => a.id - b.id);
    this.teamById = new Map(seed.teams.map((t) => [t.id, t]));
    this.ratings = new Map(Object.entries(seed.ratings).map(([k, v]) => [Number(k), v.ratings]));
    for (const t of Object.values(seed.players ?? {})) for (const p of t.players) this.playerById.set(p.id, p);
    state.depth ??= {};
    state.injuries ??= [];
    // One canonical game order (date, then id), so a league reopened from its file plays a day's games in the same order.
    state.games.sort(gameOrder);
  }

  /** A team's rated players (empty with a seed that has none). */
  roster(teamId: number): RatedPlayer[] { return this.seed.players?.[teamId]?.players ?? []; }
  depthChart(teamId: number): DepthChart { return this.state.depth?.[teamId] ?? this.seed.players?.[teamId]?.depth ?? {}; }

  /** Set a team's depth chart, or put back its opening one with null. */
  setDepth(teamId: number, depth: DepthChart | null): void {
    if (depth) this.state.depth![teamId] = depth;
    else delete this.state.depth![teamId];
    this.compiled.delete(teamId);
  }

  /** Injuries keeping a team's players out today (or on `date`). */
  injured(teamId: number, date = this.state.date): Injury[] {
    return this.state.injuries!.filter((i) => i.team_id === teamId && i.back > date);
  }
  injuryOf(pid: number, date = this.state.date): Injury | null {
    const all = this.state.injuries!;
    for (let i = all.length - 1; i >= 0; i--) if (all[i].pid === pid && all[i].back > date) return all[i];
    return null;
  }

  /** What the engine plays: the team's healthy lineup compiled into rates, or its team ratings without players. */
  teamRatings(teamId: number): TeamRatings | undefined {
    const base = this.ratings.get(teamId);
    const tp = this.seed.players?.[teamId];
    if (!base || !tp) return base;
    const out = new Set(this.injured(teamId).map((i) => i.pid));
    const key = [...out].sort().join(",");
    let c = this.compiled.get(teamId);
    if (!c || c.out !== key) {
      c = { out: key, r: compileTeam(base, lineup(this.depthChart(teamId), this.playerById, out), tp.scheme, tp.kicking) };
      this.compiled.set(teamId, c);
    }
    return c.r;
  }

  private sideSetup(teamId: number): SideSetup | null {
    const base = this.ratings.get(teamId);
    const tp = this.seed.players?.[teamId];
    if (!base || !tp) return null;
    return { team_id: teamId, base, players: tp, depth: this.depthChart(teamId), out: new Set(this.injured(teamId).map((i) => i.pid)) };
  }

  /** A new league on the seed's start date. */
  static create(seed: SeedBundle, opts: { seed: number; user_team_id?: number | null; settings?: Partial<Settings> }): Season {
    const games: Game[] = seed.schedule.map((g) => ({
      id: g.id, kind: "regular", week: g.week, date: g.date, kickoff_et: g.kickoff_et, home_id: g.home_id, away_id: g.away_id,
      neutral: g.neutral, conference_game: g.conference_game, venue: g.venue, label: g.notes, status: "scheduled",
      home_score: null, away_score: null, overtime: false,
    }));
    const power: Record<number, number> = {};
    for (const t of seed.teams) power[t.id] = seed.power[t.id] ?? 0;
    const settings: Settings = { ...DEFAULT_SETTINGS, ...opts.settings, playoff: { ...DEFAULT_SETTINGS.playoff, ...opts.settings?.playoff } };
    const bad = validatePlayoff(settings.playoff);
    if (bad) throw new Error(bad);
    const state: SeasonState = {
      year: seed.season, seed: opts.seed >>> 0, date: seed.start_date, settings,
      user_team_id: opts.user_team_id ?? null, games, events: seasonEvents(seed.season, seed.start_date, seed.schedule, settings.playoff),
      polls: [], news: [], power, preseason_power: { ...power }, poll_memory: {}, conf_champs: {}, playoff: null, champion: null,
      next_game_id: 9_000_001, writers: generateWriters(seed.teams, seed.rosters, opts.seed >>> 0), stars: {},
    };
    return new Season(state, seed);
  }

  get done(): boolean { return this.state.events.some((e) => e.type === "season_end" && e.status === "done"); }
  team(id: number): Team { return this.teamById.get(id)!; }
  latestPoll(type: Poll["type"] = "ap"): Poll | null {
    for (let i = this.state.polls.length - 1; i >= 0; i--) if (this.state.polls[i].type === type) return this.state.polls[i];
    return null;
  }
  rankOf(teamId: number, poll = this.latestPoll()): number | null {
    if (!poll) return null;
    const i = poll.ranks.findIndex((r) => r.team_id === teamId);
    return i >= 0 && i < 25 ? i + 1 : null;
  }

  /**
   * Change settings. Playoff format changes rebuild the postseason calendar until selection day;
   * after that they apply from next season.
   */
  updateSettings(patch: Partial<Settings>): void {
    const s = this.state;
    const next: Settings = { ...s.settings, ...patch, playoff: { ...s.settings.playoff, ...patch.playoff } };
    const bad = validatePlayoff(next.playoff);
    if (bad) throw new Error(bad);
    if (JSON.stringify(next.playoff) !== JSON.stringify(s.settings.playoff)) {
      if (s.playoff || s.events.some((e) => e.type === "selection" && e.status === "done")) {
        throw new Error("the postseason has started; playoff changes apply from next season");
      }
      const POST = new Set(["cfp_rankings", "bcs_standings", "selection", "playoff_round", "title_game"]);
      s.events = sortEvents([...s.events.filter((e) => !POST.has(e.type) || e.status === "done"),
        ...postseasonEvents(s.year, next.playoff).filter((e) => e.date >= s.date)]);
    }
    s.settings = next;
  }

  /** Run today in the fixed order (morning events, actions, day processing, evening games), then move to tomorrow. */
  advanceDay(): DayReport {
    const s = this.state;
    const today = s.date;
    const rep: DayReport = { date: today, fired: [], played: [], details: [], new_games: [], new_events: [], polls: [], ballots: [], news: [], stop: null };

    // 1. Morning: scheduled events fire.
    for (const e of s.events) {
      if (e.date !== today || e.status === "done") continue;
      e.status = "done";
      rep.fired.push(e);
      if (e.active) this.fire(e, rep);
    }
    // 2. Actions are applied by the server before it calls advanceDay; contested orders resolve here in M3+.
    // 3. Day processing: build postseason games whose inputs are now known.
    this.buildPostseason(rep);
    // 4. Evening: today's games, then standings, power and news.
    for (const g of s.games) {
      if (g.date !== today || g.status === "final") continue;
      this.play(g, rep);
    }
    if (rep.fired.some((e) => e.type === "season_end")) rep.stop = "season_end";
    s.date = addDays(today, 1);
    return rep;
  }

  // ---- events --------------------------------------------------------------------------------
  private poll(type: "ap" | "coaches" | "cfp", date: ISODate, spec: PanelSpec, champion: number | null = null, rep?: DayReport): Poll {
    const s = this.state;
    const { ballots, ...poll } = runPoll({ voters: type === "ap" ? s.writers.map((w) => w.voter) : undefined,
      date, type, teams: this.teams, games: s.games, power: s.power, preseason: s.preseason_power,
      champs: new Set(Object.values(s.conf_champs)), hfa: s.settings.home_field_points, seed: s.seed, spec,
      memory: (s.poll_memory[type] ??= {}), biasScale: s.settings.poll_bias, noiseScale: s.settings.poll_noise, champion,
    });
    s.polls.push(poll);
    if (type === "ap" && rep) ballots.forEach((team_ids, i) => rep.ballots.push({ date, poll: "ap", writer_id: s.writers[i].id, team_ids }));
    return poll;
  }

  /** Every writer files a story on their beat after the AP poll. */
  private stories(poll: Poll, prev: Poll | null, rep: DayReport): void {
    const s = this.state;
    const recs = records(s.games, this.teams);
    for (const w of s.writers) {
      const ballot = rep.ballots.find((b) => b.writer_id === w.id && b.date === poll.date)?.team_ids ?? [];
      const st = writeStory(w, { date: poll.date, teams: this.teamById, games: s.games, poll, prev, ballot, records: recs, stars: s.stars, seed: s.seed });
      const n = this.news(poll.date, "story", st.headline, st.body, st.team_ids);
      n.author = w.id;
      rep.news.push(n);
    }
  }

  private top(poll: Poll, n: number): string {
    return poll.ranks.slice(0, n).map((r, i) => `${i + 1}. ${this.team(r.team_id).school}`).join(", ");
  }

  private fire(e: CalEvent, rep: DayReport): void {
    const s = this.state;
    switch (e.type) {
      case "dynasty_start":
      case "ap_poll": {
        const prev = this.latestPoll("ap");
        const poll = this.poll("ap", e.date, AP_PANEL, null, rep);
        rep.polls.push(poll, this.poll("coaches", e.date, { ...AP_PANEL, size: 66 }));
        const top = this.team(poll.ranks[0].team_id);
        const firsts = poll.ranks[0].first ?? 0;
        rep.news.push(this.news(e.date, "poll", prev ? (prev.ranks[0].team_id === top.id ? `${top.school} stays No. 1 in the AP poll` : `${top.school} takes over No. 1 in the AP poll`)
          : `${top.school} opens the season No. 1 in the AP poll`, `${firsts} of ${poll.voters} first-place votes. ${this.top(poll, 5)}`, [top.id]));
        this.stories(poll, prev, rep);
        break;
      }
      case "cfp_rankings": {
        const poll = this.poll("cfp", e.date, COMMITTEE_PANEL);
        rep.polls.push(poll);
        rep.news.push(this.news(e.date, "cfp", `CFP rankings: ${this.team(poll.ranks[0].team_id).school} is No. 1`, this.top(poll, 12), [poll.ranks[0].team_id]));
        break;
      }
      case "bcs_standings": {
        const poll = this.bcs(e.date);
        rep.polls.push(poll);
        rep.news.push(this.news(e.date, "bcs", `BCS standings: ${this.team(poll.ranks[0].team_id).school} is No. 1`, this.top(poll, 10), [poll.ranks[0].team_id]));
        break;
      }
      case "selection": this.select(e.date, rep); break;
      case "season_end": {
        const poll = this.poll("ap", e.date, AP_PANEL, s.champion, rep);
        if (s.champion == null) {
          s.champion = poll.ranks[0].team_id;
          rep.news.push(this.news(e.date, "champion", `${this.team(s.champion).school} is the AP national champion`, this.top(poll, 5), [s.champion]));
        }
        rep.polls.push(poll);
        break;
      }
      default: break;
    }
  }

  private bcs(date: ISODate): Poll {
    const s = this.state;
    const ap = this.latestPoll("ap") ?? this.poll("ap", date, AP_PANEL);
    const co = this.latestPoll("coaches") ?? this.poll("coaches", date, { ...AP_PANEL, size: 66 });
    const poll = bcsStandings(date, ap, co, this.teams, s.games, s.power);
    s.polls.push(poll);
    return poll;
  }

  // ---- games ---------------------------------------------------------------------------------
  private keepPlays(g: Game): boolean {
    const s = this.state;
    const mine = s.user_team_id != null && (g.home_id === s.user_team_id || g.away_id === s.user_team_id);
    if (s.settings.keep_pbp === "all" || mine) return true;
    if (s.settings.keep_pbp === "mine") return false;
    return g.kind !== "regular" || (this.rankOf(g.home_id) != null && this.rankOf(g.away_id) != null);
  }

  /**
   * A game ready to kick off: the engine, game day (fatigue, rotation, injuries and blowout subs, on
   * its own random stream) and, when the user called plays in it, the caller on a third stream. A live
   * game builds the same objects, so playing it later with the recorded calls gives the same game.
   */
  gameSetup(g: Game): { sim: GameSim; gd: GameDay | null; sides: [SideSetup, SideSetup] | null; caller: Caller | null } {
    const s = this.state;
    const opts = { rng: new Rng(mixSeed(s.seed, s.year, g.id)), neutral: g.neutral, record: true };
    const hs = this.sideSetup(g.home_id), as = this.sideSetup(g.away_id);
    const user = s.user_team_id;
    const userSide = user === g.home_id ? "home" : user === g.away_id ? "away" : null;
    const caller = userSide ? new Caller(userSide, new Rng(mixSeed(s.seed, s.year, g.id, "calls"))) : null;
    if (hs && as) {
      const gd = new GameDay(hs, as, new Rng(mixSeed(s.seed, s.year, g.id, "gameday")), { injuries: s.settings.injuries ?? 1 });
      const k = gd.kickoff();
      return { sim: new GameSim(k.home, k.away, opts), gd, sides: [hs, as], caller };
    }
    const home = this.teamRatings(g.home_id), away = this.teamRatings(g.away_id);
    if (!home || !away) throw new Error(`no ratings for game ${g.id}`);
    return { sim: new GameSim(home, away, opts), gd: null, sides: null, caller };
  }

  /** Record the user's calls for one of their games today (from a live game); the game plays with them tonight. */
  setCalls(gameId: number, calls: UserCall[]): void {
    const s = this.state, g = s.games.find((x) => x.id === gameId);
    if (!g || g.status === "final" || g.date !== s.date) throw new Error("that game is not being played today");
    if (s.user_team_id == null || (g.home_id !== s.user_team_id && g.away_id !== s.user_team_id)) throw new Error("you can only call your own games");
    (s.calls ??= {})[gameId] = calls;
  }

  private play(g: Game, rep: DayReport): void {
    const s = this.state;
    const rankH = this.rankOf(g.home_id), rankA = this.rankOf(g.away_id);
    const { sim, gd, sides, caller } = this.gameSetup(g);
    const calls = s.calls?.[g.id];
    const called = calls && caller ? caller.replay(calls) : undefined;
    sim.play(gd ? gd.provider(called) : called);
    const hs = sides?.[0], as = sides?.[1];
    const r = sim.result();
    const day = gd?.result();
    g.status = "final";
    g.home_score = r.home.score;
    g.away_score = r.away.score;
    g.overtime = r.overtime;
    rep.played.push(g);
    rep.details.push({
      game_id: g.id, home_box: r.home.box, away_box: r.away.box, home_players: r.home.players, away_players: r.away.players,
      home_q: r.home.qscores, away_q: r.away.qscores, drives: r.drives ?? [], plays: this.keepPlays(g) ? r.plays ?? null : null,
      injuries: day?.injuries ?? [], snaps: day?.snaps ?? {},
    });
    if (day) this.recordInjuries(g, day.injuries, [hs!, as!], rep);
    updatePower(s.power, g, s.settings.home_field_points);
    for (const [id, side] of [[g.home_id, r.home], [g.away_id, r.away]] as const) {
      const line = starLine(side.players as Record<string, Record<string, number>>, this.team(id).school);
      if (line) s.stars[id] = line;
    }
    this.recap(g, rankH, rankA, rep);
    if (g.title) {
      s.champion = g.home_score! > g.away_score! ? g.home_id : g.away_id;
      const c = this.team(s.champion);
      rep.news.push(this.news(g.date, "champion", `${c.school} wins the national championship`, this.scoreLine(g), [c.id]));
    }
  }

  /** Injuries that cost games go on the season's list; the notable ones make the news. */
  private recordInjuries(g: Game, list: GameDetail["injuries"] & {}, sides: SideSetup[], rep: DayReport): void {
    const s = this.state;
    for (const x of list) {
      if (x.days == null) continue;
      const side = sides.find((d) => d.team_id === x.team_id)!;
      const starters = lineup(side.depth, this.playerById, side.out).slot;
      const starter = Object.values(starters).some((p) => p?.id === x.pid);
      const inj: Injury = { pid: x.pid, team_id: x.team_id, name: x.name, pos: x.pos, game_id: g.id, date: g.date, type: x.type, days: x.days,
        back: addDays(g.date, Math.max(1, x.days)), starter };
      s.injuries!.push(inj);
      const t = this.team(x.team_id);
      const mine = s.user_team_id === x.team_id;
      // Around the league only starting quarterbacks and ranked teams' season-ending injuries make the news.
      const notable = starter && t.level === "fbs" && (x.pos === "QB" ? x.days >= 5 : x.days >= 90 && this.rankOf(t.id) != null);
      if (x.days >= 5 && (mine || notable)) {
        rep.news.push(this.news(g.date, "injury", `${t.school} ${POSITIONS.includes(x.pos) ? x.pos : ""} ${x.name} ${injuryOutlook(x.days)}`.replace(/\s+/g, " "),
          `${x.name} was hurt (${x.type}) against ${this.team(x.team_id === g.home_id ? g.away_id : g.home_id).school}.`, [x.team_id]));
      }
    }
  }

  private scoreLine(g: Game): string {
    const h = this.team(g.home_id), a = this.team(g.away_id);
    const [w, l, ws, ls] = g.home_score! > g.away_score! ? [h, a, g.home_score!, g.away_score!] : [a, h, g.away_score!, g.home_score!];
    return `${w.school} ${ws}, ${l.school} ${ls}${g.overtime ? " (OT)" : ""}`;
  }

  private recap(g: Game, rankH: number | null, rankA: number | null, rep: DayReport): void {
    const s = this.state;
    const h = this.team(g.home_id), a = this.team(g.away_id);
    const homeWon = g.home_score! > g.away_score!;
    const [w, l, rw, rl] = homeWon ? [h, a, rankH, rankA] : [a, h, rankA, rankH];
    const name = (t: Team, rk: number | null) => (rk ? `No. ${rk} ${t.school}` : t.school);
    const mine = s.user_team_id === g.home_id || s.user_team_id === g.away_id;
    let headline: string | null = null;
    let kind = "result";
    if (g.kind !== "regular") { headline = `${g.label}: ${name(w, rw)} beats ${name(l, rl)}`; kind = "postseason"; }
    else if (w.level === "fcs" && l.level === "fbs") { headline = `Upset: FCS ${w.school} stuns ${name(l, rl)}`; kind = "upset"; }
    else if (rl && (!rw || rw - rl >= 10)) { headline = `Upset: ${name(w, rw)} knocks off ${name(l, rl)}`; kind = "upset"; }
    else if (rw && rl) headline = `${name(w, rw)} beats ${name(l, rl)}`;
    else if (mine) headline = `${name(w, rw)} beats ${name(l, rl)}`;
    if (headline) rep.news.push(this.news(g.date, kind, headline, this.scoreLine(g), [g.home_id, g.away_id]));
  }

  private news(date: ISODate, kind: string, headline: string, body: string, team_ids: number[]): NewsItem {
    const n = { id: `${date}:${this.state.news.length}`, date, kind, headline, body, team_ids };
    this.state.news.push(n);
    return n;
  }

  private addGame(rep: DayReport, g: Omit<Game, "id" | "status" | "home_score" | "away_score" | "overtime" | "kickoff_et" | "week" | "conference_game">): Game {
    const s = this.state;
    const game: Game = { ...g, id: s.next_game_id++, status: "scheduled", home_score: null, away_score: null, overtime: false, kickoff_et: null, week: 0, conference_game: false };
    s.games.push(game);
    s.games.sort(gameOrder);
    rep.new_games.push(game);
    const evId = `${s.year}:game_day:${game.date}`;
    const ev = s.events.find((e) => e.id === evId);
    if (ev) ev.label = `${s.games.filter((x) => x.date === game.date).length} games`;
    else {
      const e: CalEvent = { id: evId, date: game.date, end_date: null, type: "game_day", scope: "league", label: "1 game", status: "upcoming", needs_you: false, approx: false, active: true };
      s.events.push(e);
      s.events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
      rep.new_events.push(e);
    }
    return game;
  }

  // ---- postseason ----------------------------------------------------------------------------
  private eventDate(type: CalEvent["type"]): ISODate {
    return this.state.events.find((e) => e.type === type)!.date;
  }
  private has(kind: GameKind): Game[] { return this.state.games.filter((g) => g.kind === kind); }

  private buildPostseason(rep: DayReport): void {
    const s = this.state;
    // Conference title games, once every conference game before championship weekend is final
    // (Army-Navy, a conference game played after it, does not hold them up, as in real life).
    const champDay = this.eventDate("conf_championships");
    if (s.settings.conf_title_games && this.has("conf_champ").length === 0 && s.date < champDay &&
        s.games.every((g) => g.kind !== "regular" || !g.conference_game || g.date >= champDay || g.status === "final")) {
      this.buildConfTitles(rep);
    }
    const titles = this.has("conf_champ");
    if (Object.keys(s.conf_champs).length === 0 && s.date > champDay && titles.every((g) => g.status === "final")) {
      this.crownChampions(titles, rep);
    }
    // Next playoff round once the current one is final.
    const p = s.playoff;
    if (p && p.round > 0 && p.round < p.rounds) {
      const cur = s.games.filter((g) => g.kind === "playoff" && g.round === p.round);
      if (cur.length && cur.every((g) => g.status === "final")) {
        if (p.alive == null) {
          // After the opening round: byes keep their slots, winners take their higher seed's slot.
          const winners = new Map(cur.map((g) => [g.home_seed!, this.winner(g)]));
          p.alive = bracketOrder(slotCount(p.field.length, s.settings.playoff.byes)).map((seed) => winners.get(seed) ?? p.field[seed - 1]);
        } else {
          p.alive = cur.sort((a, b) => a.id - b.id).map((g) => this.winner(g));
        }
        this.buildRound(rep);
      }
    }
  }

  private confStandings(conf: string, teams: Team[]) {
    const recs = records(this.state.games.filter((g) => g.kind === "regular"), this.teams);
    return teams.map((t) => ({ t, r: recs.get(t.id)! }))
      .sort((x, y) => {
        const px = x.r.cw / Math.max(1, x.r.cw + x.r.cl), py = y.r.cw / Math.max(1, y.r.cw + y.r.cl);
        if (px !== py) return py - px;
        const h2h = this.state.games.find((g) => g.status === "final" && g.kind === "regular" &&
          ((g.home_id === x.t.id && g.away_id === y.t.id) || (g.home_id === y.t.id && g.away_id === x.t.id)));
        if (h2h) {
          const xWon = (h2h.home_id === x.t.id) === (h2h.home_score! > h2h.away_score!);
          return xWon ? -1 : 1;
        }
        return (this.state.power[y.t.id] ?? 0) - (this.state.power[x.t.id] ?? 0) || x.t.id - y.t.id;
      });
  }

  private buildConfTitles(rep: DayReport): void {
    const byConf = new Map<string, Team[]>();
    for (const t of this.teams) if (t.level === "fbs" && t.conference !== INDEPENDENT) byConf.set(t.conference, [...(byConf.get(t.conference) || []), t]);
    const date = this.eventDate("conf_championships");
    for (const [conf, teams] of [...byConf].sort()) {
      let a: Team, b: Team;
      const divs = [...new Set(teams.map((t) => t.division).filter(Boolean))] as string[];
      if (divs.length === 2) {
        [a, b] = divs.map((d) => this.confStandings(conf, teams.filter((t) => t.division === d))[0].t);
        const order = this.confStandings(conf, [a, b]);
        [a, b] = [order[0].t, order[1].t];
      } else {
        const st = this.confStandings(conf, teams);
        [a, b] = [st[0].t, st[1].t];
      }
      this.addGame(rep, { kind: "conf_champ", date, home_id: a.id, away_id: b.id, neutral: P4.has(conf), venue: null, label: `${conf} Championship` });
    }
  }

  private crownChampions(titles: Game[], rep: DayReport): void {
    const s = this.state;
    for (const g of titles) s.conf_champs[this.team(g.home_id).conference] = this.winner(g).team_id;
    if (titles.length === 0) {
      const confs = new Set(this.teams.filter((t) => t.level === "fbs" && t.conference !== INDEPENDENT).map((t) => t.conference));
      for (const c of confs) s.conf_champs[c] = this.confStandings(c, this.teams.filter((t) => t.conference === c))[0].t.id;
    }
    for (const [conf, id] of Object.entries(s.conf_champs).sort()) {
      rep.news.push(this.news(s.date, "conf_champ", `${this.team(id).school} wins the ${conf} title`, "", [id]));
    }
  }

  private select(date: ISODate, rep: DayReport): void {
    const s = this.state;
    const p = s.settings.playoff;
    if (Object.keys(s.conf_champs).length === 0) this.crownChampions(this.has("conf_champ").filter((g) => g.status === "final"), rep);
    if (p.format === "bowls") {
      rep.news.push(this.news(date, "selection", "Bowl pairings are announced", "Bowl games are simulated from M1; the final AP poll crowns the champion.", []));
      return;
    }
    if (p.format === "bcs") {
      const st = this.bcs(date);
      rep.polls.push(st);
      const [a, b] = st.ranks;
      s.playoff = { format: "bcs", field: [{ seed: 1, team_id: a.team_id }, { seed: 2, team_id: b.team_id }], rounds: 1, round: 0, alive: null };
      s.playoff.alive = s.playoff.field;
      rep.news.push(this.news(date, "selection", `${this.team(a.team_id).school} and ${this.team(b.team_id).school} will play for the BCS title`, this.top(st, 10), [a.team_id, b.team_id]));
      this.buildRound(rep);
      return;
    }
    const ranking = this.poll("cfp", date, COMMITTEE_PANEL);
    rep.polls.push(ranking);
    const champs = new Set(Object.values(s.conf_champs));
    const auto = ranking.ranks.filter((r) => champs.has(r.team_id)).slice(0, p.auto_bids).map((r) => r.team_id);
    const field = [...auto];
    for (const r of ranking.ranks) { if (field.length >= p.teams) break; if (!field.includes(r.team_id)) field.push(r.team_id); }
    // Straight seeding by the committee's ranking (the 2025 rule), with the guaranteed champions kept in.
    const order = new Map(ranking.ranks.map((r, i) => [r.team_id, i]));
    field.sort((a, b) => order.get(a)! - order.get(b)!);
    const seeded = field.map((team_id, i) => ({ seed: i + 1, team_id }));
    const rounds = (p.byes > 0 ? 1 : 0) + mainRounds(p.teams, p.byes);
    s.playoff = { format: "playoff", field: seeded, rounds, round: 0, alive: p.byes > 0 ? null : bracketOrder(p.teams).map((x) => seeded[x - 1]) };
    rep.news.push(this.news(date, "selection", `The ${p.teams}-team playoff field is set; ${this.team(field[0]).school} is the No. 1 seed`,
      seeded.map((f) => `${f.seed}. ${this.team(f.team_id).school}`).join(", "), field));
    this.buildRound(rep);
  }

  private winner(g: Game): Seeded {
    return g.home_score! > g.away_score! ? { seed: g.home_seed!, team_id: g.home_id } : { seed: g.away_seed!, team_id: g.away_id };
  }

  /** Build the next playoff round from `playoff.alive` (or the opening round when there are byes). */
  private buildRound(rep: DayReport): void {
    const s = this.state, p = s.playoff!;
    p.round++;
    const fromEnd = p.rounds - p.round;
    const ev = s.events.find((e) => (e.type === "playoff_round" || e.type === "title_game") && e.rounds_from_end === fromEnd)!;
    const pairs: [Seeded, Seeded][] = [];
    if (p.alive == null) {
      for (const [hi, lo] of openingPairs(p.field.length, s.settings.playoff.byes)) pairs.push([p.field[hi - 1], p.field[lo - 1]]);
    } else {
      for (let i = 0; i < p.alive.length; i += 2) pairs.push([p.alive[i], p.alive[i + 1]]);
    }
    const BOWLS: Record<number, string[]> = { 2: ["Rose Bowl", "Sugar Bowl", "Orange Bowl", "Cotton Bowl"], 1: ["Fiesta Bowl", "Peach Bowl"] };
    const name = p.format === "bcs" ? "BCS National Championship" : fromEnd === 0 ? "National Championship" : ev.label.replace(/s$/, "");
    pairs.forEach(([x, y], i) => {
      const [hi, lo] = x.seed < y.seed ? [x, y] : [y, x];
      const bowl = BOWLS[fromEnd]?.[i] ?? null;
      const neutral = fromEnd <= 2 || !s.settings.playoff.campus_first_round;
      this.addGame(rep, {
        kind: "playoff", date: i < pairs.length / 2 || !ev.end_date ? ev.date : ev.end_date, home_id: hi.team_id, away_id: lo.team_id,
        neutral, venue: bowl, label: bowl ? `${name} (${bowl})` : name, home_seed: hi.seed, away_seed: lo.seed, round: p.round, title: fromEnd === 0,
      });
    });
  }
}
