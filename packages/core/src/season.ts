import { GameSim, Rng, type TeamRatings } from "@cfb/engine";
import { compileTeam, lineup, type DepthChart } from "./compiler.ts";
import { DEFENSE_FIELD, GameDay, OFFENSE_FIELD, type SideSetup } from "./gameday.ts";
import { LAB_SLOTS, applyHidden, hiddenPlayer, hiddenTeam, progress, unitOf, type HiddenTeam, type LabArea, type LabPlan, type TeamContext, type Unit } from "./hidden.ts";
import { Caller, type UserCall } from "./calls.ts";
import { DEFAULT_PLAN, DEFAULT_PRACTICE, PRACTICE_DAYS, PRACTICE_INJURY, addPractice, emptyPrep, freshness, planRatings, prepEdge, type GamePlan, type PracticePlan, type Prep } from "./plan.ts";
import { POSITIONS, playerName, type RatedPlayer } from "./players.ts";
import { AA_SLOTS, DEF_POS, OFF_POS, addLine, defScore, kickScore, lineText, offScore, type Award, type PlayerSeason, type StatLine, type WeekLine } from "./awards.ts";
import { expectations, meetingText, newCareer, securityTrail, winChance, type Career, type CareerStart, type Meeting } from "./career.ts";
import { addDays, daysBetween, weekday, type ISODate } from "./dates.ts";
import { postseasonEvents, seasonEvents, sortEvents } from "./calendar.ts";
import { mixSeed } from "./hash.ts";
import { activeContract, aiContracts, eligibilityLeft, footballPool, playerValue, type Contract } from "./money.ts";
import { AP_PANEL, COMMITTEE_PANEL, bcsStandings, runPoll, type PanelMemory, type PanelSpec } from "./polls.ts";
import { bracketOrder, mainRounds, openingPairs, slotCount, validatePlayoff } from "./playoff.ts";
import { BOWLS, NY6, bowlDate, playoffBowls, selectBowls, type BowlTeam } from "./bowls.ts";
import { records, updatePower } from "./ranking.ts";
import { generateWriters, starLine, writeStory, type Writer } from "./writers.ts";
import {
  DEFAULT_SETTINGS, type Ballot, type CalEvent, type Coach, type Game, type GameDetail, type GameKind, type Injury, type NewsItem, type Poll, type SeedBundle,
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
  /** The user's changes to their lineup during live games, by game id. */
  subs?: Record<number, GameSub[]>;
  /** The user's game plan and weekly practice plan (absent = the defaults). */
  game_plan?: GamePlan;
  practice?: PracticePlan;
  /** Practice banked toward the user's next game. */
  prep?: Prep | null;
  /** Season stats by player id, the best game each player has had since the last players of the week, and every award given. */
  player_stats?: Record<number, PlayerSeason>;
  award_week?: Record<number, WeekLine>;
  awards?: Award[];
  /** Your players being redshirted: each can play in up to four games and then sits. */
  redshirts?: number[];
  /** Your career: who you are, your athletic director, expectations and meetings (null without a team). */
  career?: Career | null;
  /** What each team's camps were built on (new coach, new QB, continuity, coach quality); see hidden.ts. */
  hidden_ctx?: Record<number, TeamContext>;
  /** How each team's season is going against expectations (moves chemistry a little). */
  morale?: Record<number, number>;
  /** Your staff's individual development plans, by player id. */
  lab?: Record<number, LabPlan>;
  /** Revenue-share contracts by player id, and each school's football revenue-share budget this year. */
  contracts?: Record<number, Contract>;
  pools?: Record<number, number>;
}

/** Games a redshirted player may play in and keep his redshirt. */
export const REDSHIRT_GAMES = 4;

/** A depth-chart change during a live game, made before the user's `at`-th decision. */
export interface GameSub { at: number; depth: DepthChart }

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
    state.player_stats ??= {};
    state.award_week ??= {};
    state.awards ??= [];
    state.redshirts ??= [];
    state.morale ??= {};
    state.lab ??= {};
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

  get gamePlan(): GamePlan { return this.state.game_plan ?? DEFAULT_PLAN; }
  get practicePlan(): PracticePlan { return this.state.practice ?? DEFAULT_PRACTICE; }
  setGamePlan(plan: GamePlan): void { this.state.game_plan = plan; }
  setPractice(plan: PracticePlan): void { this.state.practice = plan; }

  /** The user's next game that is not over. */
  nextUserGame(): Game | null {
    const s = this.state, me = s.user_team_id;
    if (me == null) return null;
    return s.games.find((g) => g.status !== "final" && g.date >= s.date && (g.home_id === me || g.away_id === me)) ?? null;
  }

  /** Practice banked for a game, if it is the one the banked practice was for. */
  prepFor(gameId: number): Prep | null {
    const p = this.state.prep;
    return p && p.for_game === gameId ? p : null;
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

  private sideSetup(teamId: number, gameId?: number): SideSetup | null {
    let base = this.ratings.get(teamId);
    const tp = this.seed.players?.[teamId];
    if (!base || !tp) return null;
    const mine = teamId === this.state.user_team_id;
    if (mine) base = planRatings(base, this.gamePlan);
    const fresh = mine && gameId != null ? freshness(this.prepFor(gameId)) : 1;
    const out = new Set(this.injured(teamId).map((i) => i.pid));
    if (mine) for (const pid of this.redshirtsSitting()) out.add(pid);
    const h = this.hidden(teamId);
    return { team_id: teamId, base, players: tp, depth: this.depthChart(teamId), out, fresh, hidden: h ? { fit: h.fit, chem: h.chem, dev: h.dev } : undefined };
  }

  /** A new league on the seed's start date. */
  static create(seed: SeedBundle, opts: { seed: number; user_team_id?: number | null; settings?: Partial<Settings>; career?: CareerStart }): Season {
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
    const season = new Season(state, seed);
    season.startHidden(seed.coaches ?? []);
    season.startMoney();
    season.startCareer(opts.career ?? { mode: "real" }, seed.coaches ?? []);
    return season;
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
    // 3. Day processing: build postseason games whose inputs are now known; your team practices.
    this.buildPostseason(rep);
    this.practiceDay(today, rep);
    this.adMeetings(today, rep);
    // 4. Evening: today's games, then standings, power and news.
    for (const g of s.games) {
      if (g.date !== today || g.status === "final") continue;
      this.play(g, rep);
    }
    if (rep.fired.some((e) => e.type === "season_end")) rep.stop = "season_end";
    s.date = addDays(today, 1);
    return rep;
  }

  // ---- career --------------------------------------------------------------------------------
  /** Start (or restart, after changing teams) your career at your team. */
  startCareer(start: CareerStart, coaches: Coach[]): void {
    const s = this.state, me = s.user_team_id;
    if (me == null) { s.career = null; return; }
    const coach = coaches.find((c) => c.team_id === me && c.role === "HC");
    s.career = newCareer(start, me, coach, expectations(me, this.teams, s.games, s.preseason_power, s.settings.home_field_points), s.seed);
  }

  /** Job security after each of your games so far. */
  securityTrail() {
    const s = this.state;
    return s.career ? securityTrail(s.career, s.games, s.preseason_power, s.settings.home_field_points) : [];
  }
  security(): number | null {
    const c = this.state.career;
    if (!c) return null;
    const t = this.securityTrail();
    return t.length ? t[t.length - 1].security : c.start;
  }

  private adMeetings(today: ISODate, rep: DayReport): void {
    const c = this.state.career;
    if (!c) return;
    const has = (k: Meeting["kind"]) => c.meetings.some((m) => m.kind === k);
    const reg = this.state.games.filter((g) => g.kind === "regular" && (g.home_id === c.team_id || g.away_id === c.team_id));
    const played = reg.filter((g) => g.status === "final").length;
    if (!has("preseason") && !has("midseason") && played === 0) { this.meet("preseason", today, rep); this.staffReport("camp", today, rep); }
    else if (!has("midseason") && !has("end") && played >= Math.ceil(reg.length / 2)) { this.meet("midseason", today, rep); this.staffReport("midseason", today, rep); }
  }

  private meet(kind: Meeting["kind"], date: ISODate, rep: DayReport): void {
    const s = this.state, c = s.career;
    if (!c || c.meetings.some((m) => m.kind === kind)) return;
    const sec = this.security()!;
    const r = records(s.games, this.teams).get(c.team_id) ?? { w: 0, l: 0 };
    const text = meetingText(c, kind, sec, r, this.team(c.team_id).school);
    c.meetings.push({ kind, date, security: sec, text });
    const ad = `${c.ad.first} ${c.ad.last}`;
    const head = kind === "preseason" ? `Athletic director ${ad} sets the bar for ${s.year}` : kind === "midseason" ? `Midseason meeting with athletic director ${ad}` : `End-of-season meeting with athletic director ${ad}`;
    rep.news.push(this.news(date, "ad", head, text, [c.team_id]));
  }

  // ---- money -------------------------------------------------------------------------------------
  /** Every school's football revenue-share budget, and the contracts its athletic department has signed. */
  startMoney(): void {
    const s = this.state;
    s.pools = {};
    s.contracts = {};
    for (const t of this.teams) {
      const pool = footballPool(t, s.year);
      if (!pool) continue;
      s.pools[t.id] = pool;
      Object.assign(s.contracts, aiContracts(this.roster(t.id), pool, s.year));
    }
  }

  /** A team's revenue-share payroll this year. */
  payroll(teamId: number): number {
    const s = this.state;
    return this.roster(teamId).reduce((a, p) => a + (activeContract(s.contracts?.[p.id], s.year)?.amount ?? 0), 0);
  }

  /**
   * Sign one of your players to a revenue-share contract (amount 0 ends his deal). Your payroll has to
   * stay under football's budget, and a deal can't run past his eligibility.
   */
  setContract(pid: number, amount: number, years: number): void {
    const s = this.state, me = s.user_team_id;
    const p = this.playerById.get(pid);
    if (me == null || !p || p.team_id !== me) throw new Error("you can only sign your own players");
    const contracts = { ...s.contracts };
    if (amount <= 0) { delete contracts[pid]; s.contracts = contracts; return; }
    if (years > eligibilityLeft(p)) throw new Error(`${playerName(p)} has ${eligibilityLeft(p)} season(s) of eligibility left`);
    const room = (s.pools?.[me] ?? 0) - this.payroll(me) + (activeContract(s.contracts?.[pid], s.year)?.amount ?? 0);
    if (amount > room) throw new Error(`that is over your budget: $${Math.round(room / 1000)}K left`);
    contracts[pid] = { amount, years, start: s.year };
    s.contracts = contracts;
  }

  /** A player's market value this year. */
  value(pid: number): number {
    const p = this.playerById.get(pid);
    return p ? playerValue(p) : 0;
  }

  // ---- true vs scouted ratings ------------------------------------------------------------------
  /** Record what each team's camps were built on, from its coaches and opening lineup. */
  startHidden(coaches: Coach[]): void {
    const s = this.state, ctx: Record<number, TeamContext> = {};
    const cut = `${s.year - 1}-07-01`;
    for (const t of this.teams) {
      const hc = coaches.find((c) => c.team_id === t.id && c.role === "HC");
      const w = hc?.career.reduce((a, c) => a + c.wins, 0) ?? 0, l = hc?.career.reduce((a, c) => a + c.losses, 0) ?? 0;
      const new_coach = !!hc?.hire_date && hc.hire_date >= cut;
      const st = this.openingStarters(t.id);
      const qb = st.off.find((p) => p.pos === "QB");
      const new_qb = !qb || qb.basis !== "stats" || qb.sample < 150;
      const all = [...st.off, ...st.def];
      const returning = all.length ? all.filter((p) => p.basis === "stats").length / all.length : 0;
      ctx[t.id] = { new_coach, new_qb, continuity: !new_coach && !new_qb && returning >= 0.6,
        coach: w + l >= 24 ? Math.round(Math.max(-2, Math.min(2, (w / (w + l) - 0.5) / 0.15)) * 100) / 100 : 0 };
    }
    // Coach quality is relative to the rest of the country, so the scouted view stays unbiased.
    const ids = Object.keys(ctx).map(Number), avg = ids.reduce((a, id) => a + ctx[id].coach, 0) / Math.max(1, ids.length);
    for (const id of ids) ctx[id].coach = Math.round((ctx[id].coach - avg) * 100) / 100;
    s.hidden_ctx = ctx;
  }

  teamContext(teamId: number): TeamContext {
    return this.state.hidden_ctx?.[teamId] ?? { new_coach: false, new_qb: false, continuity: false, coach: 0 };
  }

  /** The lineup camp was built around: the opening depth chart's starters, by unit. */
  private openingStarters(teamId: number): Record<Unit, RatedPlayer[]> {
    const tp = this.seed.players?.[teamId];
    if (!tp) return { off: [], def: [] };
    const l = lineup(tp.depth, this.playerById).slot;
    const pick = (slots: readonly string[]) => slots.map((k) => l[k as keyof typeof l]).filter((p): p is RatedPlayer => !!p);
    return { off: pick(OFFENSE_FIELD), def: pick(DEFENSE_FIELD) };
  }

  private hiddenCache = new Map<number, { key: string; h: HiddenTeam }>();
  /** A team's hidden scores today (or on `date`); null for a team without rated players. */
  hidden(teamId: number, date = this.state.date): HiddenTeam | null {
    const s = this.state;
    const roster = this.roster(teamId);
    // FCS rosters are generated filler, with nothing true for scouts to miss; they play their ratings.
    if (!roster.length || !s.hidden_ctx || this.teamById.get(teamId)?.level === "fcs") return null;
    const lab = teamId === s.user_team_id ? s.lab : undefined;
    const key = `${date}|${s.morale?.[teamId] ?? 0}|${lab ? JSON.stringify(lab) : ""}`;
    const c = this.hiddenCache.get(teamId);
    if (c && c.key === key) return c.h;
    const h = hiddenTeam({ seed: s.seed, year: s.year, team_id: teamId, date, ctx: this.teamContext(teamId), roster,
      starters: this.openingStarters(teamId), morale: s.morale?.[teamId], lab });
    this.hiddenCache.set(teamId, { key, h });
    return h;
  }

  /** Hidden points by unit with the opening starters on the field. */
  hiddenStrength(teamId: number, date = this.state.date): { off: number; def: number; h: HiddenTeam } | null {
    const h = this.hidden(teamId, date);
    if (!h) return null;
    const st = this.openingStarters(teamId);
    const dev = (u: Unit) => st[u].reduce((a, p) => a + (h.dev.get(p.id) ?? 0), 0);
    return { off: h.fit.off + h.chem.off + dev("off"), def: h.fit.def + h.chem.def + dev("def"), h };
  }

  /** Winning beyond expectations lifts a locker room a little; losing more than expected wears on it. */
  private updateMorale(g: Game): void {
    const s = this.state;
    const p = winChance((s.power[g.home_id] ?? 0) - (s.power[g.away_id] ?? 0) + (g.neutral ? 0 : s.settings.home_field_points));
    const homeWon = g.home_score! > g.away_score! ? 1 : 0;
    for (const [id, d] of [[g.home_id, homeWon - p], [g.away_id, p - homeWon]] as const) {
      s.morale![id] = Math.round(Math.max(-1.5, Math.min(1.5, (s.morale![id] ?? 0) * 0.9 + 0.3 * d)) * 100) / 100 + 0; // + 0: no -0, which a save turns into 0
    }
  }

  /** Put a player on an individual development plan (or take him off with null). */
  setLab(pid: number, area: LabArea | null): void {
    const s = this.state, me = s.user_team_id;
    const p = this.playerById.get(pid);
    if (me == null || !p || p.team_id !== me) throw new Error("you can only plan your own players' development");
    const lab = { ...s.lab };
    if (!area) delete lab[pid];
    else {
      if (!lab[pid] && Object.keys(lab).length >= LAB_SLOTS) throw new Error(`your staff can run ${LAB_SLOTS} development plans at once`);
      lab[pid] = { area, from: lab[pid]?.area === area ? lab[pid].from : s.date };
    }
    s.lab = lab;
  }

  /**
   * What your staff believes about your team: the truth blurred by how long they have watched it. In
   * August they have a decent read; by midseason a good one. Never shown for other teams.
   */
  staffView(teamId: number, date = this.state.date) {
    const s = this.state;
    const h = this.hidden(teamId, date);
    if (!h) return null;
    const known = Math.min(0.9, 0.5 + Math.max(0, daysBetween(`${s.year}-08-01`, date)) / 150);
    const week = Math.floor(Math.max(0, daysBetween(`${s.year}-08-01`, date)) / 7);
    const rng = new Rng(mixSeed(s.seed, s.year, teamId, "staff", week));
    const blur = (x: number, sd: number) => Math.round((x + (1 - known) * sd * rng.gauss(0, 1)) * 10) / 10;
    const st = this.openingStarters(teamId);
    const units = Object.fromEntries((["off", "def"] as const).map((u) => {
      const dev = st[u].reduce((a, p) => a + (h.dev.get(p.id) ?? 0), 0);
      return [u, { development: blur(dev, 3), fit: blur(h.fit[u], 2.5), chemistry: blur(h.chem[u], 2.5) }];
    })) as Record<Unit, { development: number; fit: number; chemistry: number }>;
    // Traits read like a scout's grade: to the nearest 5, sharper the longer the staff has had him.
    const trait = (x: number) => Math.round(Math.max(1, Math.min(99, x + (1 - known) * 15 * rng.gauss(0, 1))) / 5) * 5;
    const players = this.roster(teamId).map((p) => {
      const hp = hiddenPlayer(s.seed, s.year, p);
      return { pid: p.id, growth: blur(h.growth.get(p.id) ?? 0, 3), expected: Math.round(hp.expected * progress(s.year, date) * 10) / 10,
        leadership: trait(hp.leadership), adaptability: trait(hp.adaptability) };
    });
    return { known, units, players };
  }

  /** The staff's camp and midseason reports on your team. */
  private staffReport(kind: "camp" | "midseason", date: ISODate, rep: DayReport): void {
    const me = this.state.user_team_id;
    if (me == null) return;
    const v = this.staffView(me, date);
    if (!v) return;
    const name = (pid: number) => { const p = this.playerById.get(pid)!; return `${p.pos} ${playerName(p)}`; };
    const byGrowth = v.players.filter((x) => unitOf(this.playerById.get(x.pid)!.pos)).sort((a, b) => b.growth - a.growth || a.pid - b.pid);
    const up = byGrowth.slice(0, 3).filter((x) => x.growth >= 1.5), down = byGrowth.slice(-2).reverse().filter((x) => x.growth <= -1.5);
    const say = (x: number, good: string, bad: string, mid: string) => (x >= 1.5 ? good : x <= -1.5 ? bad : mid);
    const o = v.units.off, d = v.units.def;
    const lines = [
      up.length ? `Ahead of schedule: ${up.map((x) => `${name(x.pid)} (+${x.growth.toFixed(1)})`).join(", ")}.` : "",
      down.length ? `Behind where we hoped: ${down.map((x) => `${name(x.pid)} (${x.growth.toFixed(1)})`).join(", ")}.` : "",
      `Offense: ${say(o.fit, "the system fits this group", "the system is a struggle for this group", "the fit with the system is fine")}; ${say(o.chemistry, "the locker room is tight", "the chemistry isn't there yet", "chemistry is normal")}.`,
      `Defense: ${say(d.fit, "the scheme fits", "the scheme isn't clicking", "the fit is fine")}; ${say(d.chemistry, "they play for each other", "there's friction", "chemistry is normal")}.`,
    ].filter(Boolean);
    rep.news.push(this.news(date, "staff", kind === "camp" ? "Fall camp report from your staff" : "Midseason report from your staff",
      `${lines.join(" ")} The media hasn't seen any of this yet.`, [me]));
  }

  // ---- stats, awards and redshirts -------------------------------------------------------------
  private names = new Map<number, Map<string, number>>();
  private pidByName(teamId: number, name: string): number | undefined {
    let m = this.names.get(teamId);
    if (!m) {
      m = new Map();
      for (const p of this.roster(teamId)) if (!m.has(playerName(p))) m.set(playerName(p), p.id);
      this.names.set(teamId, m);
    }
    return m.get(name);
  }

  /** Add a game to season stats and to each player's best game of the week. */
  recordStats(g: Game, d: GameDetail, week = true): void {
    const s = this.state;
    const homeWon = g.home_score! > g.away_score!;
    const lines = new Map<number, { team_id: number; line: StatLine }>();
    const get = (pid: number, team: number) => {
      let x = lines.get(pid);
      if (!x) lines.set(pid, (x = { team_id: team, line: {} }));
      return x;
    };
    for (const [team, players] of [[g.home_id, d.home_players], [g.away_id, d.away_players]] as const) {
      for (const [name, l] of Object.entries(players)) {
        const pid = this.pidByName(team, name);
        if (pid != null) addLine(get(pid, team).line, l as StatLine);
      }
    }
    for (const [pid, l] of Object.entries(d.defense ?? {})) {
      const p = this.playerById.get(Number(pid));
      if (p) addLine(get(p.id, p.team_id).line, l);
    }
    const snapped = new Set(Object.keys(d.snaps ?? {}).map(Number));
    for (const pid of snapped) { const p = this.playerById.get(pid); if (p) get(pid, p.team_id); }
    for (const [pid, x] of lines) {
      const ps = (s.player_stats![pid] ??= { team_id: x.team_id, gp: 0 });
      // Kickers and punters are not on the field for scrimmage snaps; a kick counts as a game played.
      if (snapped.has(pid) || !d.snaps || Object.keys(x.line).length) ps.gp++;
      addLine(ps, x.line);
      const v = offScore(x.line) + defScore(x.line);
      if (!week || v <= 0) continue;
      const prev = s.award_week![pid];
      if (!prev || v > offScore(prev.line) + defScore(prev.line)) {
        s.award_week![pid] = { pid, team_id: x.team_id, game_id: g.id, won: x.team_id === g.home_id ? homeWon : !homeWon, line: x.line };
      }
    }
  }

  /** Rebuild season stats from stored box scores (a league saved before stats were kept). */
  rebuildStats(details: GameDetail[]): void {
    const s = this.state;
    s.player_stats = {};
    s.award_week = {};
    const lastPoll = s.events.filter((e) => e.type === "ap_poll" && e.status === "done").map((e) => e.date).sort().pop() ?? "";
    const byId = new Map(s.games.map((g) => [g.id, g]));
    for (const d of [...details].sort((a, b) => a.game_id - b.game_id)) {
      const g = byId.get(d.game_id);
      if (g && g.status === "final") this.recordStats(g, d, g.date >= lastPoll);
    }
  }

  setRedshirt(pid: number, on: boolean): void {
    const s = this.state, me = s.user_team_id;
    const p = this.playerById.get(pid);
    if (me == null || !p || p.team_id !== me) throw new Error("you can only redshirt your own players");
    const list = s.redshirts!.filter((x) => x !== pid);
    if (on) list.push(pid);
    s.redshirts = list;
    this.compiled.delete(me);
  }

  /** Redshirted players who have used their four games and now sit. */
  redshirtsSitting(): number[] {
    const st = this.state.player_stats!;
    return this.state.redshirts!.filter((pid) => (st[pid]?.gp ?? 0) >= REDSHIRT_GAMES);
  }

  private redshirtWarnings(g: Game, snaps: Record<number, number>, rep: DayReport): void {
    const s = this.state;
    for (const pid of s.redshirts!) {
      const gp = s.player_stats![pid]?.gp ?? 0;
      if (!snaps[pid] || gp !== REDSHIRT_GAMES) continue;
      const p = this.playerById.get(pid)!;
      rep.news.push(this.news(g.date, "redshirt", `${playerName(p)} has played in ${REDSHIRT_GAMES} games`,
        `${p.pos} ${playerName(p)} sits from now on to keep his redshirt. A fifth game would use it up: take him off the redshirt list on the depth chart if you want him to play.`, [p.team_id]));
    }
  }

  private fbsPlayer(pid: number, teamId: number): RatedPlayer | null {
    const p = this.playerById.get(pid);
    const t = this.teamById.get(teamId);
    return p && t?.level === "fbs" ? p : null;
  }

  private award(a: Omit<Award, "year" | "name" | "pos">): Award {
    const p = this.playerById.get(a.pid)!;
    const x: Award = { ...a, year: this.state.year, name: playerName(p), pos: p.pos };
    this.state.awards!.push(x);
    return x;
  }

  /** National and conference players of the week, from each player's best game since the last poll. */
  private weeklyAwards(date: ISODate, rep: DayReport): void {
    const s = this.state;
    const week = Object.values(s.award_week!).filter((w) => this.fbsPlayer(w.pid, w.team_id));
    s.award_week = {};
    if (!week.length) return;
    const off = (w: WeekLine) => offScore(w.line) + (w.won ? 3 : 0);
    const def = (w: WeekLine) => defScore(w.line) + (w.won ? 2 : 0);
    const best = (ws: WeekLine[], f: (w: WeekLine) => number, pos: Set<string>) =>
      ws.filter((w) => pos.has(this.playerById.get(w.pid)!.pos)).sort((a, b) => f(b) - f(a) || a.pid - b.pid)[0];
    const o = best(week, off, OFF_POS), d = best(week, def, DEF_POS);
    if (!o || !d) return;
    const ao = this.award({ type: "potw_off", date, pid: o.pid, team_id: o.team_id, line: lineText(o.line) });
    const ad = this.award({ type: "potw_def", date, pid: d.pid, team_id: d.team_id, line: lineText(d.line) });
    const confs = new Map<string, WeekLine[]>();
    for (const w of week) { const c = this.team(w.team_id).conference; if (c !== INDEPENDENT) confs.set(c, [...(confs.get(c) ?? []), w]); }
    const lines: string[] = [];
    for (const [conf, ws] of [...confs].sort()) {
      const co = best(ws, off, OFF_POS), cd = best(ws, def, DEF_POS);
      const parts: string[] = [];
      if (co) { const a = this.award({ type: "conf_potw_off", date, conference: conf, pid: co.pid, team_id: co.team_id, line: lineText(co.line) }); parts.push(`${a.name} (${this.team(a.team_id).abbr ?? this.team(a.team_id).school})`); }
      if (cd) { const a = this.award({ type: "conf_potw_def", date, conference: conf, pid: cd.pid, team_id: cd.team_id, line: lineText(cd.line) }); parts.push(`${a.name} (${this.team(a.team_id).abbr ?? this.team(a.team_id).school})`); }
      if (parts.length) lines.push(`${conf}: ${parts.join(" and ")}`);
    }
    const tag = (a: Award) => `${a.pos} ${a.name}, ${this.team(a.team_id).school}`;
    rep.news.push(this.news(date, "award", `Players of the week: ${ao.name} and ${ad.name}`,
      `Offense: ${tag(ao)} (${ao.line}). Defense: ${tag(ad)} (${ad.line}). ${lines.join(". ")}.`, [ao.team_id, ad.team_id]));
  }

  /** Conference players of the year, All-Americans and the Heisman, after championship weekend. */
  private seasonAwards(date: ISODate, rep: DayReport): void {
    const s = this.state;
    if (s.awards!.some((a) => a.type === "heisman" && a.year === s.year)) return;
    const recs = records(s.games, this.teams);
    const champs = new Set(Object.values(s.conf_champs));
    const rows = Object.entries(s.player_stats!).map(([pid, st]) => ({ pid: Number(pid), st, p: this.fbsPlayer(Number(pid), st.team_id) }))
      .filter((r): r is { pid: number; st: PlayerSeason; p: RatedPlayer } => !!r.p && r.st.gp > 0);
    if (!rows.length) return;
    const wins = (t: number) => recs.get(t)?.w ?? 0;
    const tag = (a: Award) => `${a.pos} ${a.name}, ${this.team(a.team_id).school}`;

    // Heisman: the best offensive season, with a push for winning (and a little for quarterbacks).
    const heis = (r: (typeof rows)[number]) => (OFF_POS.has(r.p.pos) ? offScore(r.st) * (r.p.pos === "QB" ? 1.1 : 1) : DEF_POS.has(r.p.pos) ? 1.4 * defScore(r.st) : 0)
      + 5 * wins(r.st.team_id) + (champs.has(r.st.team_id) ? 8 : 0);
    const fin = [...rows].sort((a, b) => heis(b) - heis(a) || a.pid - b.pid).slice(0, 4);
    const top = heis(fin[0]);
    const finalists = fin.map((r, i) => this.award({ type: i === 0 ? "heisman" : "heisman_finalist", date, pid: r.pid, team_id: r.st.team_id,
      points: Math.round(2500 * Math.pow(heis(r) / top, 4)), line: lineText(r.st) }));
    rep.news.push(this.news(date, "award", `${finalists[0].name} wins the Heisman Trophy`,
      `${tag(finalists[0])}: ${finalists[0].line}. Finalists: ${finalists.slice(1).map((a) => `${a.name} (${this.team(a.team_id).school}, ${a.points} pts)`).join(", ")}.`,
      finalists.map((a) => a.team_id)));

    // Conference players of the year.
    const confs = new Map<string, typeof rows>();
    for (const r of rows) { const c = this.team(r.st.team_id).conference; if (c !== INDEPENDENT) confs.set(c, [...(confs.get(c) ?? []), r]); }
    const conf: string[] = [];
    for (const [c, rs] of [...confs].sort()) {
      const o = rs.filter((r) => OFF_POS.has(r.p.pos)).sort((a, b) => offScore(b.st) + 2 * wins(b.st.team_id) - offScore(a.st) - 2 * wins(a.st.team_id) || a.pid - b.pid)[0];
      const d = rs.filter((r) => DEF_POS.has(r.p.pos)).sort((a, b) => defScore(b.st) + wins(b.st.team_id) - defScore(a.st) - wins(a.st.team_id) || a.pid - b.pid)[0];
      const got: string[] = [];
      if (o) got.push(`${this.award({ type: "conf_poy_off", date, conference: c, pid: o.pid, team_id: o.st.team_id, line: lineText(o.st) }).name} (offense)`);
      if (d) got.push(`${this.award({ type: "conf_poy_def", date, conference: c, pid: d.pid, team_id: d.st.team_id, line: lineText(d.st) }).name} (defense)`);
      if (got.length) conf.push(`${c}: ${got.join(", ")}`);
    }
    rep.news.push(this.news(date, "award", "Conference players of the year", conf.join(". ") + ".", []));

    // All-Americans: stats at the skill positions and on defense, ratings and team success up front, kicks for kickers.
    const aa = (r: (typeof rows)[number]) => {
      const w = wins(r.st.team_id);
      if (OFF_POS.has(r.p.pos)) return offScore(r.st) + w;
      if (DEF_POS.has(r.p.pos)) return defScore(r.st) + 0.3 * r.p.ovr + w;
      if (r.p.pos === "K") return kickScore(r.st) + 0.2 * r.p.ovr;
      return r.p.ovr + 0.8 * w + (r.p.pos === "P" || r.st.gp >= 8 ? 5 : 0);
    };
    const first: string[] = [];
    for (const [pos, k] of AA_SLOTS) {
      // Punts are not credited to players, so punters are picked from each team's starter.
      const cands = pos !== "P" ? rows.filter((r) => r.p.pos === pos) : this.teams.filter((t) => t.level === "fbs").flatMap((t) => {
        const p = this.playerById.get(this.depthChart(t.id).P?.[0] ?? -1);
        return p ? [{ pid: p.id, st: s.player_stats![p.id] ?? { team_id: t.id, gp: 0 }, p }] : [];
      });
      const pool = cands.sort((a, b) => aa(b) - aa(a) || a.pid - b.pid).slice(0, 2 * k);
      pool.forEach((r, i) => {
        const a = this.award({ type: "all_american", date, team: i < k ? 1 : 2, pid: r.pid, team_id: r.st.team_id, line: lineText(r.st) });
        if (i < k) first.push(`${pos} ${a.name} (${this.team(a.team_id).school})`);
      });
    }
    const mine = s.user_team_id != null ? s.awards!.filter((a) => a.year === s.year && a.date === date && a.type === "all_american" && a.team_id === s.user_team_id) : [];
    rep.news.push(this.news(date, "award", "The All-America team", `First team: ${first.join(", ")}.` +
      (mine.length ? ` ${this.team(s.user_team_id!).school}: ${mine.map((a) => `${a.name} (${a.team === 1 ? "first" : "second"} team)`).join(", ")}.` : ""), []));
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
        this.weeklyAwards(e.date, rep);
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
      case "selection": this.seasonAwards(e.date, rep); this.select(e.date, rep); break;
      case "season_end": {
        const poll = this.poll("ap", e.date, AP_PANEL, s.champion, rep);
        if (s.champion == null) {
          s.champion = poll.ranks[0].team_id;
          rep.news.push(this.news(e.date, "champion", `${this.team(s.champion).school} is the AP national champion`, this.top(poll, 5), [s.champion]));
        }
        rep.polls.push(poll);
        this.meet("end", e.date, rep);
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
    const hs = this.sideSetup(g.home_id, g.id), as = this.sideSetup(g.away_id, g.id);
    const user = s.user_team_id;
    const userSide = user === g.home_id ? "home" : user === g.away_id ? "away" : null;
    // Your games are always called: by you live, or by your coordinators from your game plan.
    const caller = userSide ? new Caller(userSide, new Rng(mixSeed(s.seed, s.year, g.id, "calls")), {
      plans: { [userSide]: this.gamePlan }, prep: { [userSide]: prepEdge(this.prepFor(g.id)) },
    }) : null;
    if (hs && as) {
      const gd = new GameDay(hs, as, new Rng(mixSeed(s.seed, s.year, g.id, "gameday")),
        { injuries: s.settings.injuries ?? 1, credit: new Rng(mixSeed(s.seed, s.year, g.id, "credit")) });
      const k = gd.kickoff();
      return { sim: new GameSim(k.home, k.away, opts), gd, sides: [hs, as], caller };
    }
    let home = this.teamRatings(g.home_id), away = this.teamRatings(g.away_id);
    if (!home || !away) throw new Error(`no ratings for game ${g.id}`);
    const hs2 = this.hiddenStrength(g.home_id), as2 = this.hiddenStrength(g.away_id);
    if (hs2) home = applyHidden(home, hs2.off, hs2.def);
    if (as2) away = applyHidden(away, as2.off, as2.def);
    if (userSide === "home") home = planRatings(home, this.gamePlan);
    if (userSide === "away") away = planRatings(away, this.gamePlan);
    return { sim: new GameSim(home, away, opts), gd: null, sides: null, caller };
  }

  /** Record the user's calls for one of their games today (from a live game); the game plays with them tonight. */
  setCalls(gameId: number, calls: UserCall[]): void {
    const s = this.state, g = s.games.find((x) => x.id === gameId);
    if (!g || g.status === "final" || g.date !== s.date) throw new Error("that game is not being played today");
    if (s.user_team_id == null || (g.home_id !== s.user_team_id && g.away_id !== s.user_team_id)) throw new Error("you can only call your own games");
    (s.calls ??= {})[gameId] = calls;
  }

  /** Record the user's lineup changes from a live game. */
  setSubs(gameId: number, subs: GameSub[]): void {
    if (!subs.length) return;
    (this.state.subs ??= {})[gameId] = subs;
  }

  /**
   * A practice day: Monday to Thursday in a week your team plays, the day's plan banks prep for the
   * game. A hard day can cost a player time (from its own stream, so nothing else moves).
   */
  private practiceDay(today: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    const wd = weekday(today);
    if (me == null || wd < 1 || wd > 4) return;
    const g = this.nextUserGame();
    if (!g || g.date <= today || daysBetween(today, g.date) > 6) return;
    if (!s.prep || s.prep.for_game !== g.id) s.prep = emptyPrep(g.id);
    const day = this.practicePlan[wd - 1];
    addPractice(s.prep, day);
    if (day.intensity !== "hard") return;
    const rng = new Rng(mixSeed(s.seed, s.year, today, "practice"));
    if (rng.random() >= PRACTICE_INJURY) return;
    const hurt = new Set(this.injured(me).map((i) => i.pid));
    const pool = this.roster(me).filter((p) => !hurt.has(p.id) && p.pos !== "K" && p.pos !== "P" && p.pos !== "LS");
    if (!pool.length) return;
    const p = pool[Math.floor(rng.random() * pool.length)];
    const u = rng.random();
    const days = u < 0.7 ? 3 + Math.floor(rng.random() * 5) : u < 0.95 ? 8 + Math.floor(rng.random() * 13) : 21 + Math.floor(rng.random() * 25);
    const types = ["hamstring", "ankle", "knee", "shoulder", "back"];
    const type = types[Math.floor(rng.random() * types.length)];
    const name = `${p.first} ${p.last}`.trim();
    const starter = Object.values(lineup(this.depthChart(me), this.playerById, hurt).slot).some((x) => x?.id === p.id);
    s.injuries!.push({ pid: p.id, team_id: me, name, pos: p.pos, game_id: 0, date: today, type, days, back: addDays(today, days), starter });
    this.compiled.delete(me);
    rep.news.push(this.news(today, "injury", `${this.team(me).school} ${p.pos} ${name} ${injuryOutlook(days)}`,
      `${name} was hurt (${type}) in a hard ${PRACTICE_DAYS[wd - 1]} practice.`, [me]));
  }

  private play(g: Game, rep: DayReport): void {
    const s = this.state;
    const rankH = this.rankOf(g.home_id), rankA = this.rankOf(g.away_id);
    const { sim, gd, sides, caller } = this.gameSetup(g);
    const subs = s.subs?.[g.id] ?? [];
    const userSide = caller?.userSide;
    const called = caller ? caller.replay(s.calls?.[g.id] ?? [], (i) => { for (const x of subs) if (x.at === i && gd && userSide) gd.setDepth(userSide, x.depth); }) : undefined;
    sim.play(gd ? gd.provider(called) : called);
    if (caller && s.prep?.for_game === g.id) s.prep = null;
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
      injuries: day?.injuries ?? [], snaps: day?.snaps ?? {}, defense: day?.defense ?? {},
    });
    this.recordStats(g, rep.details[rep.details.length - 1]);
    if (day) this.recordInjuries(g, day.injuries, [hs!, as!], rep);
    if (userSide && day) this.redshirtWarnings(g, day.snaps, rep);
    this.updateMorale(g);
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
      const ap = this.latestPoll("ap") ?? this.poll("ap", date, AP_PANEL);
      this.buildBowls(date, ap, new Set(), rep);
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
      this.buildBowls(date, st, new Set(), rep);
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
    this.buildBowls(date, ranking, playoffBowls(mainRounds(p.teams, p.byes)), rep);
  }

  /**
   * Bowl pairings on selection day: every FBS team not in the playoff, best first (the selection
   * ranking, then winning percentage, then strength), fills the bowls by conference tie-in.
   */
  private buildBowls(date: ISODate, ranking: Poll, usedByPlayoff: Set<string>, rep: DayReport): void {
    const s = this.state;
    const inPlayoff = new Set(s.playoff?.field.map((f) => f.team_id) ?? []);
    const done = s.games.filter((g) => g.status === "final");
    const fbs = new Set(this.teams.filter((t) => t.level === "fbs").map((t) => t.id));
    const rec = new Map<number, { fbsW: number; fcsW: number; w: number; l: number }>();
    for (const g of done) {
      const hw = g.home_score! > g.away_score!;
      for (const [id, opp, won] of [[g.home_id, g.away_id, hw], [g.away_id, g.home_id, !hw]] as const) {
        const r = rec.get(id) ?? { fbsW: 0, fcsW: 0, w: 0, l: 0 };
        if (won) { r.w++; if (fbs.has(opp)) r.fbsW++; else r.fcsW++; } else r.l++;
        rec.set(id, r);
      }
    }
    const busy = new Map<number, ISODate>();
    for (const g of s.games) for (const id of [g.home_id, g.away_id]) if (g.date > (busy.get(id) ?? "")) busy.set(id, g.date);
    const rank = new Map(ranking.ranks.map((r, i) => [r.team_id, i]));
    const pct = (id: number) => { const r = rec.get(id)!; return r.w / Math.max(1, r.w + r.l); };
    const pool: BowlTeam[] = this.teams
      .filter((t) => fbs.has(t.id) && !inPlayoff.has(t.id) && rec.has(t.id) && rec.get(t.id)!.w >= 5)
      .map((t) => {
        const r = rec.get(t.id)!;
        return { id: t.id, conference: t.conference, busy_until: busy.get(t.id) ?? "", eligible: r.fbsW + Math.min(1, r.fcsW) >= 6 && r.w >= r.l };
      })
      .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || pct(b.id) - pct(a.id) ||
        (s.power[b.id] ?? 0) - (s.power[a.id] ?? 0) || a.id - b.id);
    const played = new Set(s.games.filter((g) => g.kind === "regular").map((g) => (g.home_id < g.away_id ? `${g.home_id}-${g.away_id}` : `${g.away_id}-${g.home_id}`)));
    const bowls = [...NY6.filter((b) => !usedByPlayoff.has(b.name)), ...BOWLS].map((bowl) => ({ bowl, date: bowlDate(bowl, s.year) }));
    const picks = selectBowls(bowls, pool, played);
    for (const pk of picks) {
      const g = this.addGame(rep, { kind: "bowl", date: pk.date, home_id: pk.home, away_id: pk.away, neutral: true, venue: pk.bowl.venue, label: pk.bowl.name });
      g.kickoff_et = pk.bowl.kickoff_et;
    }
    const mine = s.user_team_id != null ? picks.find((pk) => pk.home === s.user_team_id || pk.away === s.user_team_id) : undefined;
    const top = picks.slice(0, 6).map((pk) => `${pk.bowl.name}: ${this.team(pk.home).school} vs ${this.team(pk.away).school}`).join("; ");
    rep.news.push(this.news(date, "selection", `${picks.length} bowl games are set`, top, picks.slice(0, 6).flatMap((pk) => [pk.home, pk.away])));
    if (mine) {
      const opp = this.team(mine.home === s.user_team_id ? mine.away : mine.home);
      rep.news.push(this.news(date, "selection", `${this.team(s.user_team_id!).school} will play ${opp.school} in the ${mine.bowl.name}`,
        `${mine.bowl.venue}, ${mine.date}`, [mine.home, mine.away]));
    }
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
