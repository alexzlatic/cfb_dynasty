import { GameSim, Rng, type TeamRatings } from "@cfb/engine";
import { addDays, type ISODate } from "./dates.ts";
import { seasonEvents } from "./calendar.ts";
import { mixSeed } from "./hash.ts";
import { rankTeams, records, updatePower } from "./ranking.ts";
import {
  DEFAULT_SETTINGS, type CalEvent, type Game, type GameDetail, type GameKind, type NewsItem, type Poll, type SeedBundle,
  type Settings, type Team,
} from "./types.ts";

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
  conf_champs: Record<string, number>;
  cfp_field: { seed: number; team_id: number }[] | null;
  champion: number | null;
  next_game_id: number;
}

export interface DayReport {
  date: ISODate;
  fired: CalEvent[];
  played: Game[];
  details: GameDetail[];
  new_games: Game[];
  new_events: CalEvent[];
  polls: Poll[];
  news: NewsItem[];
  stop: string | null;
}

const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const INDEPENDENT = "FBS Independents";

export class Season {
  readonly teams: Team[];
  readonly teamById: Map<number, Team>;
  private ratings: Map<number, TeamRatings>;

  constructor(public state: SeasonState, seed: SeedBundle) {
    this.teams = seed.teams;
    this.teamById = new Map(seed.teams.map((t) => [t.id, t]));
    this.ratings = new Map(Object.entries(seed.ratings).map(([k, v]) => [Number(k), v.ratings]));
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
    const state: SeasonState = {
      year: seed.season, seed: opts.seed >>> 0, date: seed.start_date, settings: { ...DEFAULT_SETTINGS, ...opts.settings },
      user_team_id: opts.user_team_id ?? null, games, events: seasonEvents(seed.season, seed.start_date, seed.schedule),
      polls: [], news: [], power, conf_champs: {}, cfp_field: null, champion: null, next_game_id: 9_000_001,
    };
    return new Season(state, seed);
  }

  get done(): boolean { return this.state.events.some((e) => e.type === "season_end" && e.status === "done"); }
  team(id: number): Team { return this.teamById.get(id)!; }
  latestPoll(type: "ap" | "cfp" = "ap"): Poll | null {
    for (let i = this.state.polls.length - 1; i >= 0; i--) if (this.state.polls[i].type === type) return this.state.polls[i];
    return null;
  }
  rankOf(teamId: number, poll = this.latestPoll()): number | null {
    if (!poll) return null;
    const i = poll.ranks.findIndex((r) => r.team_id === teamId);
    return i >= 0 && i < 25 ? i + 1 : null;
  }

  /** Run today in the fixed order (morning events, actions, day processing, evening games), then move to tomorrow. */
  advanceDay(): DayReport {
    const s = this.state;
    const today = s.date;
    const rep: DayReport = { date: today, fired: [], played: [], details: [], new_games: [], new_events: [], polls: [], news: [], stop: null };

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
  private fire(e: CalEvent, rep: DayReport): void {
    const s = this.state;
    switch (e.type) {
      case "dynasty_start":
      case "ap_poll": {
        const poll: Poll = { date: e.date, type: "ap", ranks: rankTeams(this.teams, s.games, s.power, new Set(Object.values(s.conf_champs))) };
        const prev = this.latestPoll("ap");
        s.polls.push(poll);
        rep.polls.push(poll);
        const top = this.team(poll.ranks[0].team_id);
        const prevTop = prev?.ranks[0].team_id;
        rep.news.push(this.news(e.date, "poll", prev ? (prevTop === top.id ? `${top.school} stays No. 1 in the AP poll` : `${top.school} takes over No. 1 in the AP poll`)
          : `${top.school} opens the season No. 1 in the AP poll`, poll.ranks.slice(0, 5).map((r, i) => `${i + 1}. ${this.team(r.team_id).school}`).join(", "), [top.id]));
        break;
      }
      case "cfp_rankings": {
        const poll: Poll = { date: e.date, type: "cfp", ranks: rankTeams(this.teams, s.games, s.power, new Set(Object.values(s.conf_champs))) };
        s.polls.push(poll);
        rep.polls.push(poll);
        rep.news.push(this.news(e.date, "cfp", `CFP rankings: ${this.team(poll.ranks[0].team_id).school} is No. 1`,
          poll.ranks.slice(0, 12).map((r, i) => `${i + 1}. ${this.team(r.team_id).school}`).join(", "), [poll.ranks[0].team_id]));
        break;
      }
      case "cfp_selection": this.selectPlayoff(e.date, rep); break;
      case "season_end": {
        if (s.champion != null) {
          const poll: Poll = { date: e.date, type: "ap", ranks: rankTeams(this.teams, s.games, s.power, new Set(Object.values(s.conf_champs))) };
          const i = poll.ranks.findIndex((r) => r.team_id === s.champion);
          if (i > 0) poll.ranks.unshift(...poll.ranks.splice(i, 1));
          s.polls.push(poll);
          rep.polls.push(poll);
        }
        break;
      }
      default: break;
    }
  }

  // ---- games ---------------------------------------------------------------------------------
  private keepPlays(g: Game): boolean {
    const s = this.state;
    const mine = s.user_team_id != null && (g.home_id === s.user_team_id || g.away_id === s.user_team_id);
    if (s.settings.keep_pbp === "all" || mine) return true;
    if (s.settings.keep_pbp === "mine") return false;
    return g.kind !== "regular" || (this.rankOf(g.home_id) != null && this.rankOf(g.away_id) != null);
  }

  private play(g: Game, rep: DayReport): void {
    const s = this.state;
    const home = this.ratings.get(g.home_id), away = this.ratings.get(g.away_id);
    if (!home || !away) throw new Error(`no ratings for game ${g.id}`);
    const rankH = this.rankOf(g.home_id), rankA = this.rankOf(g.away_id);
    const sim = new GameSim(home, away, { rng: new Rng(mixSeed(s.seed, s.year, g.id)), neutral: g.neutral, record: true }).play();
    const r = sim.result();
    g.status = "final";
    g.home_score = r.home.score;
    g.away_score = r.away.score;
    g.overtime = r.overtime;
    rep.played.push(g);
    rep.details.push({
      game_id: g.id, home_box: r.home.box, away_box: r.away.box, home_players: r.home.players, away_players: r.away.players,
      home_q: r.home.qscores, away_q: r.away.qscores, drives: r.drives ?? [], plays: this.keepPlays(g) ? r.plays ?? null : null,
    });
    updatePower(s.power, g, s.settings.home_field_points);
    this.recap(g, rankH, rankA, rep);
    if (g.kind === "cfp_final") {
      s.champion = g.home_score! > g.away_score! ? g.home_id : g.away_id;
      const c = this.team(s.champion);
      rep.news.push(this.news(g.date, "champion", `${c.school} wins the national championship`, this.scoreLine(g), [c.id]));
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
  private eventEnd(type: CalEvent["type"]): ISODate {
    const e = this.state.events.find((x) => x.type === type)!;
    return e.end_date ?? e.date;
  }
  private has(kind: GameKind): Game[] { return this.state.games.filter((g) => g.kind === kind); }

  private buildPostseason(rep: DayReport): void {
    const s = this.state;
    // Conference title games, once every conference game is final.
    // Conference games after championship weekend (Army-Navy) do not hold up the title games, as in real life.
    const champDay = this.eventDate("conf_championships");
    if (s.settings.conf_title_games && this.has("conf_champ").length === 0 && s.date < champDay &&
        s.games.every((g) => g.kind !== "regular" || !g.conference_game || g.date >= champDay || g.status === "final")) {
      this.buildConfTitles(rep);
    }
    // Conference champions (no title game: best conference record).
    const titles = this.has("conf_champ");
    if (Object.keys(s.conf_champs).length === 0 && s.date >= this.eventDate("conf_championships") &&
        titles.every((g) => g.status === "final") && (titles.length > 0 || !s.settings.conf_title_games)) {
      this.crownChampions(titles, rep);
    }
    // Playoff rounds.
    const r1 = this.has("cfp_r1"), qf = this.has("cfp_qf"), sf = this.has("cfp_sf");
    if (s.cfp_field && r1.length && r1.every((g) => g.status === "final") && qf.length === 0) this.buildQuarterfinals(r1, rep);
    if (qf.length && qf.every((g) => g.status === "final") && sf.length === 0) this.buildSemifinals(qf, rep);
    if (sf.length && sf.every((g) => g.status === "final") && this.has("cfp_final").length === 0) {
      const [a, b] = sf.map((g) => this.winnerSeed(g));
      const [hi, lo] = a.seed < b.seed ? [a, b] : [b, a];
      this.addGame(rep, { kind: "cfp_final", date: this.eventDate("cfp_final"), home_id: hi.team_id, away_id: lo.team_id, neutral: true, venue: null, label: "CFP National Championship", home_seed: hi.seed, away_seed: lo.seed });
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
    for (const g of titles) s.conf_champs[this.team(g.home_id).conference] = g.home_score! > g.away_score! ? g.home_id : g.away_id;
    if (titles.length === 0) {
      const confs = new Set(this.teams.filter((t) => t.level === "fbs" && t.conference !== INDEPENDENT).map((t) => t.conference));
      for (const c of confs) s.conf_champs[c] = this.confStandings(c, this.teams.filter((t) => t.conference === c))[0].t.id;
    }
    for (const [conf, id] of Object.entries(s.conf_champs).sort()) {
      rep.news.push(this.news(s.date, "conf_champ", `${this.team(id).school} wins the ${conf} title`, "", [id]));
    }
  }

  private selectPlayoff(date: ISODate, rep: DayReport): void {
    const s = this.state;
    if (Object.keys(s.conf_champs).length === 0) this.crownChampions(this.has("conf_champ").filter((g) => g.status === "final"), rep);
    const champs = new Set(Object.values(s.conf_champs));
    const ranks = rankTeams(this.teams, s.games, s.power, champs);
    const poll: Poll = { date, type: "cfp", ranks };
    s.polls.push(poll);
    rep.polls.push(poll);
    const n = s.settings.cfp_teams;
    const auto = ranks.filter((r) => champs.has(r.team_id)).slice(0, s.settings.cfp_auto_bids).map((r) => r.team_id);
    const field = [...auto];
    for (const r of ranks) { if (field.length >= n) break; if (!field.includes(r.team_id)) field.push(r.team_id); }
    // Straight seeding by ranking (the 2025 rule), with the guaranteed champions kept in the field.
    const order = new Map(ranks.map((r, i) => [r.team_id, i]));
    field.sort((a, b) => order.get(a)! - order.get(b)!);
    s.cfp_field = field.map((team_id, i) => ({ seed: i + 1, team_id }));
    rep.news.push(this.news(date, "cfp_field", `The ${n}-team playoff field is set; ${this.team(field[0]).school} is the No. 1 seed`,
      s.cfp_field.map((f) => `${f.seed}. ${this.team(f.team_id).school}`).join(", "), field));
    if (n !== 12 || s.settings.cfp_byes !== 4) throw new Error("M0 builds the 12-team bracket with 4 byes only");
    const start = this.eventDate("cfp_first_round"), end = this.eventEnd("cfp_first_round");
    const pairs: [number, number][] = [[8, 9], [5, 12], [7, 10], [6, 11]];
    pairs.forEach(([hi, lo], i) => {
      const H = s.cfp_field![hi - 1], A = s.cfp_field![lo - 1];
      this.addGame(rep, { kind: "cfp_r1", date: i < 2 ? start : end, home_id: H.team_id, away_id: A.team_id, neutral: false, venue: null, label: "CFP First Round", home_seed: hi, away_seed: lo });
    });
  }

  private winnerSeed(g: Game): { seed: number; team_id: number } {
    return g.home_score! > g.away_score! ? { seed: g.home_seed!, team_id: g.home_id } : { seed: g.away_seed!, team_id: g.away_id };
  }

  private buildQuarterfinals(r1: Game[], rep: DayReport): void {
    const s = this.state;
    const w = new Map<string, { seed: number; team_id: number }>();
    for (const g of r1) w.set(`${g.home_seed}-${g.away_seed}`, this.winnerSeed(g));
    const start = this.eventDate("cfp_quarterfinals"), end = this.eventEnd("cfp_quarterfinals");
    const slots: [number, string, string][] = [[1, "8-9", "Rose Bowl"], [2, "7-10", "Sugar Bowl"], [3, "6-11", "Orange Bowl"], [4, "5-12", "Cotton Bowl"]];
    slots.forEach(([top, key, bowl], i) => {
      const T = s.cfp_field![top - 1], O = w.get(key)!;
      this.addGame(rep, { kind: "cfp_qf", date: i < 2 ? start : end, home_id: T.team_id, away_id: O.team_id, neutral: true, venue: bowl, label: `CFP Quarterfinal (${bowl})`, home_seed: top, away_seed: O.seed });
    });
  }

  private buildSemifinals(qf: Game[], rep: DayReport): void {
    const bySlot = new Map(qf.map((g) => [g.home_seed!, this.winnerSeed(g)]));
    const start = this.eventDate("cfp_semifinals"), end = this.eventEnd("cfp_semifinals");
    const pairs: [number, number, string][] = [[1, 4, "Fiesta Bowl"], [2, 3, "Peach Bowl"]];
    pairs.forEach(([x, y, bowl], i) => {
      const a = bySlot.get(x)!, b = bySlot.get(y)!;
      const [hi, lo] = a.seed < b.seed ? [a, b] : [b, a];
      this.addGame(rep, { kind: "cfp_sf", date: i === 0 ? start : end, home_id: hi.team_id, away_id: lo.team_id, neutral: true, venue: bowl, label: `CFP Semifinal (${bowl})`, home_seed: hi.seed, away_seed: lo.seed });
    });
  }
}
