import { GameSim, Rng, type TeamRatings } from "@cfb/engine";
import { compileTeam, lineup, type DepthChart } from "./compiler.ts";
import { DEFENSE_FIELD, GameDay, OFFENSE_FIELD, type DefLine, type SideSetup } from "./gameday.ts";
import {
  LAB_SLOTS, POINTS_PER_UNIT, applyHidden, devFocus, devPhase, hiddenPlayer, hiddenTeam, labGain, labWork, progress, unitOf, type DevPhase, type DevTrack, type HiddenTeam, type LabArea, type LabPlan, type TeamContext, type Unit,
} from "./hidden.ts";
import { Caller, applyClock, type ClockEvent, type UserCall } from "./calls.ts";
import { DEFAULT_PLAN, DEFAULT_PRACTICE, PRACTICE_DAYS, PRACTICE_INJURY, addPractice, emptyPrep, freshness, planRatings, prepEdge, type GamePlan, type PracticePlan, type Prep } from "./plan.ts";
import { ATTRS, DEFENSE_SLOTS, OFFENSE_SLOTS, POSITIONS, fromZ, playerName, z as zOf, type Pos, type RatedPlayer } from "./players.ts";
import { AA_SLOTS, DEF_POS, OFF_POS, addLine, addTeamGame, type TeamSeason, defScore, kickScore, lineText, offScore, type Award, type PlayerSeason, type StatLine, type WeekLine, type BoxRow } from "./awards.ts";
import { expectations, meetingText, newCareer, securityTrail, winChance, type Career, type CareerStart, type Meeting } from "./career.ts";
import { addDays, daysBetween, nthWeekday, weekday, type ISODate } from "./dates.ts";
import { postseasonEvents, seasonEvents, sortEvents } from "./calendar.ts";
import { ROSTER_LIMIT, YEAR_GAIN, devRate, freshModel, nextPower, nextSchedule, rollRosters, starterMedians, type Departure, type FreshModel } from "./rollover.ts";
import {
  DEFAULT_RULE, PITCHES_PER_DAY, COMMIT, REASON_WORDS, STATUS_WORDS, TALKS_PER_WEEK, WATCH_WORDS, answerDays, transferHazard, openingAsk, patienceOf, payFor, reasonsOf, respond, roundPay, stayScore, watchOf,
  type PortalEntry, type PortalState, type RenewalRule, type StayContext, type Talk, type TalkStatus,
  askFor, lengthPremium, maxYears, renewalNudge,
} from "./portal.ts";
import {
  RERATE_DATES, RecruitWeek, SCOUT_COST, TRIP_HOURS, bandOf, classPoints, classTarget, currentOvr, earlySigning, enrollPlayer, generateClass, gradeOf, classShape,
  rateClasses, readSd, realClass, KNOWN_WEEKS, discoverRate, isPublic, truthAt, hashGauss, arrivalOvr, yearsOut, regionOf, schoolRead, looksOf, signingDay, starsOf, regionArea, reportSees, publicRead, REGIONS, REGION_REPORT_HOURS, DEFAULT_TRIPS, type ScoutLine, type ScoutReport, type Prospect, type RecruitEvent, type RecruitingState, type Region, type School, type SchoolEye, type FrozenSchool,
} from "./recruiting.ts";
import { OFFSEASON_TIME, SEASON_TIME, STAFF_HOURS, coachSkills, devSkillRate, labPace, prepFactor, recruitEff, scoutWidth, staffOf, staffSkill, timeSplit, type Skill, type StaffMember, type StaffTime } from "./staff.ts";
import { RECRUIT_FIT, ROOM, STARTERS, STYLE_MIX, miles, offerScore, persona, personaView, PERSONA_NAMES, traitLevel, typicalPersona, schoolValue, styleOf, type Persona, type SchoolOffer } from "./valuation.ts";
import { mixSeed } from "./hash.ts";
import { HS_COLS, HS_LEAD, hsLatest, hsSeasons, hsSummary } from "./hsstats.ts";
import {
  CAROUSEL_CLOSE, ROLE_NAMES, buyout, candidates, coachName, contractYears, hire, jobOf, marketDay, openCarousel, release, salaryFor, staffBudget, staffPay, staffRecs,
  newCoach, startCoaching, toMember, willing, type CoachRec, type CoachingState, type Job, type MarketCtx, type Role, type TeamYear,
} from "./carousel.ts";
import { INDEPENDENT, conferenceSchedule, isPower, placeTeams, realConferences, tieInsFor, validateSetup, type ConferenceDef, type ConferenceSetup, type TieIns } from "./conferences.ts";
import { capFor, mediaScore, realign, startDeals, type Move, type RealignState } from "./realign.ts";
import { CONF_MEDIA, SCHOOL_MEDIA } from "./finance.ts";
import { BASE_FILM, USUAL_FILM_HOURS, filmEff, insights, knowledge, tendencies, type Insight } from "./scouting.ts";
import { KNOWN_FRONTS, drawSchemes, fitSD, inferFronts, inferOffense, schemeRating, type TeamSchemes } from "./schemes.ts";
import { PICKS, declareChance, draftGrade, draftPrestige, runDraft, type DraftEntrant, type DraftPick } from "./draft.ts";
import { moods, unitMood } from "./morale.ts";
import { AREAS, budgetFor, crowd, facilitiesFor, projectCost, type Charge, type Area, type Budget, type ExpenseLine, type Facilities, type Project, type RevenueLine } from "./finance.ts";
import { FINANCING, SCOPES, bondPayment, effectSummary, effectiveGrades, facilityEffects, overrun, payments as projectPayments, projectOption, type Financing, type Scope } from "./facilities.ts";
import { NEUTRAL, budgetClass, nextFortune, postseasonPayout, type FinanceYear, type Fortune, type SeasonOutcome } from "./fortunes.ts";
import { FOCUS_MAX, RESERVE, collectiveBase, fmvCeiling, review, spend, type CollectiveState, type NilDeal, type NilTarget } from "./collective.ts";
import { FOOTBALL_SHARE, RETENTION_FUND, activeContract, dealAmount, revenueCap, aiContracts, eligibilityLeft, footballPool, playerValue, returning, rosterBudgetYear, type Contract } from "./money.ts";
import { AP_PANEL, COMMITTEE_PANEL, bcsStandings, runPoll, type PanelMemory, type PanelSpec } from "./polls.ts";
import { bracketOrder, mainRounds, openingPairs, slotCount, validatePlayoff } from "./playoff.ts";
import { BOWLS, NY6, bowlDate, playoffBowls, selectBowls, type Bowl, type BowlTeam } from "./bowls.ts";
import { records, updatePower } from "./ranking.ts";
import { generateWriters, starLine, writeStory, type Writer } from "./writers.ts";
import {
  DEFAULT_SETTINGS, type Ballot, type CalEvent, type Coach, type Game, type GameDetail, type GameKind, type Injury, type NewsItem, type Poll, type SeedBundle,
  type Settings, type Team, type TeamPlayers,
} from "./types.ts";
import { newsToInbox, URGENT_NEWS, type InboxMessage, type InboxPost } from "./inbox.ts";
import { COACH_VISITS_PER_WEEK, HEARD_HOURS, KNOW_HOURS, MAX_COACH_VISITS, MAX_POINTS, OFFICIAL_VISITS_PER_WEEK, SELLING_POINTS, VISIT_COST, coachWorth, moneyPull, nilAnswer, nilWalk, officialWorth, pitchPull, pointEffect, pointStrengths, recruitValue, type NilTalk, type Pitch, type SellingPoint } from "./pitch.ts";

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
  /** This season's messages to the user team (inbox.ts); absent in leagues saved before the inbox. */
  inbox?: InboxMessage[];
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
  /** The user's tempo changes and timeouts during live games, by game id. */
  clock_calls?: Record<number, ClockEvent[]>;
  /** The user's game plan and weekly practice plan (absent = the defaults). */
  game_plan?: GamePlan;
  practice?: PracticePlan;
  /** Practice banked toward the user's next game. */
  prep?: Prep | null;
  /** Season stats by player id, the best game each player has had since the last players of the week, and every award given. */
  player_stats?: Record<number, PlayerSeason>;
  /** Season totals by team id: its box scores and its opponents'. */
  team_stats?: Record<number, TeamSeason>;
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
  /** Each team's coordinators' schemes (absent in a league's first season: read from the seed; see schemes.ts). */
  schemes?: Record<number, TeamSchemes>;
  /** Your staff's individual development plans, by player id. */
  lab?: Record<number, LabPlan>;
  /** Hours of film your staff has put into your next opponent. */
  film?: { game_id: number; hours: number } | null;
  /**
   * Your staff's read of each of your players' development (overall points gained this year) when the
   * current phase began (`start`), and on each Monday of the season (the last four), for the Development
   * screen's progress. Taken by the day sim, so a replay gives the same; see Season.trackDevelopment.
   */
  dev_track?: DevTrack;
  /** Revenue-share contracts by player id, and each school's football revenue-share budget this year. */
  contracts?: Record<number, Contract>;
  pools?: Record<number, number>;
  /** Football's retention fund by school (Protect College Sports Act rules only). */
  retention?: Record<number, number>;
  /** Each school's collective (booster NIL money) and its deals by player id. */
  collectives?: Record<number, CollectiveState>;
  nil?: Record<number, NilDeal>;
  /** Each player's morale about pay and playing time (it builds week by week), and what it does to each unit's chemistry. */
  player_morale?: Record<number, number>;
  team_mood?: Record<number, Record<Unit, number>>;
  /** Each school's budget inputs, facilities and the upgrades its AD is building. */
  budgets?: Record<number, Budget>;
  facilities?: Record<number, Facilities>;
  projects?: Project[];
  /** Your ticket price for a home game, by game id (absent = the usual price). */
  ticket_prices?: Record<number, number>;
  /** Crowds and ticket money at each home game played. */
  gate?: Record<number, { attendance: number; price: number; revenue: number }>;
  /** Your requests to the AD for facility upgrades and the answers. */
  requests?: { date: ISODate; area: Area; approved: boolean; reason: string; scope?: Scope; financing?: Financing }[];
  /** Football's scheduled facility payments by fiscal year (cash while it's built, bonds for 20 years, a campaign's remainder). */
  facility_payments?: { team_id: number; year: number; amount: number; label: string }[];
  /** Booster money a donor campaign takes from a school's collective, by year. */
  facility_drag?: { team_id: number; year: number; amount: number }[];
  /** Your project proposals waiting on the AD's answer. */
  facility_asks?: { area: Area; scope: Scope; financing: Financing; date: ISODate; answer: ISODate }[];
  /** How generated freshmen rate (measured from the opening rosters at the first rollover), and the next new player's id. */
  fresh_model?: FreshModel;
  /** Each position's median FBS starter in the league's first season, which rollover keeps fixed (rollover.ts). */
  rating_anchor?: Partial<Record<Pos, number>>;
  next_player_id?: number;
  /** Every season played before this one, oldest first. */
  past?: SeasonSummary[];
  /** High school recruiting: four classes of prospects, each school's recent classes, and your board and scouts. */
  recruiting?: RecruitingState;
  /** Players who declared early for the NFL draft in January (they leave at the rollover). */
  declared?: number[];
  /** Everyone who left college for the draft at the rollover, and the draft once it's held in April. */
  draft_pool?: DraftEntrant[];
  draft?: { year: number; picks: DraftPick[] } | null;
  /** Each school's picks in its last three drafts, oldest first (recruits notice). */
  draft_history?: Record<string, number[]>;
  /** Your renewal talks this winter (from the end of the regular season to January 1), by player id, and your standing rule. */
  talks?: Record<number, Talk>;
  /** Your contract offers to your players during the season (this season's pay or an extension), waiting on their answer, by player id. */
  contract_offers?: Record<number, { amount: number; years: number; made: ISODate; answer: ISODate }>;
  renewal_rule?: RenewalRule;
  /** Next season's deals you've signed (renewals and transfers): dollars a year and seasons. */
  next_deals?: Record<number, { amount: number; years: number; locked?: boolean }>;
  /** Your promises of a starting job, by player id: the season each is for (and whether it broke). */
  promises?: Record<number, { year: number; broken?: boolean }>;
  /** The league's conferences (members, rules) and every bowl's conference tie-ins; absent in leagues saved before they existed (the real ones). */
  conferences?: ConferenceDef[];
  tie_ins?: TieIns;
  /** Conference TV deals, announced moves and every move so far (realign.ts). */
  realign?: RealignState;
  /** Players you've talked to this season (you know their real reasons), by the date of the talk. */
  talked?: Record<number, ISODate>;
  /** Your players' portal watch (their chance to enter in January), updated every Monday. */
  watch?: Record<number, number>;
  /** The transfer portal this winter. */
  portal?: PortalState | null;
  /** Transfers each player has made, and the season he arrived at his current school (the Act's rules, the retention fund). */
  moves?: Record<number, number>;
  arrived?: Record<number, number>;
  /** Each program's fortune (fans, donors, its AD's backing) carried from its past seasons, and its money history. */
  fortunes?: Record<number, Fortune>;
  fin_history?: Record<number, FinanceYear[]>;
  /** One-time charges to football budgets (conference exit fees and the like). */
  charges?: Charge[];
  /** Every coach in the league, the carousel's openings, your job offers and every move (carousel.ts); absent in leagues saved before it. */
  coaching?: CoachingState;
}

/** What a finished season leaves in the record book. */
export interface SeasonSummary {
  year: number;
  champion: number | null;
  /** The final AP top 25, by team id. */
  top25: number[];
  conf_champs: Record<string, number>;
  heisman: { pid: number; name: string; pos: string; team_id: number } | null;
  /** The playoff field, by team id (absent in seasons saved before it was kept). */
  playoff?: number[];
  /** Every FBS team's record, [wins, losses]. */
  records: Record<number, [number, number]>;
  user: { team_id: number; w: number; l: number; rank: number | null; security: number | null } | null;
}

/** One school's budget for the fiscal year: lines so far and projected to June 30. */
export interface BudgetView {
  revenue: Record<RevenueLine, number>;
  expenses: Record<ExpenseLine, number>;
  surplus: number;
  source: Budget["source"];
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
  inbox: InboxMessage[];
  stop: string | null;
}

/** Program cycles: how much of a program's momentum carries into next year, and how far it runs (utility for recruits). */
const CYCLE_CARRY = 0.8, CYCLE_SD = 0.5;
/** Momentum after a result against expectations: points of next-game margin per unit of (won - win chance), carry-over per game, cap (reports/momentum.md). */
export const MOMENTUM = { loss: 1, win: 0.25, carry: 0.3, cap: 1 };
/** The yearly chance a program changes head coaches (a stand-in for the carousel). */
const COACH_CHANGE = 0.2;
const OFF_OR_DEF = { off: new Set<string>(OFFENSE_FIELD as readonly string[]), def: new Set<string>(DEFENSE_FIELD as readonly string[]) };
const scaleEdge = <T extends object>(e: T, k: number): T => (k === 1 ? e : Object.fromEntries(Object.entries(e).map(([x, v]) => [x, (v as number) * k])) as T);
const gameOrder = (a: Game, b: Game) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);

/** "is out for the season", "will miss about 3 weeks", ... */
export function injuryOutlook(days: number): string {
  if (days >= 90) return "is out for the season";
  if (days < 5) return "is day to day";
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? "will miss about a week" : `will miss about ${weeks} weeks`;
}


// ---- the portal's helpers ------------------------------------------------------------------------
/** Each level (power, Group of Five, FCS): what it pays for value, its starters' rating by position, how it looks to a player. */
type TierStats = { ratio: number; bar: Record<Pos, number>; win: number }[];
/** A team's next season as players see it: each returning player's rank at his position, this year's starter bar and room counts. */
interface NextYear { tier: 0 | 1 | 2; rank: Map<number, number>; bar: Partial<Record<Pos, number>>; count: Partial<Record<Pos, number>>; os: Partial<Record<Pos, number[]>>; ratio: number; win: number; prestige: number; signees: Partial<Record<Pos, number>>; transfers_in: Partial<Record<Pos, number>>; budget: number }
interface Need { spots: number; starter: boolean; floor: number }
/** Schools stop bidding on a player holding this many offers. */
const CROWD = 10;
/** The share of FBS players who'd stop playing rather than drop to FCS (the January 2026 portal: 15% of power and 30% of Group of Five entrants found no school). */
const QUIT_FCS = 0.5;
const FULL_ROOM = (ROSTER_LIMIT - 5) / Object.values(ROOM).reduce((a, b) => a + b, 0);
/** A player's rating next season as everyone expects it (the usual year's gain, slower past his potential). */
/** A player's season production for his position (fantasy-style points; awards.ts). */
const scoreOf = (pos: Pos, st: StatLine) => (OFF_POS.has(pos) ? offScore(st) : DEF_POS.has(pos) ? defScore(st) : pos === "K" ? kickScore(st) : 0);
const ovrNext = (p: RatedPlayer) => p.ovr + YEAR_GAIN[Math.max(0, Math.min(YEAR_GAIN.length - 1, Math.floor(p.years)))] * (p.hidden.potential > p.ovr ? 1 : 0.3);
/** Winning and exposure as recruits weigh it (valuation.ts), for a player of quality q. */
const winTerm = (prestige: number, winPct: number, power: boolean, q: number) => {
  const f = RECRUIT_FIT, pr = prestige / 100, pw = power ? 1 : 0;
  return f.prestige * pr + f.prestige_x_quality * pr * q + f.win_pct * winPct + f.power * pw + f.power_x_quality * pw * q;
};
const homeTerm = (mi: number, sameState: boolean) => RECRUIT_FIT.log_distance * Math.log1p(mi / 50) + RECRUIT_FIT.home_state * (sameState ? 1 : 0);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const STAY = { playing: 1.6, winning: 0.6 };
const money = (x: number) => (x >= 1_000_000 ? `$${(x / 1_000_000).toFixed(2)}M` : `$${Math.round(x / 1000)}K`);
const softmax = (xs: number[]) => { const m = Math.max(...xs), e = xs.map((x) => Math.exp(x - m)), t = e.reduce((a, b) => a + b, 0); return e.map((x) => x / t); };
const chooseIdx = (xs: number[], u: number) => { const c = softmax(xs); for (let i = 0; i < c.length; i++) { if (u < c[i]) return i; u -= c[i]; } return c.length - 1; };

export class Season {
  teams: Team[];
  teamById: Map<number, Team>;
  private ratings: Map<number, TeamRatings>;
  private seed: SeedBundle;
  readonly playerById = new Map<number, RatedPlayer>();
  /** Each team's compiled lineup and the injured players it was compiled without. */
  private compiled = new Map<number, { out: string; r: TeamRatings }>();

  constructor(public state: SeasonState, seed: SeedBundle) {
    this.seed = seed;
    // Teams in id order, the order a league file returns them in, so polls draw the same noise after a reopen.
    state.conferences ??= realConferences(seed.teams, state.games.filter((g) => g.kind === "regular"));
    state.tie_ins ??= tieInsFor(state.conferences);
    this.teams = placeTeams(seed.teams, state.conferences, state.realign?.deals).sort((a, b) => a.id - b.id);
    this.teamById = new Map(this.teams.map((t) => [t.id, t]));
    this.ratings = new Map(Object.entries(seed.ratings).map(([k, v]) => [Number(k), v.ratings]));
    for (const t of Object.values(seed.players ?? {})) for (const p of t.players) this.playerById.set(p.id, p);
    state.depth ??= {};
    state.injuries ??= [];
    state.player_stats ??= {};
    state.team_stats ??= {};
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
  /** A team's rated players with its scheme, kicking and opening depth chart, as a league file stores them. */
  teamPlayers(teamId: number): TeamPlayers | undefined { return this.seed.players?.[teamId]; }
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
  static create(seed: SeedBundle, opts: { seed: number; user_team_id?: number | null; settings?: Partial<Settings>; career?: CareerStart; conferences?: ConferenceSetup | null }): Season {
    // The league's conferences: the real ones, or the user's with conference schedules built for the ones that changed.
    const setup = opts.conferences ?? null;
    const confs = setup?.conferences ?? realConferences(seed.teams, seed.schedule);
    let schedule = seed.schedule;
    if (setup) {
      const bad = validateSetup(setup, seed.teams, { pcsa: !!opts.settings?.pcsa, playoff_teams: (opts.settings?.playoff?.format ?? "playoff") === "playoff" ? opts.settings?.playoff?.teams ?? DEFAULT_SETTINGS.playoff.teams : 0 });
      if (bad) throw new Error(bad);
      schedule = conferenceSchedule(seed.schedule, seed.teams, placeTeams(seed.teams, confs), confs, opts.seed >>> 0, seed.season, 8_000_001);
      seed = { ...seed, schedule };
    }
    const games: Game[] = schedule.map((g) => ({
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
      polls: [], news: [], inbox: [], power, preseason_power: { ...power }, poll_memory: {}, conf_champs: {}, playoff: null, champion: null,
      next_game_id: 9_000_001, writers: generateWriters(placeTeams(seed.teams, confs), seed.rosters, opts.seed >>> 0), stars: {},
      conferences: confs, tie_ins: tieInsFor(confs, setup?.tie_ins),
    };
    const season = new Season(state, seed);
    season.startRealign();
    season.startHidden(seed.coaches ?? []);
    season.startCoaching(opts.career ?? { mode: "real" }, seed.coaches ?? [], seed.coach_pool ?? []);
    season.startMoney();
    season.startCollectives();
    season.startFinance(seed.finances);
    season.weeklyMorale();
    season.startCareer(opts.career ?? { mode: "real" }, seed.coaches ?? []);
    season.startRecruiting();
    return season;
  }

  get done(): boolean { return this.state.events.some((e) => e.type === "season_end" && e.status === "done"); }

  /**
   * The next season, once this one is over (M3 rollover). Rosters move on a year (rollover.ts), the
   * schedule repeats with home and away swapped, and preseason power follows the rosters. Facilities,
   * the AD's projects, players' morale, your multi-year contracts and your career carry over; budgets,
   * revenue-share deals for everyone else, collectives and camps start fresh as they did at the start.
   * The new season opens the day after this one ended, with spring practice, the draft and fall camp
   * still on the calendar ahead of it.
   */
  nextSeason(coaches: Coach[]): { next: Season; left: Departure[]; added: RatedPlayer[] } {
    const s = this.state, y = s.year, ny = y + 1;
    if (!this.done) throw new Error("the season isn't over");
    const players = this.seed.players ?? {};
    const model = s.fresh_model ?? freshModel(players);
    const anchor = s.rating_anchor ?? starterMedians(this.teams, players);
    // Each player's development over the whole season (for teams without hidden scores, his own draw).
    const growth = (tid: number) => this.hidden(tid, `${y}-12-31`)?.growth ?? new Map(this.roster(tid).map((p) => [p.id, hiddenPlayer(s.seed, y, p).dev]));
    const gp = Object.fromEntries(Object.entries(s.player_stats ?? {}).map(([pid, st]) => [pid, st.gp]));
    // The signing class arrives: every senior committed to a school enrolls there.
    let nextId = s.next_player_id ?? 900_000_001;
    const rst = s.recruiting, incoming: Record<number, RatedPlayer[]> = {};
    // Your signees' NIL deals, by their new player ids.
    const recruitDeals: Record<number, { amount: number; years: number; locked?: boolean }> = {};
    if (rst) {
      for (const p of rst.prospects) {
        if (gradeOf(p, y) < 3 || !p.commit || !players[p.commit.team]) continue;
        const t = p.commit.team === s.user_team_id ? rst.user.pitches?.[p.id]?.nil : undefined, d = t?.status === "agreed" ? t : t?.agreed;
        if (d) recruitDeals[nextId] = { amount: d.amount, years: d.years, ...(d.years > 1 ? { locked: true } : {}) };
        (incoming[p.commit.team] ??= []).push(enrollPlayer(p, nextId++, p.commit.team, s.seed));
      }
    }
    const declared = s.declared ? new Set(s.declared) : undefined;
    // The portal: committed transfers move, entrants with no school leave college football.
    const transfers = new Map<number, number>(), gone = new Set<number>(), lostSeason = new Set<number>();
    for (const e of s.portal?.year === y ? s.portal.entries : []) {
      if (e.status === "committed" && e.to != null && e.to !== e.from) {
        transfers.set(e.pid, e.to);
        if (s.settings.pcsa && (s.moves?.[e.pid] ?? 0) >= 1) lostSeason.add(e.pid);
      } else if (e.status !== "committed") gone.add(e.pid);
    }
    const turn = rollRosters({ seed: s.seed, year: y, teams: this.teams, players, model, next_player_id: nextId, growth, gp, incoming, declared,
      transfers, gone, lostSeason, fiveYears: !!s.settings.pcsa, anchor,
      rate: (tid) => devRate(this.facilityGrades(tid)) * devSkillRate(staffSkill(this.staff(tid), "development")) });
    const opening = s.events.find((e) => e.type === "dynasty_start")?.date ?? this.seed.start_date;
    // Conferences for next season (moves, folds, new deals), and conference schedules for any that changed.
    const rl = this.realignNext();
    const base = nextSchedule(s.games, this.teams, opening, s.next_game_id);
    const { start } = base;
    const schedule = rl.changed ? conferenceSchedule(base.schedule, this.teams, placeTeams(this.seed.teams, rl.conferences), rl.conferences, s.seed, ny, s.next_game_id + base.schedule.length) : base.schedule;
    // Preseason expectations: mostly last preseason's, partly how the year actually went, moved by the roster turnover.
    const power: Record<number, number> = {};
    for (const t of this.teams) {
      const prev = 0.7 * (s.preseason_power[t.id] ?? 0) + 0.3 * (s.power[t.id] ?? 0);
      const base = this.ratings.get(t.id), before = players[t.id], after = turn.players[t.id];
      power[t.id] = base && before && after ? nextPower(prev, base, before, after) : Math.round(prev * 10) / 10;
    }
    const seed: SeedBundle = { ...this.seed, season: ny, start_date: start, schedule, players: turn.players, power };
    const games: Game[] = schedule.map((g) => ({
      id: g.id, kind: "regular", week: g.week, date: g.date, kickoff_et: g.kickoff_et, home_id: g.home_id, away_id: g.away_id,
      neutral: g.neutral, conference_game: g.conference_game, venue: g.venue, label: g.notes, status: "scheduled",
      home_score: null, away_score: null, overtime: false,
    }));
    // Last season's offseason (spring practice, the draft, fall camp) is still ahead on the calendar.
    const ahead = s.events.filter((e) => e.date >= s.date && e.status !== "done");
    const events = seasonEvents(ny, start, schedule, s.settings.playoff).map((e) => (e.type === "dynasty_start" ? { ...e, label: `The ${ny} season opens` } : e));
    const kept = new Set(Object.values(turn.players).flatMap((t) => t.players.map((p) => p.id)));
    // Upgrades due by the new season are finished (and paid off).
    const facilities = structuredClone(s.facilities ?? {});
    const projects = (s.projects ?? []).filter((p) => {
      if (p.done > `${ny}-08-01`) return true;
      if (facilities[p.team_id]) facilities[p.team_id][p.area] = Math.max(facilities[p.team_id][p.area], p.to);
      return false;
    });
    // The season's results reach next year's money: crowds, donors and the AD's backing, and the record book.
    const { fortunes, history } = this.closeBooks();
    const state: SeasonState = {
      year: ny, seed: s.seed, date: s.date, settings: s.settings, user_team_id: s.user_team_id, games, events: sortEvents([...ahead, ...events]),
      polls: [], news: [], inbox: [], power: { ...power }, preseason_power: { ...power }, poll_memory: {}, conf_champs: {}, playoff: null, champion: null,
      next_game_id: Math.max(s.next_game_id + base.schedule.length, ...schedule.map((g) => g.id + 1)), writers: s.writers, stars: {},
      player_morale: Object.fromEntries(Object.entries(s.player_morale ?? {}).filter(([pid]) => kept.has(Number(pid)))),
      requests: s.requests, fresh_model: model, rating_anchor: anchor, next_player_id: turn.next_player_id, past: [...(s.past ?? []), this.summary()],
      // Everyone leaving for the pros or out of eligibility goes into April's draft.
      draft_pool: turn.left.filter((d) => d.reason === "nfl" || d.reason === "graduated").map((d) => ({ pid: d.pid, team_id: d.team_id, name: d.name, pos: d.pos, ovr: d.ovr,
        potential: d.potential ?? d.ovr, years: (d.years ?? 3) + 1, early: !!declared?.has(d.pid), tier: this.tierOf(d.team_id) }))
        // Only players the NFL could take (the last pick rates about 74).
        .filter((e) => e.ovr >= 66),
      draft: null, draft_history: s.draft_history,
      // Transfers and where everyone arrived (the Act's one free transfer, the retention fund); promises made for this season.
      moves: { ...s.moves, ...Object.fromEntries([...transfers.keys()].map((pid) => [pid, (s.moves?.[pid] ?? 0) + 1])) },
      arrived: Object.fromEntries([...Object.entries(s.arrived ?? {}).filter(([pid]) => kept.has(Number(pid))),
        ...[...transfers.keys()].map((pid) => [String(pid), ny] as const), ...Object.values(incoming).flat().map((p) => [String(p.id), ny] as const)]),
      promises: Object.fromEntries(Object.entries(s.promises ?? {}).filter(([, x]) => x.year === ny)),
      renewal_rule: s.renewal_rule, conferences: rl.conferences, tie_ins: rl.tie_ins, realign: rl.state,
      fortunes, fin_history: history, charges: (s.charges ?? []).filter((c) => c.year >= ny),
      facility_payments: (s.facility_payments ?? []).filter((x) => x.year >= ny), facility_drag: (s.facility_drag ?? []).filter((x) => x.year >= ny), facility_asks: s.facility_asks,
      coaching: s.coaching ? this.nextCoaching(s.coaching) : undefined,
    };
    if (rst) state.recruiting = this.nextRecruiting(rst, ny, incoming);
    const next = new Season(state, seed);
    for (const [h, b, ids] of rl.news) next.state.news.push(next.news(s.date, "conference", h, b, ids));
    next.startHidden(coaches);
    next.state.schemes = this.nextSchemes(next);
    for (const t of next.teams) {
      if (!s.coaching && t.level === "fbs" && next.state.hidden_ctx?.[t.id]?.new_coach) next.state.news.push(next.news(s.date, "coaching", `${t.school} has a new head coach`, "A new staff and a new system: how the roster fits it won't be known until camp.", [t.id]));
    }
    next.startMoney();
    next.startCollectives();
    // Your deals for the new season: multi-year deals that run into it, renewals and transfers.
    const me = s.user_team_id;
    if (me != null) {
      const deals: Record<number, { amount: number; years: number; locked?: boolean }> = {};
      for (const p of next.roster(me)) {
        const c = activeContract(s.contracts?.[p.id], ny);
        if (c) deals[p.id] = { amount: dealAmount(c), years: c.start + c.years - ny, ...(c.locked ? { locked: true } : {}) };
      }
      Object.assign(deals, s.next_deals, recruitDeals);
      next.applyDeals(deals);
    }
    next.startFinance(seed.finances);
    next.state.facilities = { ...next.state.facilities, ...facilities };
    next.state.projects = projects;
    next.weeklyMorale();
    if (s.career) {
      const c = s.career;
      // Out of work: the record stays until a school hires you.
      next.state.career = c.out ? { ...c, meetings: [] } : { ...c, expect: expectations(c.team_id, next.teams, games, power, s.settings.home_field_points),
        start: Math.round(c.hired && !this.securityTrail().length ? c.start : this.security() ?? c.start), meetings: [], hired: undefined };
    }
    next.turnoverNews(turn.left, turn.added);
    return { next, left: turn.left, added: turn.added };
  }

  /**
   * Recruiting moves on a year: the signed class is gone, every class is a grade older, a new freshman class
   * appears, each school's range follows the class it just signed, and each program's cycle moves (a stand-in
   * for coaching hires and momentum until the coaching carousel).
   */
  /** The coaches go on to next season: the carousel is over, coaches out of the profession are dropped, the last six years of moves kept. */
  private nextCoaching(co: CoachingState): CoachingState {
    const ny = this.state.year + 1;
    return {
      ...co, open: false, offers: [],
      coaches: co.coaches.filter((c) => !c.gone || c.user),
      openings: co.openings.filter((o) => o.team_id === this.state.user_team_id && o.role !== "HC"),
      moves: co.moves.filter((m) => m.date >= `${ny - 6}-07-01`),
    };
  }

  private nextRecruiting(rst: RecruitingState, ny: number, incoming: Record<number, RatedPlayer[]>): RecruitingState {
    const s = this.state, rs = this.seed.recruiting!;
    const prospects = rst.prospects.filter((p) => p.cls > ny);
    const { firsts, lasts } = this.namePools();
    const fresh = generateClass({ seed: s.seed, cls: ny + 4, year: ny, n: rs.class_size, rs, shape: classShape(rs), firsts, lasts, startId: rst.next_id });
    prospects.push(...fresh);
    const classes: Record<string, number[][]> = {};
    for (const t of this.teams) classes[t.id] = [...(rst.classes[t.id] ?? []).slice(-2), (incoming[t.id] ?? []).map((p) => p.composite ?? 0.75)];
    const cycle: Record<string, number> = {};
    for (const t of this.teams) cycle[t.id] = Math.round((CYCLE_CARRY * (rst.cycle?.[t.id] ?? 0) + CYCLE_SD * Math.sqrt(1 - CYCLE_CARRY ** 2) * new Rng(mixSeed(s.seed, ny, t.id, "cycle")).gauss(0, 1)) * 1000) / 1000;
    const live = new Set(prospects.map((p) => p.id));
    const keep = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => live.has(Number(k))));
    const u = rst.user;
    const next: RecruitingState = {
      prospects, next_id: rst.next_id + fresh.length, classes, cycle, rerate: 0, svc_v: 2,
      user: { ...u, hours: keep(u.hours), evals: keep(u.evals), scout: u.scout.filter((x) => live.has(x)), spend: 0,
        ...(u.trips_left ? { trips_left: keep(u.trips_left) } : {}), ...(u.pitches ? { pitches: keep(u.pitches) } : {}), ...(u.scout_from ? { scout_from: keep(u.scout_from) } : {}),
        found: (u.found ?? []).filter((x) => live.has(x)), board: (u.board ?? []).filter((x) => live.has(x)), board_added: (u.board_added ?? []).filter((x) => live.has(x)) },
    };
    rateClasses(next.prospects, ny, s.date, 0, s.seed, rs.curve);
    return next;
  }

  private signingNews(date: ISODate, label: string, rep: DayReport): void {
    const s = this.state, me = s.user_team_id, ranks = this.classRankings();
    const name = (r: { team_id: number; points: number; commits: number; five: number; four: number }) =>
      `${this.team(r.team_id).school} (${r.commits} signees${r.five ? `, ${r.five} five-star` : ""}${r.four ? `, ${r.four} four-star` : ""})`;
    rep.news.push(this.news(date, "recruiting", `${label}: ${this.team(ranks[0]?.team_id ?? this.teams[0].id).school} has the No. 1 class`,
      `Top classes: ${ranks.slice(0, 5).map(name).join("; ")}.`, ranks.slice(0, 5).map((r) => r.team_id)));
    if (me != null) {
      const i = ranks.findIndex((r) => r.team_id === me);
      if (i >= 0) rep.news.push(this.news(date, "recruiting", `${this.team(me).school}'s ${s.year + 1} class ranks No. ${i + 1}`, name(ranks[i]) + ".", [me]));
    }
  }

  /** News of who left and who arrived: your team in full, the rest of the country in brief. */
  private turnoverNews(left: Departure[], added: RatedPlayer[]): void {
    const s = this.state, me = s.user_team_id;
    const pros = left.filter((d) => d.reason === "nfl").sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    this.news(s.date, "offseason", `${left.length} players leave college football; ${pros.length} head for the NFL draft`,
      `Top prospects: ${pros.slice(0, 8).map((d) => `${d.pos} ${d.name} (${this.team(d.team_id).school})`).join(", ")}. ${added.length} freshmen join FBS and FCS rosters.`, pros.slice(0, 8).map((d) => d.team_id));
    if (me == null) return;
    const mine = left.filter((d) => d.team_id === me).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
    const fr = added.filter((p) => p.team_id === me).sort((a, b) => b.ovr - a.ovr || a.id - b.id);
    const who = (d: Departure) => `${d.pos} ${d.name} (${d.ovr})`;
    this.news(s.date, "offseason", `${this.team(me).school}: ${mine.length} players gone, ${fr.length} freshmen arrive`,
      `To the NFL: ${mine.filter((d) => d.reason === "nfl").map(who).join(", ") || "nobody"}. Graduated: ${mine.filter((d) => d.reason === "graduated").map(who).join(", ") || "nobody"}. ` +
      `Best of the new class: ${fr.slice(0, 5).map((p) => `${p.pos} ${playerName(p)} (${p.ovr})`).join(", ")}.`, [me]);
  }

  /**
   * The front office (like OOTP's salaries and finances screens): every player's pay by season for this year
   * and the next three (signed, locked, or what keeping him would likely cost), each season's roster budget
   * against what's committed, football's budget this year and projected for the next two, and the money
   * history. Projections assume a typical season from here: no new postseason money, fortune as projected.
   */
  frontOffice(teamId: number) {
    const s = this.state, t = this.team(teamId), b = this.budget(teamId), pool = this.rosterPool(teamId);
    if (!b || !pool) return null;
    const y = s.year, years = [y, y + 1, y + 2, y + 3];
    const leaving = this.leavingSet(), nfl = this.nflSlots();
    const roster = this.roster(teamId);
    // What this school pays for value now (keeping a player in later years would cost about the same share of his value).
    const totalValue = roster.reduce((a, p) => a + this.value(p.id), 0), rate = totalValue > 0 ? (this.payroll(teamId) + this.nilPaid(teamId)) / totalValue : 0;
    type Cell = { amount: number; kind: "paid" | "signed" | "locked" | "est" | "gone" };
    const players = roster.map((p) => {
      const last = y + Math.ceil(eligibilityLeft(p)) - 1;
      const c = s.contracts?.[p.id], next = s.next_deals?.[p.id];
      const vNext = playerValue({ pos: p.pos, ovr: ovrNext(p), stars: p.stars, years: p.years + 1 });
      const cells: Cell[] = years.map((yr) => {
        if (yr === y) return { amount: this.pay(p.id), kind: "paid" };
        if (yr > last || (yr === y + 1 && leaving.has(p.id))) return { amount: 0, kind: "gone" };
        if (next && yr < y + 1 + next.years) return { amount: next.amount, kind: next.locked ? "locked" : "signed" };
        const a = activeContract(c, yr);
        if (a && !(next && yr === y + 1)) return { amount: dealAmount(a), kind: a.locked ? "locked" : "signed" };
        return { amount: Math.round(Math.max(rate * vNext, 0) / 5000) * 5000, kind: "est" };
      });
      return { pid: p.id, name: playerName(p), pos: p.pos, ovr: p.ovr, cls: p.class, years: p.years, value: this.value(p.id), value_next: vNext, last,
        nfl: p.years >= 2 && (nfl.get(p.id) ?? 999) <= 100, cells };
    });
    const nb = this.nextBudget(teamId);
    const budgets = years.map((yr, i) => (i === 0 ? pool.total : Math.round(nb.total * Math.pow(1.04, i - 1) / 10_000) * 10_000));
    const totals = years.map((yr, i) => {
      const committed = players.reduce((a, p) => a + (["paid", "signed", "locked"].includes(p.cells[i].kind) ? p.cells[i].amount : 0), 0);
      const est = players.reduce((a, p) => a + (p.cells[i].kind === "est" ? p.cells[i].amount : 0), 0);
      return { year: yr, budget: budgets[i], committed, est, room: budgets[i] - committed - est };
    });
    // Football's budget: this year as it stands, and the next two at the projected fortune.
    const lines = this.budgetProjection(teamId, 2)!;
    const now = this.fortune(teamId), f = this.projectedFortune(teamId);
    const o = this.outcome(teamId);
    return {
      team_id: teamId, year: y, mine: teamId === s.user_team_id, conference: t.conference,
      class: { now: this.budgetClassOf(teamId), next: budgetClass(nb.total, rosterBudgetYear(y + 1)) },
      fortune: { now: { fans: now.fans, donors: now.donors, ad: now.ad }, next: f }, record: { w: o.wins, l: o.losses, exp: Math.round(o.exp * 10) / 10, ratio: Math.round(o.revenue_ratio * 1000) / 1000 },
      postseason: this.postseasonMoney(teamId),
      years, players, totals,
      lines,
      history: s.fin_history?.[teamId] ?? [],
    };
  }

  /**
   * Football's budget this year as it stands and projected for the next `ahead` years: a typical season from
   * here (no postseason money until it's earned), crowds and giving at next season's projected fortune, the
   * revenue-share cap and booster giving growing 4% a year, and the facility payments already scheduled.
   */
  budgetProjection(teamId: number, ahead: number) {
    const s = this.state, t = this.team(teamId), b = this.budget(teamId), inputs = s.budgets?.[teamId];
    if (!b || !inputs) return null;
    const y = s.year, now = this.fortune(teamId), f = this.projectedFortune(teamId);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, x) => a + x, 0);
    const pcsaRet = (yr: number) => (s.settings.pcsa ? Math.round(Math.min(RETENTION_FUND * FOOTBALL_SHARE, 0.6 * this.boosters(t) / now.donors * f.donors * Math.pow(1.04, yr - y))) : 0);
    const future = Array.from({ length: ahead }, (_, i) => y + 1 + i).map((yr) => {
      const k = Math.pow(1.04, yr - y - 1);
      const ticketsNow = b.revenue.tickets * (inputs.attendance > 0 ? Math.min(inputs.capacity, inputs.attendance / now.fans * f.fans) / inputs.attendance : 1);
      const revenue = {
        media: b.revenue.media, tickets: Math.round(ticketsNow), donors: Math.round((inputs.fixed.donors / now.donors * f.donors) * k + pcsaRet(yr)),
        support: b.revenue.support, other: Math.round(inputs.fixed.other / (1 + 0.5 * (now.donors - 1)) * (1 + 0.5 * (f.donors - 1)) * k), postseason: 0,
      };
      const expenses = {
        revenue_share: this.adPool(t, yr, f.ad) + pcsaRet(yr), coaches: b.expenses.coaches, operations: inputs.fixed.operations, facilities: Math.round(inputs.fixed.facilities + this.facilityPaid(teamId, yr)),
        one_time: (s.charges ?? []).filter((c) => c.team_id === teamId && c.year === yr).reduce((a, c) => a + c.amount, 0),
      };
      return { year: yr, revenue, expenses, surplus: sum(revenue) - sum(expenses), projected: true };
    });
    return [{ year: y, revenue: b.revenue, expenses: b.expenses, surplus: b.surplus, projected: false }, ...future];
  }

  /** Close the fiscal year: every program's fortune for next year and a line in its money history. */
  private closeBooks(): { fortunes: Record<number, Fortune>; history: Record<number, FinanceYear[]> } {
    const s = this.state, fortunes: Record<number, Fortune> = {}, history: Record<number, FinanceYear[]> = { ...s.fin_history };
    for (const t of this.teams) {
      const v = this.budget(t.id);
      if (!v) continue;
      const o = this.outcome(t.id), next = nextFortune(this.fortune(t.id), o);
      fortunes[t.id] = next;
      const sum = (x: Record<string, number>) => Object.values(x).reduce((a, y) => a + y, 0);
      const crowds = this.homeGames(t.id).map((g) => s.gate?.[g.id]?.attendance).filter((x): x is number => x != null);
      const pool = this.rosterPool(t.id);
      const rb = pool ? pool.revenue_share + pool.retention + (s.collectives?.[t.id]?.base ?? 0) : 0;
      history[t.id] = [...(history[t.id] ?? []), {
        year: s.year, w: o.wins, l: o.losses, post: this.postLabel(t.id), revenue: sum(v.revenue), expenses: sum(v.expenses), surplus: v.surplus,
        attendance: crowds.length ? Math.round(crowds.reduce((a, x) => a + x, 0) / crowds.length) : 0, roster_budget: rb,
        class: budgetClass(rb, rosterBudgetYear(s.year)).label, fortune: { fans: this.fortune(t.id).fans, donors: this.fortune(t.id).donors, ad: this.fortune(t.id).ad },
      }].slice(-10);
    }
    return { fortunes, history };
  }

  /** How a program's postseason went, in a few words ("Lost in the CFP quarterfinal", "Won the Citrus Bowl"). */
  postLabel(teamId: number): string | null {
    const s = this.state;
    const games = s.games.filter((g) => g.status === "final" && (g.kind === "bowl" || g.kind === "playoff") && (g.home_id === teamId || g.away_id === teamId));
    const last = games[games.length - 1];
    if (!last) return null;
    const won = (last.home_id === teamId) === (last.home_score! > last.away_score!);
    if (last.kind === "bowl") return `${won ? "Won" : "Lost"} the ${last.label}`;
    if (last.title) return won ? "Won the national title" : "Lost the title game";
    return `Lost in the playoff (${(last.label ?? "").replace(/ \(.*\)$/, "").toLowerCase()})`;
  }

  /** This season for the record book. */
  // ---- conferences over seasons ------------------------------------------------------------------
  /** Each FBS school's media score now: brand, crowds, the last three seasons' winning and playoff trips (realign.ts). */
  mediaScores(): Map<number, number> {
    const s = this.state, past = (s.past ?? []).slice(-2);
    const recs = records(s.games.filter((g) => g.status === "final"), this.teams);
    const out = new Map<number, number>();
    for (const t of this.teams) {
      if (t.level !== "fbs") continue;
      let w = recs.get(t.id)?.w ?? 0, l = recs.get(t.id)?.l ?? 0, berths = s.playoff?.field.some((f) => f.team_id === t.id) ? 1 : 0;
      for (const p of past) { const r = p.records[t.id]; if (r) { w += r[0]; l += r[1]; } if (p.playoff?.includes(t.id)) berths++; }
      const fin = this.seed.finances?.[t.id];
      const fans = fin?.attendance ?? Math.round((t.venue?.capacity ?? 25_000) * 0.7);
      out.set(t.id, mediaScore(t, { fans, win: w + l ? w / (w + l) : 0.5, berths }));
    }
    return out;
  }

  /** TV deals for the league's conferences at the start (real payouts for real conferences). */
  startRealign(): void {
    const s = this.state;
    s.realign = startDeals(s.conferences!, this.mediaScores(), CONF_MEDIA, s.year, s.seed);
    this.placeAgain();
  }

  /** Re-place every team after the conferences or their deals change. */
  private placeAgain(): void {
    this.teams = placeTeams(this.seed.teams, this.state.conferences!, this.state.realign?.deals).sort((a, b) => a.id - b.id);
    this.teamById = new Map(this.teams.map((t) => [t.id, t]));
  }

  /** Next season's conferences: the realignment step for the league's mode (realign.ts). */
  private realignNext(): { conferences: ConferenceDef[]; tie_ins: TieIns; state: RealignState; changed: boolean; news: [string, string, number[]][] } {
    const s = this.state;
    const st = s.realign ?? startDeals(s.conferences!, this.mediaScores(), CONF_MEDIA, s.year, s.seed);
    const form = new Map<number, number>();
    const recs = records(s.games.filter((g) => g.status === "final" && g.kind === "regular"), this.teams);
    const last = s.past?.[s.past.length - 1];
    for (const t of this.teams) {
      const r = recs.get(t.id), p = last?.records[t.id];
      const w = (r?.w ?? 0) + (p?.[0] ?? 0), l = (r?.l ?? 0) + (p?.[1] ?? 0);
      form.set(t.id, w + l ? w / (w + l) : 0);
    }
    const out = realign({
      year: s.year, conferences: s.conferences!, teams: this.teams, state: st, score: this.mediaScores(),
      solo: (t) => SCHOOL_MEDIA[t.school] ?? 2_000_000, mode: s.settings.realignment ?? "market", pcsa: !!s.settings.pcsa, seed: s.seed, form,
    });
    const key = (cs: ConferenceDef[]) => JSON.stringify(cs.map((c) => [c.name, [...c.members].sort((a, b) => a - b), c.conf_games]).sort());
    return { conferences: out.conferences, tie_ins: tieInsFor(out.conferences, s.tie_ins), state: out.state, news: out.news, changed: key(out.conferences) !== key(s.conferences!) };
  }

  /** Whether the league's conferences can be rewritten now: commissioner mode, before the season's first game. */
  canEditConferences(): boolean {
    return !!this.state.settings.commissioner && !this.state.games.some((g) => g.kind === "regular" && g.status === "final");
  }

  /**
   * Commissioner mode: replace the league's conferences before the season's first game. Conferences
   * that change get new conference schedules; new conferences sign deals at what their schools are worth.
   */
  setConferences(setup: ConferenceSetup): void {
    const s = this.state;
    if (!s.settings.commissioner) throw new Error("turn on commissioner mode to edit conferences");
    if (!this.canEditConferences()) throw new Error("conferences can only change before the season's first game");
    const bad = validateSetup(setup, this.seed.teams, { pcsa: !!s.settings.pcsa, playoff_teams: s.settings.playoff.format === "playoff" ? s.settings.playoff.teams : 0 });
    if (bad) throw new Error(bad);
    const cap = capFor(!!s.settings.pcsa);
    const over = setup.conferences.find((c) => c.tier !== "independent" && c.members.length > cap);
    if (over) throw new Error(`${over.name} is over the ${cap}-school limit`);
    const before = this.teams;
    const regular = s.games.filter((g) => g.kind === "regular").map((g) => ({ id: g.id, week: g.week, date: g.date, kickoff_et: g.kickoff_et, home_id: g.home_id, away_id: g.away_id,
      neutral: g.neutral, conference_game: g.conference_game, venue_id: null, venue: g.venue, notes: g.label }));
    const placed = placeTeams(this.seed.teams, setup.conferences);
    const schedule = conferenceSchedule(regular, before, placed, setup.conferences, s.seed, s.year + 1000, s.next_game_id);
    const ids = new Set(regular.map((g) => g.id));
    s.games = [...s.games.filter((g) => g.kind !== "regular"), ...schedule.map((g): Game => {
      const old = ids.has(g.id) ? s.games.find((x) => x.id === g.id)! : null;
      return old ? { ...old, conference_game: g.conference_game } : {
        id: g.id, kind: "regular", week: g.week, date: g.date, kickoff_et: g.kickoff_et, home_id: g.home_id, away_id: g.away_id,
        neutral: g.neutral, conference_game: g.conference_game, venue: g.venue, label: g.notes, status: "scheduled", home_score: null, away_score: null, overtime: false,
      };
    })].sort(gameOrder);
    s.next_game_id = Math.max(s.next_game_id, ...schedule.map((g) => g.id + 1));
    // Moves for the record; deals for new conferences, none for ones that are gone.
    const rl = s.realign ?? startDeals(s.conferences!, this.mediaScores(), CONF_MEDIA, s.year, s.seed);
    const was = new Map(before.map((t) => [t.id, t.conference]));
    for (const t of placed) if (t.level === "fbs" && was.get(t.id) !== t.conference) {
      rl.history.push({ team_id: t.id, from: was.get(t.id) ?? INDEPENDENT, to: t.conference, announced: s.year, effective: s.year, fee: 0, reason: "commissioner" } satisfies Move);
    }
    const scores = this.mediaScores();
    const deals: RealignState["deals"] = {};
    for (const c of setup.conferences) {
      if (c.tier === "independent") continue;
      const avgScore = c.members.reduce((a, m) => a + (scores.get(m) ?? 0), 0) / Math.max(1, c.members.length);
      deals[c.name] = rl.deals[c.name] ?? { per_school: Math.round(Math.exp(rl.fit.a + rl.fit.b * avgScore)), expires: s.year + 6, signed_score: avgScore };
    }
    rl.deals = deals;
    rl.pending = rl.pending.filter((m) => setup.conferences.some((c) => c.name === m.to) && setup.conferences.find((c) => c.members.includes(m.team_id))?.name === m.from);
    s.realign = rl;
    s.conferences = structuredClone(setup.conferences);
    s.tie_ins = tieInsFor(s.conferences, setup.tie_ins ?? s.tie_ins);
    this.placeAgain();
    this.compiled.clear();
  }

  summary(): SeasonSummary {
    const s = this.state;
    const recs = records(s.games, this.teams);
    const h = s.awards?.find((a) => a.type === "heisman" && a.year === s.year);
    const me = s.user_team_id;
    const mine = me != null ? recs.get(me) : undefined;
    return {
      year: s.year, champion: s.champion, playoff: s.playoff?.field.map((f) => f.team_id) ?? [], top25: this.latestPoll("ap")?.ranks.slice(0, 25).map((r) => r.team_id) ?? [], conf_champs: { ...s.conf_champs },
      heisman: h ? { pid: h.pid, name: h.name, pos: h.pos, team_id: h.team_id } : null,
      records: Object.fromEntries(this.teams.filter((t) => t.level === "fbs").map((t) => { const r = recs.get(t.id); return [t.id, [r?.w ?? 0, r?.l ?? 0]]; })),
      user: me != null ? { team_id: me, w: mine?.w ?? 0, l: mine?.l ?? 0, rank: this.rankOf(me), security: this.security() } : null,
    };
  }
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
    if ((next.realignment ?? "market") !== (s.settings.realignment ?? "market")) throw new Error("how conferences change is set when a league starts");
    if (JSON.stringify(next.playoff) !== JSON.stringify(s.settings.playoff)) {
      if (s.playoff || s.events.some((e) => e.type === "selection" && e.status === "done")) {
        throw new Error("the postseason has started; playoff changes apply from next season");
      }
      const POST = new Set(["cfp_rankings", "bcs_standings", "selection", "playoff_round", "title_game"]);
      s.events = sortEvents([...s.events.filter((e) => !POST.has(e.type) || e.status === "done"),
        ...postseasonEvents(s.year, next.playoff).filter((e) => e.date >= s.date)]);
    }
    const pcsa = !!next.pcsa !== !!s.settings.pcsa;
    if (pcsa && s.games.some((g) => g.status === "final")) throw new Error("the Protect College Sports Act rules can only change before the season's first game");
    s.settings = next;
    if (pcsa) {
      // New rules, new budgets: every athletic department and collective signs its roster again.
      this.startMoney();
      this.startCollectives();
      s.player_morale = {};
      s.team_mood = undefined;
      this.weeklyMorale();
    }
  }

  /** Run today in the fixed order (morning events, actions, day processing, evening games), then move to tomorrow. */
  advanceDay(): DayReport {
    const s = this.state;
    const today = s.date;
    const rep: DayReport = { date: today, fired: [], played: [], details: [], new_games: [], new_events: [], polls: [], ballots: [], news: [], inbox: [], stop: null };

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
    this.tallyLab(today);
    this.practiceDay(today, rep);
    this.filmDay(today);
    this.trackDevelopment(today);
    this.adMeetings(today, rep);
    this.facilityDay(today, rep);
    this.collectiveMonth(today);
    if (weekday(today) === 1) { this.weeklyMorale(); this.weeklyWatch(today, rep); }
    this.recruitingDay(today, rep);
    if (s.talks && !s.portal) this.talksDay(today, rep);
    if (s.contract_offers) this.contractAnswers(today, rep);
    if (s.recruiting?.user.pitches) this.nilAnswers(today, rep);
    if (s.coaching?.open) this.carouselDay(today, rep);
    if (s.portal?.year === s.year) this.portalDay(today, rep);
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
    if (me == null) { s.career = null; if (s.coaching) this.placeUser(start); return; }
    // You take your place on the school's staff (changing teams in Settings moves you there).
    if (s.coaching && this.userCoach()?.team_id !== me) this.placeUser(start);
    const coach = coaches.find((c) => c.team_id === me && c.role === "HC");
    s.career = newCareer(start, me, coach, expectations(me, this.teams, s.games, s.preseason_power, s.settings.home_field_points), s.seed);
    const u = this.userCoach();
    if (u && s.coaching) s.career.coach.reputation = u.rep;
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
    if (!c || c.out) return;
    // The preseason meeting is when the season opens, not right after last season's ended.
    const opening = this.state.events.find((e) => e.type === "dynasty_start")?.date;
    if (opening && today < opening) return;
    const has = (k: Meeting["kind"]) => c.meetings.some((m) => m.kind === k);
    const reg = this.state.games.filter((g) => g.kind === "regular" && (g.home_id === c.team_id || g.away_id === c.team_id));
    const played = reg.filter((g) => g.status === "final").length;
    if (!has("preseason") && !has("midseason") && played === 0) { this.meet("preseason", today, rep); this.staffReport("camp", today, rep); }
    else if (!has("midseason") && !has("end") && played >= Math.ceil(reg.length / 2)) { this.meet("midseason", today, rep); this.staffReport("midseason", today, rep); }
  }

  private meet(kind: Meeting["kind"], date: ISODate, rep: DayReport): void {
    const s = this.state, c = s.career;
    if (!c || c.out || c.meetings.some((m) => m.kind === kind)) return;
    const sec = this.security()!;
    const r = records(s.games, this.teams).get(c.team_id) ?? { w: 0, l: 0 };
    const text = meetingText(c, kind, sec, r, this.team(c.team_id).school);
    c.meetings.push({ kind, date, security: sec, text });
    const ad = `${c.ad.first} ${c.ad.last}`;
    const head = kind === "preseason" ? `Athletic director ${ad} sets the bar for ${s.year}` : kind === "midseason" ? `Midseason meeting with athletic director ${ad}` : `End-of-season meeting with athletic director ${ad}`;
    rep.news.push(this.news(date, "ad", head, text, [c.team_id]));
    // A season the school wanted earns an extension and a raise.
    const u = this.userCoach();
    if (kind === "end" && sec >= 75 && u && u.team_id === c.team_id && u.through < s.year + 5) {
      u.through = s.year + 5;
      u.salary = Math.round(u.salary * 1.1 / 10_000) * 10_000;
      rep.news.push(this.news(date, "career", `${this.team(c.team_id).school} extends ${coachName(u)} through ${u.through}`, `A raise to ${money(u.salary)} a year.`, [c.team_id]));
    }
  }

  // ---- coaching staffs and the carousel (M4) ------------------------------------------------------
  private jobCache?: Map<number, Job>;
  /** Every school's job as coaches see it. */
  jobs(): Map<number, Job> { return (this.jobCache ??= new Map(this.teams.map((t) => [t.id, jobOf(t, isPower(t))]))); }

  /** Every coach in the league when it starts (carousel.ts), and you among them. */
  startCoaching(start: CareerStart, coaches: Coach[], pool: SeedBundle["coach_pool"] & object): void {
    const s = this.state;
    s.coaching = startCoaching({ seed: s.seed, year: s.year, teams: this.teams, jobs: this.jobs(), coaches, pool, schemes: this.allSchemes() });
    this.placeUser(start);
  }

  /** Your coaching record (null without a team or a career). */
  userCoach(): CoachRec | null { return this.state.coaching?.coaches.find((c) => c.user) ?? null; }

  /**
   * You become your school's head coach: its real coach, or you under your own name (the real coach is then
   * out of work, a candidate for other jobs). Changing teams in Settings moves you; the school you left gets
   * the best coach available.
   */
  private placeUser(start: CareerStart): void {
    const s = this.state, co = s.coaching, me = s.user_team_id;
    if (!co) return;
    const ctx = this.marketCtx(s.date, null);
    const prev = this.userCoach();
    if (prev) {
      prev.user = false;
      if (prev.source === "you") {
        if (prev.team_id != null && prev.team_id !== me) { const t = prev.team_id; release(co, ctx, prev, "resigned", { quiet: true }); this.fillNow(t, "HC"); }
        prev.gone = true;
        prev.team_id = null; prev.role = null;
      }
    }
    this.staffCache.clear();
    if (me == null) return;
    const real = co.coaches.find((c) => c.team_id === me && c.role === "HC");
    if (start.mode === "real" && real) { real.user = true; return; }
    const seedHc = (this.seed.coaches ?? []).find((c) => c.team_id === me && c.role === "HC");
    const you: CoachRec = {
      id: co.next_id++, first: start.first?.trim() || "Coach", last: start.last?.trim() || "You", age: 35, team_id: me, role: "HC", side: real?.side ?? "off",
      off: real?.off ?? "spread_rpo", def: real?.def ?? "4-2-5",
      // Your staff's skills are what the school had (staff.ts): you inherit its program.
      skills: { ...(real?.skills ?? (seedHc ? coachSkills(s.seed, seedHc, this.team(me)) : coachSkills(s.seed, { team_id: me, role: "HC", first: start.first ?? "Coach", last: "", hire_date: null, career: [], source: "generated" }, this.team(me)))) }, rep: 30, since: s.year,
      salary: salaryFor("HC", this.jobs().get(me)!, 30), through: s.year + contractYears("HC") - 1, seasons: [], user: true, source: "you",
    };
    if (real) { release(co, ctx, real, "resigned", { quiet: true }); real.left = { team_id: me, year: s.year - 1, why: "resigned" }; }
    co.openings = co.openings.filter((o) => !(o.team_id === me && o.role === "HC"));
    co.coaches.push(you);
    this.staffCache.clear();
  }

  /** Who a hire made today works for: this season if the season hasn't reached its carousel, next season after it. */
  private nextSince(): number { const co = this.state.coaching!; return co.year >= this.state.year ? this.state.year + 1 : this.state.year; }

  private marketCtx(date: ISODate, rep: DayReport | null): MarketCtx {
    const s = this.state;
    return {
      seed: s.seed, year: s.year, date, jobs: this.jobs(), names: this.namePools(), userTeam: s.user_team_id,
      news: (h, b, ids, kind = "coaching") => { const n = this.news(date, kind, h, b, ids); rep?.news.push(n); },
      charge: (team_id, amount, label) => { (s.charges ??= []).push({ team_id, year: s.year, label, amount }); },
    };
  }

  /** Fill an opening at once with the best coach available (outside the carousel, and for the school you left). */
  private fillNow(teamId: number, role: Role, rep: DayReport | null = null): void {
    const co = this.state.coaching!, ctx = this.marketCtx(this.state.date, rep);
    const job = this.jobs().get(teamId)!;
    const pick = candidates(co, job, role, ctx.jobs, ctx.seed, ctx.year).find((p) => p.coach.team_id == null);
    const c = pick?.coach ?? Object.assign(newCoach(co, new Rng(mixSeed(ctx.seed, ctx.year, ctx.date, "fill", teamId, role)), ctx.names), { entered: ctx.year });
    hire(co, ctx, c, teamId, role, { since: this.nextSince(), quiet: true });
    this.staffCache.clear();
  }

  /** How each team's regular season went, for the carousel (FBS teams). */
  teamYears(): Map<number, TeamYear> {
    const s = this.state, fbs = this.teams.filter((t) => t.level === "fbs");
    const hfa = s.settings.home_field_points;
    const acc = new Map<number, { w: number; l: number; pf: number; pa: number; exp: number; n: number; reg: number }>();
    for (const t of fbs) acc.set(t.id, { w: 0, l: 0, pf: 0, pa: 0, exp: 0, n: 0, reg: 0 });
    for (const g of s.games) {
      if (g.kind !== "regular" && g.kind !== "conf_champ") continue;
      for (const [me, opp, home] of [[g.home_id, g.away_id, true], [g.away_id, g.home_id, false]] as const) {
        const a = acc.get(me);
        if (!a) continue;
        if (g.kind === "regular") {
          const m = (s.preseason_power[g.home_id] ?? 0) - (s.preseason_power[g.away_id] ?? 0) + (g.neutral ? 0 : hfa);
          a.exp += home ? winChance(m) : 1 - winChance(m);
          a.reg++;
        }
        if (g.status !== "final") continue;
        const us = home ? g.home_score! : g.away_score!, them = home ? g.away_score! : g.home_score!;
        if (us > them) a.w++; else a.l++;
        a.pf += us; a.pa += them; a.n++;
        void opp;
      }
    }
    // Units against what the roster was expected to give: points for and against per game, against a line through preseason power.
    const resid = (k: "pf" | "pa") => {
      const xs = fbs.map((t) => s.preseason_power[t.id] ?? 0), ys = fbs.map((t) => { const a = acc.get(t.id)!; return a.n ? a[k] / a.n : 0; });
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((a, x) => a + (x - mx) ** 2, 0));
      const r = ys.map((y, i) => y - my - b * (xs[i] - mx)), sd = Math.sqrt(r.reduce((a, x) => a + x * x, 0) / r.length) || 1;
      return new Map(fbs.map((t, i) => [t.id, r[i] / sd]));
    };
    const off = resid("pf"), def = resid("pa");
    const last = s.past?.[s.past.length - 1];
    const out = new Map<number, TeamYear>();
    for (const t of fbs) {
      const a = acc.get(t.id)!, rec = last?.records[t.id];
      out.set(t.id, { w: a.w, l: a.l, exp: a.reg ? a.exp / a.reg : 0.5, prev: rec && rec[0] + rec[1] ? rec[0] / (rec[0] + rec[1]) : null, off: off.get(t.id)!, def: -def.get(t.id)! });
    }
    return out;
  }

  /**
   * The carousel opens: every coach's season goes on his record, your athletic director decides about you,
   * the others decide about theirs, and coaches retire and enter the profession.
   */
  private openCarouselDay(date: ISODate, rep: DayReport): void {
    const s = this.state, co = s.coaching;
    if (!co) return;
    const ctx = this.marketCtx(date, rep);
    openCarousel(co, ctx, this.teamYears());
    const u = this.userCoach(), c = s.career;
    if (u && c) c.coach.reputation = u.rep;
    // Your athletic director: on the brink means you're done (in your first two seasons, only a disaster).
    if (u && c && u.team_id != null && !c.out) {
      const sec = this.security() ?? c.start, tenure = s.year - u.since + 1;
      if (sec < 20 && (tenure >= 3 || sec < 10)) {
        const school = this.team(u.team_id).school, owed = buyout(u, s.year);
        release(co, ctx, u, "fired", { quiet: true });
        c.out = date;
        s.user_team_id = null;
        ctx.userTeam = null;
        rep.news.push(this.news(date, "career", `${school} fires head coach ${coachName(u)}`,
          `Athletic director ${c.ad.first} ${c.ad.last} makes the change after ${tenure} season${tenure === 1 ? "" : "s"}. The school owes you $${(owed / 1e6).toFixed(1)} million. Schools with openings may call over the next weeks; any offer shows on your Career page.`, [c.team_id]));
        rep.stop = "fired";
      }
    }
    this.staffCache.clear();
  }

  /** A day of the carousel: schools fill their openings; an offer to you stops the sim. */
  private carouselDay(date: ISODate, rep: DayReport): void {
    const s = this.state, co = s.coaching;
    if (!co?.open) return;
    const r = marketDay(co, this.marketCtx(date, rep), { userCoach: this.userCoach(), close: date >= CAROUSEL_CLOSE(co.year) });
    for (const o of r.offers) {
      const t = this.team(o.team_id);
      rep.news.push(this.news(date, "career", `${t.school} wants you as its head coach`,
        `${t.school} offers ${money(o.salary)} a year for ${o.years} years. You have until ${o.expires} to answer on your Career page; if you take it, your new school's staff is yours to keep or replace.`, [o.team_id]));
      rep.stop = "job_offer";
    }
    this.staffCache.clear();
  }

  /** Answer a job offer: take it (you're the new head coach there today) or turn it down. */
  answerOffer(teamId: number, accept: boolean): void {
    const s = this.state, co = s.coaching, u = this.userCoach();
    const o = co?.offers.find((x) => x.team_id === teamId && x.status === "open");
    if (!co || !u || !o) throw new Error("no open offer from that school");
    const op = co.openings.find((x) => x.team_id === teamId && x.role === "HC");
    if (!accept) {
      o.status = "declined";
      if (op) { op.offered = false; op.declined = true; }
      return;
    }
    const ctx = this.marketCtx(s.date, null);
    const old = u.team_id, newJob = this.jobs().get(teamId)!;
    o.status = "accepted";
    for (const x of co.offers) if (x.status === "open") { x.status = "declined"; const p = co.openings.find((y) => y.team_id === x.team_id && y.role === "HC"); if (p) { p.offered = false; p.declined = true; } }
    if (old != null) {
      release(co, ctx, u, "left", { quiet: true, days: 3 });
      this.news(s.date, "coaching", `${coachName(u)} leaves ${this.team(old).school} for ${newJob.school}`, `${this.team(old).school} opens a search for a new head coach.`, [old, teamId]);
    } else this.news(s.date, "coaching", `${newJob.school} hires ${coachName(u)} as head coach`, `${coachName(u)} is back on a sideline.`, [teamId]);
    ctx.userTeam = teamId;
    hire(co, ctx, u, teamId, "HC", { since: this.nextSince(), quiet: true });
    u.salary = o.salary;
    u.through = u.since + o.years - 1;
    // A new job: the old school's players, plans and talks stay behind; your name and record come along.
    s.user_team_id = teamId;
    s.redshirts = [];
    s.lab = {};
    s.talks = undefined;
    s.next_deals = undefined;
    s.promises = undefined;
    const prev = s.career;
    this.startCareer(prev ? { mode: prev.mode, first: u.first, last: u.last } : { mode: "real" }, this.seed.coaches ?? []);
    if (s.career) { s.career.coach = { first: u.first, last: u.last, reputation: u.rep }; s.career.hired = s.date; s.career.start = Math.round(60 + 0.2 * (u.rep - 50)); }
    this.staffCache.clear();
  }

  /** Your staff openings and the coaches you could hire for one: who's out of work, and (in the offseason) coordinators at schools a step below yours. */
  staffCandidates(role: Role): { coach: CoachRec; ask: number; scouted: Record<Skill, number> }[] {
    const s = this.state, co = s.coaching, me = s.user_team_id;
    if (!co || me == null || role === "HC") return [];
    const job = this.jobs().get(me)!, year = s.year;
    const offseason = co.open || !this.inSeason(s.date);
    return co.coaches
      .filter((c) => !c.user && willing(c, job, role, this.jobs(), co.open ? co.year : year) && (offseason || c.team_id == null))
      .map((c) => ({ coach: c, ask: salaryFor(role, job, c.rep), scouted: this.scoutedSkills(c) }))
      .sort((a, b) => b.coach.rep - a.coach.rep || a.coach.id - b.coach.id)
      .slice(0, 60);
  }

  /** Your staff's read of another coach's skills (true for your own staff). */
  scoutedSkills(c: CoachRec): Record<Skill, number> {
    const s = this.state;
    if (c.team_id != null && c.team_id === s.user_team_id) return { ...c.skills };
    const out = {} as Record<Skill, number>;
    for (const k of Object.keys(c.skills) as Skill[]) out[k] = Math.round(Math.max(25, Math.min(95, c.skills[k] + 7 * new Rng(mixSeed(s.seed, c.id, k, "coach-read")).gauss(0, 1))));
    return out;
  }

  /** Hire a coordinator for your staff (whoever holds the job is let go, and paid what's left of his deal). */
  hireCoach(role: Role, coachId: number): void {
    const s = this.state, co = s.coaching, me = s.user_team_id;
    if (!co || me == null) throw new Error("no team");
    if (role === "HC") throw new Error("you are the head coach");
    const pick = this.staffCandidates(role).find((x) => x.coach.id === coachId);
    if (!pick) throw new Error("that coach isn't available for this job");
    const job = this.jobs().get(me)!, sitting = co.coaches.find((c) => c.team_id === me && c.role === role);
    const after = staffPay(co, me) - (sitting?.salary ?? 0) + pick.ask;
    if (after > Math.max(staffBudget(job), staffPay(co, me))) throw new Error(`your athletic director won't go past ${money(staffBudget(job))} a year for the staff`);
    const from = pick.coach.team_id, fromRole = pick.coach.role;
    hire(co, this.marketCtx(s.date, null), pick.coach, me, role, { since: this.nextSince() });
    // A school you hired from fills the job at once outside the carousel.
    if (from != null && fromRole && !co.open) this.fillNow(from, fromRole);
    this.staffCache.clear();
  }

  /** Let one of your coordinators go (the school pays out most of his contract). */
  fireCoach(role: Role): void {
    const s = this.state, co = s.coaching, me = s.user_team_id;
    if (!co || me == null || role === "HC") throw new Error("no such coach");
    const c = co.coaches.find((x) => x.team_id === me && x.role === role);
    if (!c) throw new Error(`you have no ${ROLE_NAMES[role].toLowerCase()}`);
    release(co, this.marketCtx(s.date, null), c, "fired");
    this.staffCache.clear();
  }

  // ---- money -------------------------------------------------------------------------------------
  /** A power program's roster budget this year (revenue share and NIL), from The Athletic's 2026 estimates. */
  private rosterBudget(t: Team): number | null {
    const rb = this.seed.finances?.[t.id]?.roster_budget;
    return rb ? Math.round(rb * rosterBudgetYear(this.state.year) / 10_000) * 10_000 : null;
  }

  /** What a school's boosters put into its football roster this year, before any of it goes to the retention fund: a normal year's, moved by its fortune. */
  private boosters(t: Team): number {
    const rb = this.rosterBudget(t);
    const base = collectiveBase(t, rb ? { budget: rb, pool: footballPool(t, this.state.year, this.seed.finances?.[t.id]?.roster_budget) } : null);
    return Math.round(base * this.fortune(t.id).donors / 10_000) * 10_000;
  }

  /** A program's fortune: how its past seasons have moved its crowds, its donors and its AD's backing (1 = as expected). */
  fortune(teamId: number): Fortune {
    return this.state.fortunes?.[teamId] ?? NEUTRAL;
  }

  /** Football's revenue-share budget in `year` with the AD's backing: more after football beats its budget, never past the cap. */
  private adPool(t: Team, year: number, ad = this.fortune(t.id).ad): number {
    const base = footballPool(t, year, this.seed.finances?.[t.id]?.roster_budget);
    return Math.round(Math.min(revenueCap(year) * FOOTBALL_SHARE, base * ad) / 10_000) * 10_000;
  }

  /**
   * Every school's football revenue-share budget, and the contracts its athletic department has signed.
   * Under the Protect College Sports Act the athletic department also runs a retention fund, paid for with
   * booster money that used to go through the collective (up to football's share of $22.5M).
   */
  startMoney(): void {
    const s = this.state;
    s.pools = {};
    s.retention = {};
    s.contracts = {};
    for (const t of this.teams) {
      const pool = this.adPool(t, s.year);
      if (!pool) continue;
      s.pools[t.id] = pool;
      const ret = s.settings.pcsa ? Math.round(Math.min(RETENTION_FUND * FOOTBALL_SHARE, 0.6 * this.boosters(t)) / 10_000) * 10_000 : 0;
      if (ret) s.retention[t.id] = ret;
      Object.assign(s.contracts, aiContracts(this.roster(t.id), pool, s.year, ret, (p) => this.returningHere(p)));
    }
  }

  /** A team's revenue-share payroll this year (retention fund included). */
  payroll(teamId: number): number {
    const s = this.state;
    return this.roster(teamId).reduce((a, p) => a + (activeContract(s.contracts?.[p.id], s.year)?.amount ?? 0), 0);
  }

  /** What a team has paid from its retention fund this year. */
  private retentionPaid(teamId: number): number {
    const s = this.state;
    return this.roster(teamId).reduce((a, p) => a + (activeContract(s.contracts?.[p.id], s.year)?.retention ?? 0), 0);
  }

  /** A team's NIL deals this year. */
  private nilPaid(teamId: number): number {
    const s = this.state;
    return this.roster(teamId).reduce((a, p) => a + (s.nil?.[p.id]?.amount ?? 0), 0);
  }

  /**
   * A team's roster budget: the athletic department's revenue share (and retention fund) and the
   * collective's money, one pool its head coach spends; what's signed and what's left.
   */
  rosterPool(teamId: number): { revenue_share: number; retention: number; collective: number; total: number; signed: number; room: number } | null {
    const s = this.state, pool = s.pools?.[teamId];
    if (!pool) return null;
    const retention = s.retention?.[teamId] ?? 0, nil = this.nilPaid(teamId);
    const collective = nil + (s.collectives?.[teamId]?.reserve ?? 0);
    const total = pool + retention + collective, signed = this.payroll(teamId) + nil;
    return { revenue_share: pool, retention, collective, total, signed, room: total - signed };
  }

  /**
   * Pay one of your players `amount` a year (0 ends his deal). It comes out of your one roster pool: the
   * revenue share first, then the retention fund for a player who has completed a season with you, then
   * the collective. Revenue share runs `years` seasons (up to his eligibility); the collective's part is
   * a yearly NIL deal, and it has to pass the fair-market-value review.
   */
  setContract(pid: number, amount: number, years: number): void {
    const s = this.state, me = s.user_team_id;
    const p = this.playerById.get(pid);
    if (me == null || !p || p.team_id !== me) throw new Error("you can only sign your own players");
    const cur = activeContract(s.contracts?.[pid], s.year), curNil = s.nil?.[pid]?.amount ?? 0;
    const c = s.collectives?.[me];
    const contracts = { ...s.contracts }, nil = { ...s.nil };
    const setNil = (x: number) => {
      if (c) c.reserve = Math.round(c.reserve + curNil - x);
      if (x > 0) nil[pid] = { amount: x, status: "approved", date: s.date }; else delete nil[pid];
      s.nil = nil;
    };
    if (amount <= 0) { delete contracts[pid]; s.contracts = contracts; setNil(0); return; }
    if (years > eligibilityLeft(p)) throw new Error(`${playerName(p)} has ${eligibilityLeft(p)} season(s) of eligibility left`);
    const k = (x: number) => `$${Math.round(x / 1000).toLocaleString("en-US")}K`;
    // A multi-year deal locks him in, so he has to want it: most players would rather sign for a year.
    if (years > 1 && !(cur?.locked && cur.start + cur.years >= s.year + years && amount >= dealAmount(cur))) {
      const w = persona(s.seed, pid), most = Math.min(maxYears(w), eligibilityLeft(p));
      if (years > most) throw new Error(most === 1 ? `${playerName(p)} wants a one-year deal so he can test the market again` : `${playerName(p)} will sign for up to ${most} seasons`);
      const walk = payFor(this.stayContext(p, amount), w, COMMIT);
      if (walk == null) throw new Error(`${playerName(p)} won't commit past this season for money alone`);
      const need = Math.max(askFor(walk, w, years), Math.round(this.value(pid) * 0.5));
      if (amount < need) throw new Error(`to sign for ${years} seasons ${playerName(p)} wants at least ${k(need)} a year`);
    }
    const baseRoom = Math.max(0, (s.pools?.[me] ?? 0) - (this.payroll(me) - this.retentionPaid(me)) + (cur ? cur.amount - (cur.retention ?? 0) : 0));
    const retRoom = this.returningHere(p) ? Math.max(0, (s.retention?.[me] ?? 0) - this.retentionPaid(me) + (cur?.retention ?? 0)) : 0;
    const nilRoom = (c?.reserve ?? 0) + curNil;
    const fromBase = Math.min(amount, baseRoom), fromRet = Math.min(amount - fromBase, retRoom), fromNil = amount - fromBase - fromRet;
    if (fromNil > nilRoom) throw new Error(`that is over your roster budget: ${k(baseRoom + retRoom + nilRoom)} left for him`);
    const top = fmvCeiling(this.value(pid), !!s.settings.pcsa);
    if (fromNil > top) throw new Error(`the fair-market-value review would cut his NIL deal to ${k(top)}: offer at most ${k(fromBase + fromRet + top)}`);
    if (fromBase + fromRet > 0 || years > 1) contracts[pid] = { amount: fromBase + fromRet, years, start: s.year, ...(fromRet ? { retention: fromRet } : {}), ...(years > 1 ? { locked: true, total: amount } : {}) };
    else delete contracts[pid];
    s.contracts = contracts;
    setNil(fromNil);
  }

  /**
   * What one of your players wants to sign for, by length (OOTP-style): a one-year change is anything that
   * isn't a pay cut; a longer deal locks him in, so he wants at least the least he'd commit for at that
   * length (his premium per extra season on top), half his value, and no less than he makes now. Null: he
   * won't sign that long (or not for money alone).
   */
  contractDemand(pid: number): { years: number; amount: number | null; why?: string }[] {
    const s = this.state, p = this.playerById.get(pid);
    if (!p) return [];
    const w = persona(s.seed, pid), pay = this.pay(pid), most = Math.min(maxYears(w), eligibilityLeft(p));
    const out: { years: number; amount: number | null; why?: string }[] = [{ years: 1, amount: pay }];
    let walk: number | null | undefined;
    for (let y = 2; y <= eligibilityLeft(p); y++) {
      if (y > most) { out.push({ years: y, amount: null, why: most === 1 ? "wants one-year deals so he can test the market" : `will sign for up to ${most} seasons` }); continue; }
      walk ??= payFor(this.stayContext(p, pay), w, COMMIT);
      if (walk == null) { out.push({ years: y, amount: null, why: "won't commit past this season for money alone" }); continue; }
      out.push({ years: y, amount: roundPay(Math.max(askFor(walk, w, y), this.value(pid) * 0.5, pay)) });
    }
    return out;
  }

  /** Offer one of your players a deal: he answers in a day or two (your inbox). */
  contractOffer(pid: number, amount: number, years: number): void {
    const s = this.state, p = this.playerById.get(pid), me = s.user_team_id;
    if (me == null || !p || p.team_id !== me) throw new Error("you can only make offers to your own players");
    if (s.contract_offers?.[pid]) throw new Error("he hasn't answered your last offer yet");
    if (!(amount > 0)) throw new Error("make an offer above zero (or end his deal)");
    if (years < 1 || years > eligibilityLeft(p)) throw new Error(`${playerName(p)} has ${eligibilityLeft(p)} season(s) of eligibility left`);
    const pool = this.rosterPool(me);
    if (pool && amount - this.pay(pid) > pool.room) throw new Error(`that's over your roster budget: ${money(Math.max(0, pool.room + this.pay(pid)))} left for him`);
    const n = Object.keys(s.contract_offers ?? {}).length + years;
    s.contract_offers = { ...s.contract_offers, [pid]: { amount: roundPay(amount), years, made: s.date, answer: addDays(s.date, answerDays(s.seed, pid, 101 + n)) } };
  }

  /** Take back an offer he hasn't answered. */
  withdrawOffer(pid: number): void {
    const s = this.state;
    if (!s.contract_offers?.[pid]) throw new Error("no offer to him is waiting");
    const o = { ...s.contract_offers }; delete o[pid];
    s.contract_offers = Object.keys(o).length ? o : undefined;
  }

  /** Players answer your offers that have waited a day or two: they sign at or above what they want, else they name it. */
  private contractAnswers(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    const offers = { ...s.contract_offers };
    for (const [id, o] of Object.entries(offers)) {
      if (o.answer > date) continue;
      const pid = Number(id), p = this.playerById.get(pid);
      delete offers[pid];
      if (!p || p.team_id !== me) continue;
      const name = playerName(p), len = `${o.years} season${o.years === 1 ? "" : "s"}`;
      const d = this.contractDemand(pid).find((x) => x.years === o.years);
      const link = [{ label: "Payroll", to: "payroll" }, { label: "His page", to: `player/${pid}` }];
      if (!d || d.amount == null) {
        this.mail({ date, category: "contracts", from: name, subject: `${p.pos} ${name} turns down your offer`, body: `He ${d?.why ?? "won't sign that deal"}.`, links: link, urgent: true }, rep);
        continue;
      }
      if (o.amount >= d.amount) {
        try {
          this.setContract(pid, o.amount, o.years);
          this.mail({ date, category: "contracts", from: name, subject: `${p.pos} ${name} accepts: ${money(o.amount)} a year for ${len}`,
            body: o.years > 1 ? `He's locked in through ${s.year + o.years - 1}: no renegotiating until it ends.` : "His new pay starts now.", links: link }, rep);
        } catch (e) {
          this.mail({ date, category: "contracts", from: "Your staff", subject: `The deal with ${p.pos} ${name} fell through`, body: `He said yes, but ${(e as Error).message}.`, links: link, urgent: true }, rep);
        }
        continue;
      }
      const insulted = o.amount < 0.7 * d.amount;
      if (insulted) s.player_morale = { ...s.player_morale, [pid]: Math.round(((s.player_morale?.[pid] ?? 0) - 0.2) * 100) / 100 };
      this.mail({ date, category: "contracts", from: name, subject: `${p.pos} ${name} turns down ${money(o.amount)} for ${len}`,
        body: `He wants ${money(d.amount)} a year for ${len}.${insulted ? " The offer insulted him, and it's hurt his mood." : ""} Make another offer on the Payroll screen.`, links: link, urgent: true }, rep);
    }
    s.contract_offers = Object.keys(offers).length ? offers : undefined;
  }

  /** He has completed a season at his school (the retention fund can pay him): not a freshman, not a first-year transfer. */
  returningHere(p: RatedPlayer): boolean {
    return returning(p) && this.state.arrived?.[p.id] !== this.state.year;
  }

  /**
   * The new season's opening deals for your team: the ones you signed (renewals, transfers, multi-year deals),
   * paid from revenue share, then the retention fund, then your collective; the rest of the roster gets the
   * revenue share left, by value. Your collective spends nothing else on its own.
   */
  applyDeals(deals: Record<number, { amount: number; years: number; locked?: boolean }>): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || !s.pools?.[me]) return;
    const roster = this.roster(me), c = s.collectives?.[me];
    const contracts = { ...s.contracts }, nil = { ...s.nil };
    for (const p of roster) { delete contracts[p.id]; delete nil[p.id]; }
    if (c) c.reserve = c.base;
    let base = s.pools[me], ret = s.retention?.[me] ?? 0;
    const signed = roster.filter((p) => deals[p.id]?.amount > 0).sort((a, b) => deals[b.id].amount - deals[a.id].amount || a.id - b.id);
    for (const p of signed) {
      const d = deals[p.id];
      const fromBase = Math.min(d.amount, base); base -= fromBase;
      const fromRet = this.returningHere(p) ? Math.min(d.amount - fromBase, ret) : 0; ret -= fromRet;
      const fromNil = Math.min(d.amount - fromBase - fromRet, c?.reserve ?? 0, fmvCeiling(this.value(p.id), !!s.settings.pcsa));
      const years = Math.max(1, Math.min(d.years, eligibilityLeft(p)));
      // A locked deal stays locked while it runs (its NIL part with it).
      const locked = d.locked && years > 1 ? { locked: true, total: d.amount } : {};
      if (fromBase + fromRet > 0 || d.locked) contracts[p.id] = { amount: fromBase + fromRet, years, start: s.year, ...(fromRet ? { retention: fromRet } : {}), ...locked };
      if (fromNil > 0 && c) { nil[p.id] = { amount: fromNil, status: "approved", date: s.date }; c.reserve -= fromNil; }
    }
    const rest = roster.filter((p) => !deals[p.id]);
    Object.assign(contracts, aiContracts(rest, Math.max(0, base), s.year));
    s.contracts = contracts;
    s.nil = nil;
  }

  /** Each collective's opening deals: most of its year's money, held back a little for the season. */
  startCollectives(): void {
    const s = this.state;
    s.collectives = {};
    s.nil = {};
    for (const t of this.teams) {
      // Under the Protect College Sports Act the retention fund is booster money the school now pays itself.
      const boosters = this.boosters(t);
      if (!boosters) continue;
      // A donor campaign for a facility takes some of what boosters would have given the collective.
      const base = Math.max(0, boosters - (s.retention?.[t.id] ?? 0) - this.campaignDrag(t.id, s.year));
      s.collectives[t.id] = { base, reserve: base };
      this.collectiveRound(t.id, base * (1 - RESERVE), s.date);
    }
  }

  /** A player's pay this year: his revenue-share contract and his NIL deal. */
  pay(pid: number): number {
    const s = this.state;
    return (activeContract(s.contracts?.[pid], s.year)?.amount ?? 0) + (s.nil?.[pid]?.amount ?? 0);
  }

  /** A collective spends up to `budget` of its reserve; every deal goes through the review. */
  private collectiveRound(teamId: number, budget: number, date: ISODate): void {
    const s = this.state, c = s.collectives![teamId];
    const starters = new Set(Object.values(this.depthChart(teamId)).map((ids) => ids[0]));
    const targets: NilTarget[] = this.roster(teamId).map((p) => ({ id: p.id, pos: p.pos, value: playerValue(p), pay: this.pay(p.id), starter: starters.has(p.id) }));
    const value = new Map(targets.map((x) => [x.id, x.value]));
    for (const [pid, extra] of spend(targets, Math.min(budget, c.reserve), c.focus)) {
      const was = s.nil![pid]?.amount ?? 0;
      const d = review(was + extra, value.get(pid)!, date, !!s.settings.pcsa);
      // What the review cut stays with the collective.
      if (d.amount <= was) continue;
      c.reserve -= d.amount - was;
      s.nil![pid] = d;
    }
    c.reserve = Math.max(0, Math.round(c.reserve));
  }

  /** Donors give more when a team wins beyond expectations and less when it loses. */
  private donors(g: Game, homeChance: number): void {
    const s = this.state;
    const homeWon = g.home_score! > g.away_score! ? 1 : 0;
    for (const [id, d, chance] of [[g.home_id, homeWon - homeChance, homeChance], [g.away_id, homeChance - homeWon, 1 - homeChance]] as const) {
      const c = s.collectives?.[id];
      if (c) c.reserve = Math.max(0, Math.round(c.reserve + 0.04 * c.base * d));
      // The wins a season was expected to bring, for next year's donors.
      if (s.budgets?.[id]) {
        const f = (s.fortunes ??= {})[id] ?? { ...NEUTRAL };
        s.fortunes[id] = { ...f, exp: Math.round(((f.exp ?? 0) + chance) * 1000) / 1000 };
      }
    }
  }

  /** On the first of each month in the season every collective spends what it has on hand. */
  private collectiveMonth(today: ISODate): void {
    const s = this.state;
    if (!s.collectives || today.slice(8) !== "01" || !["09", "10", "11", "12"].includes(today.slice(5, 7))) return;
    for (const t of this.teams) {
      const c = s.collectives[t.id];
      // Your collective's money is yours to spend (setContract); it doesn't make deals on its own.
      if (t.id === s.user_team_id) continue;
      if (c && c.reserve >= 0.05 * c.base) this.collectiveRound(t.id, c.reserve - 0.05 * c.base, today);
    }
  }

  /** Ask your collective to spend on these positions (at most three; empty for no preference). */
  setCollectiveFocus(focus: Pos[]): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || !s.collectives?.[me]) throw new Error("your school has no collective");
    if (focus.length > FOCUS_MAX) throw new Error(`ask for at most ${FOCUS_MAX} positions`);
    s.collectives = { ...s.collectives, [me]: { ...s.collectives[me], focus: [...new Set(focus)] } };
  }

  /**
   * Once a week every player weighs his pay and playing time, and his morale moves toward how he feels
   * now. Each unit's chemistry follows its starters' morale, measured against the rest of the country.
   */
  weeklyMorale(): void {
    const s = this.state;
    const pm = (s.player_morale ??= {});
    const raw = new Map<number, Record<Unit, number>>();
    const hurt = new Set(s.injuries!.filter((i) => i.back > s.date).map((i) => i.pid));
    // Once a team's season is over its players' morale holds (and its chemistry no longer matters) until next year.
    const playing = new Set(s.games.filter((g) => g.status !== "final").flatMap((g) => [g.home_id, g.away_id]));
    const done = !!s.team_mood && s.games.some((g) => g.status === "final");
    const frozen: Record<number, Record<Unit, number>> = {};
    for (const t of this.teams) {
      const roster = this.roster(t.id);
      if (t.level !== "fbs" || !roster.length || !s.pools?.[t.id]) continue;
      if (done && !playing.has(t.id)) { if (s.team_mood![t.id]) frozen[t.id] = s.team_mood![t.id]; continue; }
      const depth = this.depthChart(t.id);
      const starters = new Set(Object.values(depth).map((ids) => ids[0]).filter((x) => x != null));
      // A player expects to start when his value ranks among his position's starting jobs.
      const jobs = new Map<string, number>();
      for (const id of starters) { const p = this.playerById.get(id); if (p) jobs.set(p.pos, (jobs.get(p.pos) ?? 0) + 1); }
      const byPos = new Map<string, RatedPlayer[]>();
      for (const p of roster) { const g = byPos.get(p.pos); if (g) g.push(p); else byPos.set(p.pos, [p]); }
      const expects = new Set<number>();
      for (const [pos, n] of jobs) byPos.get(pos)?.sort((a, b) => this.value(b.id) - this.value(a.id) || a.id - b.id).slice(0, n).forEach((p) => expects.add(p.id));
      const { mood, room } = moods(roster.map((p) => ({ id: p.id, pos: p.pos, unit: unitOf(p.pos), value: this.value(p.id), pay: this.pay(p.id),
        starter: starters.has(p.id), expects_start: expects.has(p.id) && !hurt.has(p.id) })));
      for (const [id, m] of mood) pm[id] = Math.round((0.7 * (pm[id] ?? 0) + 0.3 * m) * 100) / 100 + 0;
      const unit = (slots: readonly string[]) => slots.map((k) => depth[k as keyof DepthChart]?.[0]).filter((x): x is number => x != null).map((id) => pm[id] ?? 0);
      raw.set(t.id, { off: unitMood(unit(OFFENSE_FIELD), room.off), def: unitMood(unit(DEFENSE_FIELD), room.def) });
    }
    // Against the rest of the country, so the scouted view stays unbiased.
    const avg = (u: Unit) => [...raw.values()].reduce((a, x) => a + x[u], 0) / Math.max(1, raw.size);
    const ao = avg("off"), ad = avg("def");
    const tm: Record<number, Record<Unit, number>> = { ...frozen };
    for (const [id, x] of raw) tm[id] = { off: Math.round((x.off - ao) * 100) / 100 + 0, def: Math.round((x.def - ad) * 100) / 100 + 0 };
    s.team_mood = tm;
  }

  // ---- budget, game day and facilities ------------------------------------------------------------
  /** Every FBS school's budget inputs and facilities. */
  startFinance(fin?: SeedBundle["finances"]): void {
    const s = this.state;
    s.budgets = {};
    s.facilities = {};
    s.projects ??= [];
    s.ticket_prices ??= {};
    s.gate ??= {};
    for (const t of this.teams) {
      const b = budgetFor(t, fin?.[t.id]);
      const f = facilitiesFor(t, s.seed);
      if (b) {
        // Past seasons move the usual crowd and booster giving (licensing and sponsors follow halfway).
        const k = this.fortune(t.id);
        b.attendance = Math.round(Math.min(b.capacity, b.attendance * k.fans));
        b.fixed.donors = Math.round(b.fixed.donors * k.donors / 10_000) * 10_000;
        b.fixed.other = Math.round(b.fixed.other * (1 + 0.5 * (k.donors - 1)) / 10_000) * 10_000;
        s.budgets[t.id] = b;
      }
      if (f) s.facilities[t.id] = f;
    }
    // What football's revenue was budgeted at as the year opened (beating it earns the AD's backing).
    const fortunes = { ...s.fortunes };
    for (const id of Object.keys(s.budgets).map(Number)) {
      const v = this.budget(id)!;
      fortunes[id] = { ...this.fortune(id), plan: Object.values(v.revenue).reduce((a, x) => a + x, 0) - v.revenue.postseason };
    }
    s.fortunes = fortunes;
  }

  /**
   * Postseason money this fiscal year: the school's own share of the games it played, and its share of what
   * its conference pooled from every member's games.
   */
  postseasonMoney(teamId: number): { own: number; pooled: number } {
    const s = this.state, conf = this.team(teamId).conference;
    let own = 0, pot = 0;
    for (const g of s.games) {
      if (g.status !== "final" || (g.kind !== "bowl" && g.kind !== "playoff")) continue;
      const game = { kind: g.kind, name: g.kind === "bowl" ? g.label : g.venue, from_end: s.playoff && g.round != null ? s.playoff.rounds - g.round : g.title ? 0 : undefined };
      for (const id of [g.home_id, g.away_id]) {
        const c = this.teamById.get(id)?.conference;
        if (c == null) continue;
        const p = postseasonPayout(game, c);
        if (id === teamId) own += p.school;
        if (c === conf) pot += p.pooled;
      }
    }
    const members = this.teams.filter((t) => t.level === "fbs" && t.conference === conf).length;
    return { own, pooled: Math.round(pot / Math.max(1, members)) };
  }

  /**
   * A program's season so far, as its money sees it. With `rest`, the regular-season games still to play
   * count at their chances (a projection of the whole season).
   */
  outcome(teamId: number, rest = false): SeasonOutcome {
    const s = this.state, t = this.team(teamId);
    let wins = 0, losses = 0, cfp = 0, cfpWins = 0, bowl = false, bowlWon = false, title = false, ahead = 0;
    for (const g of s.games) {
      if (g.home_id !== teamId && g.away_id !== teamId) continue;
      if (g.status !== "final") {
        if (rest && g.kind === "regular") {
          const p = winChance((s.power[g.home_id] ?? 0) - (s.power[g.away_id] ?? 0) + (g.neutral ? 0 : s.settings.home_field_points));
          const mine = g.home_id === teamId ? p : 1 - p;
          wins += mine; losses += 1 - mine; ahead += mine;
        }
        continue;
      }
      const won = (g.home_id === teamId) === (g.home_score! > g.away_score!);
      if (won) wins++; else losses++;
      if (g.kind === "playoff") { cfp++; if (won) cfpWins++; if (won && g.title) title = true; }
      if (g.kind === "bowl") { bowl = true; bowlWon ||= won; }
    }
    const f = this.fortune(teamId), v = this.budget(teamId);
    const revenue = v ? Object.values(v.revenue).reduce((a, x) => a + x, 0) : 0;
    const played = wins + losses - (rest ? s.games.filter((g) => g.status !== "final" && g.kind === "regular" && (g.home_id === teamId || g.away_id === teamId)).length : 0);
    return { wins, losses, exp: (f.exp ?? played / 2) + ahead, cfp, cfp_wins: cfpWins, title, bowl, bowl_won: bowlWon,
      power: isPower(t), revenue_ratio: f.plan && revenue ? revenue / f.plan : 1 };
  }

  /** Next year's fortune if the season ended today. */
  projectedFortune(teamId: number): Fortune {
    return nextFortune(this.fortune(teamId), this.outcome(teamId, true));
  }

  /** A program's budget class from its roster budget this year. */
  budgetClassOf(teamId: number): { key: string; label: string } | null {
    const p = this.rosterPool(teamId);
    if (!p) return null;
    return budgetClass(p.revenue_share + p.retention + (this.state.collectives?.[teamId]?.base ?? 0), rosterBudgetYear(this.state.year));
  }

  private homeGames(teamId: number): Game[] {
    return this.state.games.filter((g) => g.home_id === teamId && !g.neutral && (g.kind === "regular" || g.kind === "playoff"));
  }

  /** A home game's ticket price: yours if you set one, otherwise the school's usual price. */
  ticketPrice(g: Game): number {
    return this.state.ticket_prices?.[g.id] ?? this.state.budgets?.[g.home_id]?.price ?? 0;
  }

  /** The crowd a home game would draw at a price, from how the season is going today. */
  expectedCrowd(g: Game, price = this.ticketPrice(g)): number {
    const s = this.state, b = s.budgets?.[g.home_id];
    if (!b) return 0;
    let w = 0, n = 0;
    for (const x of s.games) {
      if (x.status !== "final" || (x.home_id !== g.home_id && x.away_id !== g.home_id)) continue;
      n++;
      if ((x.home_id === g.home_id) === (x.home_score! > x.away_score!)) w++;
    }
    return crowd(b, { price, winPct: n ? w / n : null, ranked: this.rankOf(g.home_id) != null, oppRanked: this.rankOf(g.away_id) != null,
      oppFcs: this.teamById.get(g.away_id)?.level === "fcs", prestige: this.team(g.home_id).prestige ?? 0 });
  }

  /** Set your ticket price for one of your home games not yet played (null for the usual price). */
  setTicketPrice(gameId: number, price: number | null): void {
    const s = this.state, g = s.games.find((x) => x.id === gameId);
    if (!g || g.home_id !== s.user_team_id || g.neutral || g.status === "final") throw new Error("you can only price your own home games still to play");
    const tp = { ...s.ticket_prices };
    if (price == null) delete tp[gameId];
    else tp[gameId] = price;
    s.ticket_prices = tp;
  }

  private recordGate(g: Game): void {
    const s = this.state;
    if (g.neutral || !s.budgets?.[g.home_id] || (g.kind !== "regular" && g.kind !== "playoff")) return;
    const price = this.ticketPrice(g), attendance = this.expectedCrowd(g, price);
    (s.gate ??= {})[g.id] = { attendance, price, revenue: attendance * price };
  }

  /** A school's budget for this fiscal year: what's come in and gone out, and what's still to come. */
  budget(teamId: number): BudgetView | null {
    const s = this.state, b = s.budgets?.[teamId];
    if (!b) return null;
    let tickets = 0;
    for (const g of this.homeGames(teamId)) tickets += g.status === "final" ? s.gate?.[g.id]?.revenue ?? 0 : this.expectedCrowd(g) * this.ticketPrice(g);
    const pm = this.postseasonMoney(teamId), postseason = pm.own + pm.pooled;
    // The retention fund is booster money given to the school instead of the collective.
    const revenue = { media: b.fixed.media, tickets: Math.round(tickets), donors: b.fixed.donors + (s.retention?.[teamId] ?? 0), support: b.fixed.support ?? 0, other: b.fixed.other, postseason };
    // Your scouts (regional scouts and evaluation trips) come out of the operations budget.
    const scouting = teamId === s.user_team_id ? s.recruiting?.user.spend ?? 0 : 0;
    const expenses = { revenue_share: this.payroll(teamId), coaches: b.fixed.coaches, operations: b.fixed.operations + scouting, facilities: Math.round(b.fixed.facilities + this.facilityPaid(teamId, s.year)),
      one_time: (s.charges ?? []).filter((c) => c.team_id === teamId && c.year === s.year).reduce((a, c) => a + c.amount, 0) };
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, x) => a + x, 0);
    return { revenue, expenses, surplus: sum(revenue) - sum(expenses), source: b.source };
  }

  // ---- facility projects (facilities.ts) ----------------------------------------------------------
  private baseFacilities = new Map<number, Facilities | null>();
  /** A school's facilities the day the league started (already part of its players' ratings). */
  facilityBase(teamId: number): Facilities | undefined {
    if (!this.baseFacilities.has(teamId)) this.baseFacilities.set(teamId, facilitiesFor(this.team(teamId), this.state.seed));
    return this.baseFacilities.get(teamId) ?? undefined;
  }
  /** A school's facilities as they play today (an area whose new building is going up plays a grade lower). */
  facilityGrades(teamId: number): Facilities | undefined {
    const s = this.state;
    return effectiveGrades(s.facilities?.[teamId], (s.projects ?? []).filter((p) => p.team_id === teamId));
  }
  /** What a school's facilities do now against the day the league started. */
  facilityEffect(teamId: number) {
    return facilityEffects(this.facilityGrades(teamId), this.facilityBase(teamId));
  }
  /** Football's facility payments in a fiscal year: scheduled payments, and projects from before financing (cost over their years). */
  facilityPaid(teamId: number, year: number): number {
    const s = this.state;
    const sched = (s.facility_payments ?? []).filter((x) => x.team_id === teamId && x.year === year).reduce((a, x) => a + x.amount, 0);
    const legacy = (s.projects ?? []).filter((p) => p.team_id === teamId && !p.financing && (year === s.year || p.done > `${year}-08-01`)).reduce((a, p) => a + p.cost / p.years, 0);
    return Math.round(sched + legacy);
  }
  /** Booster money a donor campaign takes from a school's collective in a year. */
  campaignDrag(teamId: number, year: number): number {
    return (this.state.facility_drag ?? []).filter((x) => x.team_id === teamId && x.year === year).reduce((a, x) => a + x.amount, 0);
  }

  /**
   * How your AD weighs a project: football's surplus this year must cover this year's payment, football's
   * facility payments in any year can't pass 15% of its revenue, no more than two projects at once, and a
   * donor campaign needs boosters who are in the mood to give.
   */
  private adChecks(teamId: number, opt: ReturnType<typeof projectOption>, financing: Financing) {
    const s = this.state, b = this.budget(teamId)!, f = opt.financing.find((x) => x.financing === financing)!;
    const $ = (x: number) => `$${(x / 1e6).toFixed(1)}M`;
    const revenue = Object.values(b.revenue).reduce((a, x) => a + x, 0);
    const first = f.payments.find((p) => p.year === s.year)?.amount ?? 0;
    const years = [...new Set([...f.payments.map((p) => p.year), ...(s.facility_payments ?? []).filter((x) => x.team_id === teamId).map((x) => x.year)])];
    const peak = Math.max(0, ...years.map((y) => this.facilityPaid(teamId, y) + (f.payments.find((p) => p.year === y)?.amount ?? 0)));
    const underway = (s.projects ?? []).filter((p) => p.team_id === teamId).length;
    const donors = this.fortune(teamId).donors;
    const checks = [
      { ok: b.surplus >= first, text: `This year's payment (${$(first)}) against football's surplus (${$(b.surplus)})` },
      { ok: peak <= 0.15 * revenue, text: `Facility payments at their peak (${$(peak)} a year) against 15% of football's revenue (${$(0.15 * revenue)})` },
      { ok: underway < 2, text: `Projects already underway: ${underway} (the AD runs two at a time)` },
    ];
    if (financing === "donors") checks.push({ ok: donors >= 0.85, text: `Booster mood: ${donors >= 1 ? "+" : ""}${Math.round((donors - 1) * 100)}% (a campaign needs donors no more than 15% below normal)` });
    return { ok: checks.every((c) => c.ok), checks };
  }

  /**
   * Every project you could take to your AD: for each area not already being built, a renovation and (when
   * two grades are open) a new building, each with its estimate and range, what every kind of financing costs
   * football by year, what your AD would say today, football's surplus with and without it, and what it does
   * on the field.
   */
  facilityPlans(teamId: number) {
    const s = this.state, t = this.team(teamId), now = s.facilities?.[teamId];
    if (!now) return null;
    const base = this.facilityBase(teamId) ?? now, power = isPower(t), donors = this.fortune(teamId).donors;
    const proj = this.budgetProjection(teamId, 4)!;
    const building = new Set((s.projects ?? []).filter((p) => p.team_id === teamId).map((p) => p.area));
    const asked = new Set((s.facility_asks ?? []).map((a) => a.area));
    const conf = this.teams.filter((x) => x.level === "fbs" && x.conference === t.conference && s.facilities?.[x.id]);
    const avg = (ids: Team[], a: Area) => Math.round(ids.reduce((x, y) => x + s.facilities![y.id][a], 0) / Math.max(1, ids.length) * 10) / 10;
    const fbs = this.teams.filter((x) => x.level === "fbs" && s.facilities?.[x.id]);
    const areas = (Object.keys(AREAS) as Area[]).map((area) => {
      const g = now[area];
      const options = teamId !== s.user_team_id || building.has(area) || asked.has(area) || g >= 5 ? [] : (["renovate", "build"] as const).filter((sc) => sc === "renovate" || g <= 3).map((scope) => {
        const opt = projectOption({ area, from: g, scope, power, prestige: t.prestige ?? 0, donors, year: s.year });
        const after = { ...now, [area]: opt.to };
        const during = scope === "build" ? { ...now, [area]: Math.max(1, g - 1) } : now;
        return {
          ...opt,
          financing: opt.financing.map((f) => ({ ...f, ad: this.adChecks(teamId, opt, f.financing),
            surplus: proj.map((l) => ({ year: l.year, without: l.surplus, with: l.surplus - (f.payments.find((p) => p.year === l.year)?.amount ?? 0) })) })),
          effect: effectSummary(now, after, base),
          during: scope === "build" ? effectSummary(now, during, base) : null,
        };
      });
      return { area, label: AREAS[area], grade: g, base: base[area], conference: avg(conf, area), national: avg(fbs, area),
        rank: 1 + fbs.filter((x) => s.facilities![x.id][area] > g).length, of: fbs.length, options };
    });
    return {
      areas, effects: facilityEffects(this.facilityGrades(teamId), base),
      projects: (s.projects ?? []).filter((p) => p.team_id === teamId),
      asks: teamId === s.user_team_id ? s.facility_asks ?? [] : [],
      payments: (s.facility_payments ?? []).filter((x) => x.team_id === teamId),
      drag: (s.facility_drag ?? []).filter((x) => x.team_id === teamId),
      scopes: SCOPES, financing: FINANCING,
    };
  }

  /** Take a project to your athletic director; the AD answers in one to three days. */
  proposeProject(area: Area, scope: Scope, financing: Financing): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || !s.facilities?.[me]) throw new Error("your school has no facilities to upgrade");
    if (!Object.hasOwn(AREAS, area)) throw new Error(`unknown area ${area}`);
    if (!Object.hasOwn(SCOPES, scope) || !Object.hasOwn(FINANCING, financing)) throw new Error("unknown kind of project");
    const name = AREAS[area].toLowerCase();
    if ((s.projects ?? []).some((p) => p.team_id === me && p.area === area)) throw new Error(`the ${name} is already being upgraded`);
    if ((s.facility_asks ?? []).some((a) => a.area === area)) throw new Error(`your AD is still looking at the ${name} proposal`);
    const now = s.facilities[me][area];
    if (now >= 5) throw new Error(`the ${name} is already among the best in the country`);
    if (scope === "build" && now > 3) throw new Error(`the ${name} is one grade from the top: renovate it`);
    const days = 1 + (mixSeed(s.seed, s.date, area, "ad-answer") % 3);
    s.facility_asks = [...(s.facility_asks ?? []), { area, scope, financing, date: s.date, answer: addDays(s.date, days) }];
  }

  /** Your AD answers the proposals that have waited their day or three (a news item that reaches your inbox). */
  private facilityDay(today: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    if (!s.facility_asks?.length) return;
    const due = s.facility_asks.filter((a) => a.answer <= today);
    if (!due.length) return;
    s.facility_asks = s.facility_asks.filter((a) => a.answer > today);
    for (const a of due) {
      if (me == null || !s.facilities?.[me]) continue;
      const r = this.decideProject(me, a.area, a.scope, a.financing);
      rep.news.push(this.news(today, "facilities", r.headline, r.reason, [me]));
    }
  }

  private decideProject(me: number, area: Area, scope: Scope, financing: Financing): { approved: boolean; headline: string; reason: string } {
    const s = this.state, t = this.team(me), now = s.facilities![me][area];
    const c = s.career, ad = c ? `${c.ad.first} ${c.ad.last}` : "Your athletic director";
    const $ = (x: number) => `$${(x / 1e6).toFixed(1)}M`;
    const name = AREAS[area].toLowerCase(), what = `${scope === "build" ? "new" : "renovated"} ${name}`;
    const record = (approved: boolean, reason: string, headline: string) => {
      s.requests = [...(s.requests ?? []), { date: s.date, area, approved, reason, scope, financing }];
      return { approved, headline, reason };
    };
    if ((s.projects ?? []).some((p) => p.team_id === me && p.area === area) || now >= 5) return record(false, `The ${name} can't be upgraded now.`, `${ad} sets aside the ${name} proposal`);
    const opt = projectOption({ area, from: now, scope, power: isPower(t), prestige: t.prestige ?? 0, donors: this.fortune(me).donors, year: s.year });
    const v = this.adChecks(me, opt, financing);
    if (!v.ok) {
      const why = v.checks.filter((x) => !x.ok).map((x) => x.text).join("; ");
      return record(false, `${ad} turned down the ${what} (${$(opt.estimate)}, ${FINANCING[financing].label.toLowerCase()}): ${why}.`, `${ad} turns down the ${what}`);
    }
    // The real cost: the estimate, over or under (facilities.ts); payments follow the real cost.
    const k = overrun(s.seed, me, area, s.year, scope), cost = Math.round(opt.estimate * k / 10_000) * 10_000;
    const f = opt.financing.find((x) => x.financing === financing)!;
    const gift = financing === "donors" ? Math.round(cost * (f.share ?? 0) / 10_000) * 10_000 : 0;
    const pay = projectPayments(cost, opt.years, financing, s.year, gift);
    s.projects = [...(s.projects ?? []), { team_id: me, area, to: opt.to, cost, years: opt.years, start: s.date, done: opt.opens, scope, financing, from: now, estimate: opt.estimate, ...(gift ? { gift } : {}) }];
    s.facility_payments = [...(s.facility_payments ?? []), ...pay.map((p) => ({ team_id: me, year: p.year, amount: p.amount, label: `${AREAS[area]} (${FINANCING[financing].label.toLowerCase()})` }))];
    if (gift) {
      // Part of the gift is booster money the collective won't get while the campaign runs.
      const per = Math.round(gift * 0.3 / opt.years / 10_000) * 10_000;
      s.facility_drag = [...(s.facility_drag ?? []), ...Array.from({ length: opt.years }, (_, i) => ({ team_id: me, year: s.year + i, amount: per }))];
      const col = s.collectives?.[me];
      if (col) s.collectives = { ...s.collectives, [me]: { ...col, base: Math.max(0, col.base - per), reserve: Math.max(0, col.reserve - per) } };
    }
    const over = Math.round((k - 1) * 100);
    const money = financing === "bonds" ? `football pays ${$(bondPayment(cost))} a year for 20 years` : financing === "donors" ? `boosters give ${$(gift)} and football pays ${$(cost - gift)} over ${opt.years === 1 ? "a year" : `${opt.years} years`}` : `football pays it over ${opt.years === 1 ? "a year" : `${opt.years} years`}`;
    const reason = `${ad} approved a ${what} (grade ${opt.to}) for ${$(cost)}${over ? `, ${Math.abs(over)}% ${over > 0 ? "over" : "under"} the ${$(opt.estimate)} estimate` : ""}: ${money}. It opens in August ${opt.opens.slice(0, 4)}.` +
      (scope === "build" ? ` Until then the old ${name} is closed and the program makes do with a grade less.` : "");
    return record(true, reason, `${ad} approves a ${what}`);
  }

  private values = new Map<number, number>();
  /** A player's market value this year. */
  value(pid: number): number {
    let v = this.values.get(pid);
    if (v == null) { const p = this.playerById.get(pid); v = p ? playerValue(p) : 0; this.values.set(pid, v); }
    return v;
  }

  // ---- recruiting ------------------------------------------------------------------------------
  private recruitWeek?: RecruitWeek;
  private staffCache = new Map<number, StaffMember[]>();
  /** A school's coaching staff with their skills. */
  staff(teamId: number): StaffMember[] {
    let st = this.staffCache.get(teamId);
    if (!st) {
      const co = this.state.coaching;
      st = co ? staffRecs(co, teamId).map(toMember) : staffOf(this.state.seed, this.seed.coaches ?? [], this.team(teamId));
      this.staffCache.set(teamId, st);
    }
    return st;
  }
  private get week(): RecruitWeek { return (this.recruitWeek ??= new RecruitWeek(this.state.seed)); }
  private namePools(): { firsts: string[]; lasts: string[] } {
    const all = this.teams.flatMap((t) => this.roster(t.id));
    return { firsts: [...new Set(all.map((p) => p.first).filter(Boolean))].sort(), lasts: [...new Set(all.map((p) => p.last).filter(Boolean))].sort() };
  }
  /** Re-rates the service has made in this year by a date (spring, summer, after the season). */
  private rerateIndex(date: ISODate): number {
    const y = Number(date.slice(0, 4));
    return RERATE_DATES(y).filter((d) => d <= date).length;
  }

  /** Start recruiting: the real senior class and three generated classes behind it, rated by the service. */
  startRecruiting(): void {
    const s = this.state, rs = this.seed.recruiting;
    if (!rs) return;
    this.recruitRev++;
    const shape = classShape(rs), { firsts, lasts } = this.namePools();
    const ids = new Map(this.teams.map((t) => [t.school, t.id]));
    let next = 800_000_001;
    const prospects: Prospect[] = realClass({ seed: s.seed, rs, shape, teamIds: ids, date: s.date, firsts, lasts, startId: next });
    next += prospects.length;
    for (let cls = s.year + 2; cls <= s.year + 4; cls++) {
      const c = generateClass({ seed: s.seed, cls, year: s.year, n: rs.class_size, rs, shape, firsts, lasts, startId: next });
      next += c.length;
      prospects.push(...c);
    }
    // Each school's last three real classes set the range it recruits in.
    const classes: Record<string, number[][]> = {};
    for (const t of this.teams) classes[t.id] = [s.year - 2, s.year - 1, s.year].map((y) => rs.history.filter((h) => h.year === y && h.school === t.school).map((h) => h.rating ?? 0.75));
    const rerate = Math.min(3, this.rerateIndex(s.date));
    rateClasses(prospects, s.year, s.date, rerate, s.seed, rs.curve);
    s.recruiting = { prospects, next_id: next, classes, rerate, svc_v: 2, user: { auto: true, hours: {}, scout: [], regions: [], evals: {}, spend: 0, time: { ...SEASON_TIME }, board: [] } };
    this.seedFound();
    this.boardCommits();
  }

  /**
   * Leagues saved before the service rated freshmen, sophomores and every junior are re-rated, and a staff
   * that hasn't looked yet (or whose coach changed schools) knows what a new league's would.
   */
  upgradeRecruiting(): void {
    const s = this.state, st = s.recruiting;
    if (!st) return;
    if (st.svc_v !== 2) {
      this.recruitRev++;
      rateClasses(st.prospects, s.year, s.date, st.rerate, s.seed, this.seed.recruiting!.curve);
      st.svc_v = 2;
    }
    if (s.user_team_id != null && st.user.found_team !== s.user_team_id) this.seedFound();
    // ...and before your commits went on your big board.
    if (!st.user.board_added) this.boardCommits();
  }

  /** Each prospect's true potential against his class (class standard deviations above its average). */
  private classZ(date: ISODate): Map<number, number> {
    const st = this.state.recruiting!, by = new Map<number, number[]>(), out = new Map<number, number>();
    const tr = new Map(st.prospects.map((p) => [p.id, truthAt(p, date)]));
    for (const p of st.prospects) (by.get(p.cls) ?? by.set(p.cls, []).get(p.cls)!).push(tr.get(p.id)!);
    const stat = new Map([...by].map(([c, xs]) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return [c, [m, Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) || 1]]; }));
    for (const p of st.prospects) { const [m, sd] = stat.get(p.cls)!; out.set(p.id, (tr.get(p.id)! - m) / sd); }
    return out;
  }

  /** Your school as its scouts see the country. */
  private myEye(): SchoolEye | null {
    const s = this.state, me = s.user_team_id, st = s.recruiting;
    if (me == null || !st) return null;
    const t = this.team(me);
    return { id: t.id, lat: t.venue?.lat ?? 39, lon: t.venue?.lon ?? -95, state: t.venue?.state ?? null, regions: st.user.regions,
      national: isPower(t), width: scoutWidth(staffSkill(this.staff(t.id), "scouting")) };
  }

  /** What your staff already knows when it starts looking: the weeks of looking behind it (KNOWN_WEEKS) at once. */
  private seedFound(): void {
    const s = this.state, st = s.recruiting!, eye = this.myEye();
    if (!eye) return;
    this.recruitRev++;
    const zs = this.classZ(s.date), rng = new Rng(mixSeed(s.seed, s.year, eye.id, "found"));
    const effort = Math.sqrt(timeSplit(st.user.time, this.inSeason(s.date)).scouting / 0.1);
    const found: number[] = [];
    for (const p of st.prospects) {
      const u = rng.random();
      if (isPublic(p)) continue;
      const h = discoverRate(eye, p, zs.get(p.id)!, effort) * KNOWN_WEEKS[gradeOf(p, s.year)];
      if (u < 1 - Math.exp(-h)) found.push(p.id);
    }
    st.user.found = found;
    st.user.found_team = eye.id;
  }

  /** The prospects your staff knows about: the public ones, the ones it has found and the ones on your board. */
  knownProspects(): Set<number> {
    const st = this.state.recruiting, me = this.state.user_team_id;
    if (!st) return new Set();
    const u = st.user, out = new Set<number>([...(u.found ?? []), ...(u.board ?? []), ...u.scout, ...Object.keys(u.hours).map(Number)]);
    for (const p of st.prospects) if (isPublic(p) || (me != null && (p.offers.includes(me) || p.interest[me]))) out.add(p.id);
    return out;
  }

  inSeason(date: ISODate): boolean {
    const md = date.slice(5);
    return md >= "08-20" && md <= "12-14";
  }

  /** Bumped whenever recruiting may have changed (a league file saves it only then: it is several megabytes). */
  recruitRev = 0;
  /**
   * Every school as the recruiting sees it this week. What recruits weigh (record, development, money, band)
   * and each school's class target and starters are the year's frozen values once the recruiting year has
   * started; hours and your board are live.
   */
  schools(date = this.state.date): School[] {
    const s = this.state, st = s.recruiting!, me = s.user_team_id;
    const inSeason = this.inSeason(date);
    const frozen = st.frozen?.year === s.year ? st.frozen.schools : this.freezeSchools();
    // Each head coach's seasons at his school (a recruit hears about a stable program).
    const since = new Map((s.coaching?.coaches ?? []).filter((c) => c.role === "HC" && c.team_id != null && !c.gone).map((c) => [c.team_id!, c.since]));
    return this.teams.map((t): School => {
      const staff = this.staff(t.id);
      const fbs = t.level === "fbs", power = isPower(t);
      const time = timeSplit(t.id === me ? st.user.time : inSeason ? SEASON_TIME : OFFSEASON_TIME, inSeason);
      return {
        id: t.id, lat: t.venue?.lat ?? 39, lon: t.venue?.lon ?? -95, state: t.venue?.state ?? null,
        regions: t.id === me ? st.user.regions : [], national: power, width: scoutWidth(staffSkill(staff, "scouting")),
        level: fbs ? "fbs" : "fcs", power, ...frozen[t.id],
        hours: STAFF_HOURS * time.recruiting * (power ? 1.5 : fbs ? 1 : 0.6), eff: recruitEff(staffSkill(staff, "recruiting")),
        manual: t.id === me && !st.user.auto,
        ...(since.has(t.id) ? { tenure: Math.max(0, s.year - since.get(t.id)!) } : {}),
      };
    });
  }

  /** How every school looks to recruits this year, from last season's record, its facilities, staff, money, recent classes and roster. */
  private freezeSchools(): Record<string, FrozenSchool> {
    const s = this.state, st = s.recruiting!;
    const last = s.past?.[s.past.length - 1];
    // Money: each school's revenue-share budget for football against the median power program's.
    const pools = this.teams.filter((t) => t.level === "fbs" && isPower(t) && t.school !== "Notre Dame").map((t) => s.pools?.[t.id] ?? 0).sort((a, b) => a - b);
    const mid = pools[Math.floor(pools.length / 2)] || 1;
    return Object.fromEntries(this.teams.map((t) => {
      const staff = this.staff(t.id), roster = this.roster(t.id), fbs = t.level === "fbs";
      const rec = last?.records[t.id];
      const starter: Partial<Record<Pos, number>> = {};
      for (const pos of POSITIONS) {
        const o = roster.filter((p) => p.pos === pos).map((p) => p.ovr).sort((a, b) => b - a);
        starter[pos] = o[Math.min(o.length, STARTERS[pos]) - 1] ?? 60;
      }
      const f: FrozenSchool = {
        prestige: (t.prestige ?? 30) + draftPrestige(s.draft_history?.[t.id]),
        win_pct: rec && rec[0] + rec[1] > 0 ? rec[0] / (rec[0] + rec[1]) : Math.max(0.1, Math.min(0.9, 0.5 + (s.preseason_power[t.id] ?? 0) / 30)),
        development: (devRate(this.facilityGrades(t.id)) - 1) * 5 + (staffSkill(staff, "development") - 50) / 100 + this.facilityEffect(t.id).appeal,
        fit: (staffSkill(staff, "scheme") - 50) / 100,
        band: bandOf(st.classes[t.id], fbs ? "fbs" : "fcs"),
        target: classTarget(roster, this.seed.styles?.[t.id]?.portal_share ?? 0.45, fbs ? "fbs" : "fcs"), starter,
        buzz: st.cycle?.[t.id] ?? 0,
        wealth: Math.round(((s.pools?.[t.id] ?? 0) / mid) * 1000) / 1000,
      };
      return [t.id, f];
    }));
  }

  /** Sunday: a week of recruiting, your scouts' trips and what they cost. */
  private recruitingDay(today: ISODate, rep: DayReport): void {
    const s = this.state, st = s.recruiting;
    if (!st) return;
    this.recruitRev++;
    // The first day of the recruiting year sets how every school looks to recruits until the next one.
    if (st.frozen?.year !== s.year) st.frozen = { year: s.year, schools: this.freezeSchools() };
    // The service re-rates in spring, after the summer circuit and after the season.
    const k = this.rerateIndex(today);
    if (k > st.rerate && RERATE_DATES(Number(today.slice(0, 4))).includes(today)) {
      st.rerate = Math.min(3, k);
      rateClasses(st.prospects, s.year, today, st.rerate, s.seed, this.seed.recruiting!.curve);
    }
    if (weekday(today) !== 0) return;
    this.scoutingWeek(today);
    const schools = this.schools(today);
    const me = s.user_team_id;
    // Your own board (when you run it): your hours on the prospects you chose.
    if (me != null && !st.user.auto) {
      const mine = schools.find((t) => t.id === me)!;
      const want = Object.entries(st.user.hours).filter(([, h]) => h > 0);
      const total = want.reduce((a, [, h]) => a + h, 0);
      const scale = total > mine.hours ? mine.hours / total : 1;
      const byId = new Map(st.prospects.map((p) => [p.id, p]));
      for (const [pid, h] of want) {
        const p = byId.get(Number(pid));
        if (p && !p.commit?.signed) p.interest[me] = Math.round(((p.interest[me] ?? 0) + h * scale * mine.eff) * 100) / 100;
      }
    }
    // Your pitches as they stand this week (more contact hours, visits fading).
    this.refreshPulls();
    const ev = this.week.run({ st, year: s.year, date: today, schools, user: me, rng: new Rng(mixSeed(s.seed, s.year, today, "recruiting")) });
    this.recruitNews(ev, today, rep);
    this.boardCommits();
  }

  /** Your commits go on your big board (after the prospects already there, best first), once each: one you take off stays off. */
  private boardCommits(): void {
    const s = this.state, st = s.recruiting, me = s.user_team_id;
    if (!st || me == null) return;
    const u = st.user, board = u.board ?? [], added = new Set(u.board_added ?? []), on = new Set(board);
    const fresh = st.prospects.filter((p) => p.commit?.team === me && !added.has(p.id) && !on.has(p.id))
      .sort((a, b) => a.cls - b.cls || (a.svc?.rank ?? Infinity) - (b.svc?.rank ?? Infinity) || a.id - b.id);
    if (!fresh.length) return;
    this.recruitRev++;
    u.board = [...board, ...fresh.map((p) => p.id)];
    u.board_added = [...added, ...fresh.map((p) => p.id)];
  }

  /** Whether a prospect lives near your school (his state, or within 300 miles): a cheaper, shorter trip. */
  private tripNear(p: Prospect): boolean {
    const t = this.team(this.state.user_team_id!);
    return p.home.state === t.venue?.state || (t.venue?.lat != null && miles(p.home, { lat: t.venue.lat, lon: t.venue.lon! }) <= 300);
  }

  /** Your scouting hours this week (or on a date): the scouting share of the staff's week. */
  scoutHours(date = this.state.date): number {
    const st = this.state.recruiting;
    return st ? Math.round(STAFF_HOURS * timeSplit(st.user.time, this.inSeason(date)).scouting * 10) / 10 : 0;
  }

  /**
   * Your scouts' week: trips to the prospects on your list (as many as their hours allow, in list order),
   * then the regions you put hours into share what's left; the regional scouts' pay. A finished assignment
   * and every REGION_REPORT_HOURS in a region come back as a report.
   */
  private scoutingWeek(today: ISODate): void {
    const s = this.state, st = s.recruiting!, me = s.user_team_id;
    if (me == null) return;
    const u = st.user;
    u.spend += Math.round(u.regions.length * SCOUT_COST.region / 52);
    let hours = STAFF_HOURS * timeSplit(u.time, this.inSeason(today)).scouting;
    const byId = new Map(st.prospects.map((p) => [p.id, p]));
    const done: Prospect[] = [];
    for (const pid of u.scout) {
      const p = byId.get(pid);
      if (!p) continue;
      const near = this.tripNear(p);
      const need = near ? TRIP_HOURS.near : TRIP_HOURS.far;
      if (hours < need) break;
      hours -= need;
      u.evals[pid] = (u.evals[pid] ?? 0) + 1;
      u.spend += near ? SCOUT_COST.trip_near : SCOUT_COST.trip_far;
      const left = u.trips_left?.[pid];
      if (left != null) {
        u.trips_left = { ...u.trips_left, [pid]: left - 1 };
        if (left <= 1) done.push(p);
      }
    }
    for (const p of done) this.playerReport(p, today);
    // The regions share what the trips left, in proportion when it runs short.
    const want = (Object.entries(u.region_hours ?? {}) as [Region, number][]).filter(([, h]) => h > 0);
    const total = want.reduce((a, [, h]) => a + h, 0);
    const scale = total > hours ? hours / Math.max(1e-9, total) : 1;
    const got = new Map<Region, number>();
    for (const [r, h] of want) {
      const g = h * scale;
      got.set(r, g);
      const sum = (u.region_done?.[r] ?? 0) + g;
      u.region_done = { ...u.region_done, [r]: Math.round(sum * 10) / 10 };
      if (sum >= REGION_REPORT_HOURS) { this.regionReport(r, sum, today); u.region_done = { ...u.region_done, [r]: 0 }; }
    }
    // Your coaches come across prospects they didn't know: most near home, more where you pay a scout or put hours.
    const eye = this.myEye()!, zs = this.classZ(today), rng = new Rng(mixSeed(s.seed, today, "found"));
    const effort = Math.sqrt(timeSplit(u.time, this.inSeason(today)).scouting / 0.1);
    const have = new Set(u.found ?? []), found = [...have];
    for (const p of st.prospects) {
      const r = rng.random();
      if (have.has(p.id) || isPublic(p)) continue;
      const reg = got.size ? regionOf(p.home) : null;
      if (r < discoverRate(eye, p, zs.get(p.id)!, effort, reg ? regionArea(got.get(reg) ?? 0) : 0)) found.push(p.id);
    }
    u.found = found;
  }

  /**
   * Your scouts' plan for the week: the hours they have, each assignment (trips left, what a trip takes and
   * costs) and each region (paid scout, weekly hours, progress to its next report, prospects you know there).
   */
  scoutingPlan() {
    const s = this.state, st = s.recruiting, me = s.user_team_id;
    if (!st || me == null) return null;
    const u = st.user, byId = new Map(st.prospects.map((p) => [p.id, p])), known = this.knownProspects();
    const assignments = u.scout.map((pid) => byId.get(pid)).filter((p): p is Prospect => !!p).map((p) => {
      const near = this.tripNear(p);
      return { ...this.prospectView(p), near, trip_hours: near ? TRIP_HOURS.near : TRIP_HOURS.far, trip_cost: near ? SCOUT_COST.trip_near : SCOUT_COST.trip_far,
        trips_left: u.trips_left?.[p.id] ?? null };
    });
    const count = new Map<Region, { known: number; found: number }>();
    const found = new Set(u.found ?? []);
    for (const p of st.prospects) {
      if (!known.has(p.id) || gradeOf(p, s.year) < 0) continue;
      const r = regionOf(p.home);
      if (!r) continue;
      const c = count.get(r) ?? count.set(r, { known: 0, found: 0 }).get(r)!;
      c.known++;
      if (found.has(p.id)) c.found++;
    }
    const mine = this.team(me), home = regionOf({ state: mine.venue?.state ?? null, lat: mine.venue?.lat ?? 39 });
    const regions = (Object.keys(REGIONS) as Region[]).map((key) => ({
      key, name: REGIONS[key].name, home: key === home, paid: u.regions.includes(key), hours: u.region_hours?.[key] ?? 0, done: u.region_done?.[key] ?? 0,
      known: count.get(key)?.known ?? 0, found: count.get(key)?.found ?? 0,
    }));
    return {
      hours: this.scoutHours(), in_season: this.inSeason(s.date),
      season_hours: Math.round(STAFF_HOURS * timeSplit(u.time, true).scouting * 10) / 10, offseason_hours: Math.round(STAFF_HOURS * timeSplit(u.time, false).scouting * 10) / 10,
      trips: assignments.reduce((a, x) => a + x.trip_hours, 0), region_hours: regions.reduce((a, r) => a + r.hours, 0),
      assignments, regions, report_hours: REGION_REPORT_HOURS, default_trips: DEFAULT_TRIPS, spend: u.spend,
      costs: { ...SCOUT_COST, trip_hours: TRIP_HOURS }, reports: (u.reports ?? []).length, last_report: u.reports?.[0]?.id ?? 0,
    };
  }

  /** A prospect as a line in a report, with your read today. */
  private scoutLine(p: Prospect, date: ISODate, note: string, fresh: boolean): ScoutLine {
    const eye = this.myEye()!, st = this.state.recruiting!;
    const r = schoolRead(eye, p, date, this.state.seed, looksOf(p, eye.id, st.user.evals[p.id] ?? 0));
    const cap = (x: number) => Math.round(Math.max(40, Math.min(99, x)));
    return {
      pid: p.id, name: `${p.first} ${p.last}`, pos: p.pos, cls: p.cls, city: p.home.city ?? null, state: p.home.state ?? null,
      est: cap(r.est), lo: cap(r.est - 1.65 * r.sd), hi: cap(r.est + 1.65 * r.sd),
      stars: p.svc ? starsOf(p.svc.r) : null, rank: p.svc?.rank ?? null, note, fresh, commit: p.commit?.team ?? null,
    };
  }

  /** Reports stay with your recruiting (not the league's news, which every coach in a league reads). */
  private fileReport(r: Omit<ScoutReport, "id">): void {
    const u = this.state.recruiting!.user, id = u.next_report ?? 1;
    u.next_report = id + 1;
    u.reports = [{ id, ...r }, ...(u.reports ?? [])].slice(0, 60);
    // ...and a copy to your inbox: the summary and the names, with the full report a click away.
    const lines = r.kind === "region" ? r.lines.map((x) => `${x.name}, ${x.pos} (${x.cls}${x.state ? `, ${x.state}` : ""}): ${x.stars ? `${x.stars}-star, No. ${x.rank}; ` : ""}your read ${x.lo}-${x.hi}.${x.note ? ` ${x.note}` : ""}`) : [];
    const p = r.kind === "player" ? r.lines[0] : null;
    this.mail({ date: r.date, category: "scouting", from: "Your scouts", subject: r.title, body: [r.summary, ...lines].join("\n"),
      links: [{ label: "Scout reports", to: "strategy/reports" }, ...(p ? [{ label: p.name, to: `prospect/${p.pid}` }] : [])] });
  }

  /** Your scouts are back from their trips to see a prospect: what they saw, and how your read moved. */
  private playerReport(p: Prospect, today: ISODate): void {
    const u = this.state.recruiting!.user, me = this.state.user_team_id!;
    const from = u.scout_from?.[p.id], trips = u.evals[p.id] ?? 0;
    u.scout = u.scout.filter((x) => x !== p.id);
    const { [p.id]: _l, ...left } = u.trips_left ?? {};
    const { [p.id]: _f, ...froms } = u.scout_from ?? {};
    u.trips_left = left; u.scout_from = froms;
    const svc = publicRead(p, today, this.state.seed).svc;
    const now = this.scoutLine(p, today, "", false);
    const before = from ? { est: Math.round(from.est), lo: Math.round(from.est - 1.65 * from.sd), hi: Math.round(from.est + 1.65 * from.sd) } : undefined;
    const notes: string[] = [];
    const move = before ? now.est - before.est : 0;
    if (before) notes.push(move >= 2 ? `Better than we thought: up ${move} to ${now.est} (${now.lo}-${now.hi}), from ${before.est} (${before.lo}-${before.hi}).`
      : move <= -2 ? `Not what we hoped: down ${-move} to ${now.est} (${now.lo}-${now.hi}), from ${before.est} (${before.lo}-${before.hi}).`
      : `About what we thought: ${now.est} (${now.lo}-${now.hi}), from ${before.est} (${before.lo}-${before.hi}).`);
    else notes.push(`We have him at ${now.est} (${now.lo}-${now.hi}).`);
    if (svc) {
      const gap = now.est - svc.est;
      notes.push(gap >= 3 ? `We like him more than the service does (${now.stars}-star, No. ${now.rank}).` : gap <= -3 ? `The service (${now.stars}-star, No. ${now.rank}) has him higher than we do.` : `In line with the service (${now.stars}-star, No. ${now.rank}).`);
    } else notes.push("The service doesn't rate him.");
    const hs = this.hsView(p);
    if (hs?.summary) notes.push(`${hs.year} ${hs.level === "jv" ? "JV" : "varsity"}: ${hs.summary}.`);
    if (p.commit && p.commit.team !== me) notes.push(`Committed to ${this.team(p.commit.team).school}${p.commit.signed ? " (signed)" : ""}.`);
    now.note = move >= 2 ? "Up" : move <= -2 ? "Down" : "Steady";
    this.fileReport({ date: today, kind: "player", title: `Scouting report: ${p.pos} ${p.first} ${p.last}`, summary: notes.join(" "), lines: [now], before, trips });
  }

  /**
   * Your scouts' report on a region they worked: the best prospects they saw there (sophomores and up, not
   * committed elsewhere, not on an earlier report from there), then up to three nobody rates or the service
   * underrates. They see most of the ones your staff knows and turn up some it didn't, the best most often;
   * those join the prospects your staff knows.
   */
  private regionReport(region: Region, hours: number, today: ISODate): void {
    const s = this.state, st = s.recruiting!, u = st.user;
    const known = this.knownProspects(), zs = this.classZ(today), rng = new Rng(mixSeed(s.seed, today, region, "region-report"));
    const seen: { p: Prospect; fresh: boolean }[] = [];
    for (const p of st.prospects) {
      if (regionOf(p.home) !== region || gradeOf(p, s.year) < 1 || p.commit?.signed) continue;
      const r = rng.random();
      if (known.has(p.id)) seen.push({ p, fresh: false });
      else if (r < reportSees(hours, zs.get(p.id)!)) seen.push({ p, fresh: true });
    }
    const fresh = seen.filter((x) => x.fresh).map((x) => x.p.id);
    if (fresh.length) u.found = [...(u.found ?? []), ...fresh];
    const rows = seen.map(({ p, fresh }) => ({ p, fresh, line: this.scoutLine(p, today, "", fresh), svc: publicRead(p, today, s.seed).svc }));
    rows.sort((a, b) => b.line.est - a.line.est || a.p.id - b.p.id);
    const note = (x: typeof rows[number]) => [x.fresh ? "New to us" : "", !x.svc ? "Unrated" : x.line.est - x.svc.est >= 3 ? `Better than his ${x.line.stars} stars` : "",
      x.p.commit && x.p.commit.team !== s.user_team_id ? `Committed to ${this.team(x.p.commit.team).school}` : x.p.commit ? "Committed to us" : ""].filter(Boolean).join(" · ");
    // The ones you can still recruit (or yours already) and haven't had a report on from here yet: the best,
    // then the ones nobody rates or the service underrates.
    const named = new Set((u.reports ?? []).filter((r) => r.region === region).flatMap((r) => r.lines.map((x) => x.pid)));
    const open = rows.filter((x) => (!x.p.commit || x.p.commit.team === s.user_team_id) && !named.has(x.p.id));
    const best = open.slice(0, 6);
    const radar = open.filter((x) => !best.includes(x) && (!x.svc || x.line.est - x.svc.est >= 3)).slice(0, 3);
    const lines = [...best, ...radar].map((x) => ({ ...x.line, note: note(x) }));
    const name = REGIONS[region].name;
    const summary = !lines.length ? `${Math.round(hours)} hours in ${name}: nobody new worth a look.`
      : `${Math.round(hours)} hours in ${name}. Best seen: ${best.slice(0, 3).map((x) => `${x.p.pos} ${x.p.first} ${x.p.last} (${x.line.est})`).join(", ")}.`
        + (radar.length ? ` Under the radar: ${radar.map((x) => `${x.p.pos} ${x.p.first} ${x.p.last} (${x.line.est})`).join(", ")}.` : "")
        + (fresh.length ? ` ${fresh.length} prospect${fresh.length === 1 ? "" : "s"} new to us.` : "");
    this.fileReport({ date: today, kind: "region", region, title: `Scouting report: ${name}`, summary, lines, hours: Math.round(hours) });
  }

  private recruitNews(ev: RecruitEvent[], date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id, st = s.recruiting!;
    const byId = new Map(st.prospects.map((p) => [p.id, p]));
    const who = (p: Prospect) => `${p.svc ? `${starsOf(p.svc.r)}-star ` : ""}${p.pos} ${p.first} ${p.last} (${p.home.city ?? ""}${p.home.state ? `, ${p.home.state}` : ""})`;
    for (const e of ev) {
      const p = byId.get(e.pid);
      if (!p || e.kind === "signed") continue;
      const top = p.svc != null && p.svc.rank <= 25 && gradeOf(p, s.year) >= 2;
      const mine = me != null && (e.team === me || e.from === me);
      if (!top && !mine) continue;
      const school = this.team(e.team).school;
      if (e.kind === "commit") rep.news.push(this.news(date, "recruiting", `${who(p)} commits to ${school}`, `${p.cls} class${p.svc ? `, No. ${p.svc.rank} nationally` : ""}.`, [e.team]));
      else rep.news.push(this.news(date, "recruiting", `${p.first} ${p.last} flips from ${this.team(e.from!).school} to ${school}`, `${who(p)}, ${p.cls} class.`, [e.team, e.from!]));
    }
  }

  /** The class rankings for a signing class: class points by school, best first. */
  classRankings(cls = this.state.year + 1): { team_id: number; points: number; commits: number; five: number; four: number }[] {
    const st = this.state.recruiting;
    if (!st) return [];
    const by = new Map<number, number[]>();
    for (const p of st.prospects) if (p.cls === cls && p.commit) (by.get(p.commit.team) ?? by.set(p.commit.team, []).get(p.commit.team)!).push(p.svc?.r ?? 0.75);
    return [...by].map(([team_id, rs]) => ({ team_id, points: classPoints(rs), commits: rs.length, five: rs.filter((r) => r >= 0.9834).length, four: rs.filter((r) => r >= 0.89 && r < 0.9834).length }))
      .sort((a, b) => b.points - a.points || a.team_id - b.team_id);
  }

  /** How your staff sees a prospect: his scouted potential range, today's overall and the schools in his picture. */
  prospectView(p: Prospect) {
    const s = this.state, st = s.recruiting!, me = s.user_team_id;
    const t = me != null ? this.team(me) : null;
    let read: { est: number; sd: number } | null = null;
    const eye = this.myEye();
    if (t && eye) read = schoolRead(eye, p, s.date, s.seed, looksOf(p, eye.id, st.user.evals[p.id] ?? 0));
    const ovr = currentOvr(p, s.date);
    const cap = (x: number) => Math.max(40, Math.min(99, x));
    return {
      id: p.id, name: `${p.first} ${p.last}`, cls: p.cls, grade: gradeOf(p, s.year), pos: p.pos, listed: p.listed, home: p.home, height: p.ht, weight: p.wt,
      region: regionOf(p.home),
      service: p.svc ? { stars: starsOf(p.svc.r), rating: p.svc.r, rank: p.svc.rank } : null,
      // Ninety percent ranges: what your staff would bet he is today and where he tops out.
      potential: read ? { est: Math.round(cap(read.est)), lo: Math.round(cap(read.est - 1.65 * read.sd)), hi: Math.round(cap(read.est + 1.65 * read.sd)) } : null,
      ovr: read ? { lo: Math.round(ovr - 0.8 * read.sd), hi: Math.round(ovr + 0.8 * read.sd) } : null,
      evals: st.user.evals[p.id] ?? 0, hours: st.user.hours[p.id] ?? 0, board: (st.user.board ?? []).indexOf(p.id),
      scouting: st.user.scout.includes(p.id), lat: p.home.lat, lon: p.home.lon,
      commit: p.commit ? { team_id: p.commit.team, signed: p.commit.signed, date: p.commit.date } : null,
      offers: p.offers, interest: me != null ? p.interest[me] ?? 0 : 0,
      hs: this.hsView(p),
      top_schools: Object.entries(p.interest).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0])).slice(0, 6).map(([id, h]) => ({ team_id: Number(id), hours: Math.round(h), offered: p.offers.includes(Number(id)) })),
    };
  }

  /** His latest high school season for lists (JV or varsity): the line, a few words and the number his position is sorted by. */
  private hsView(p: Prospect) {
    const last = hsLatest(this.state.seed, p, this.state.date);
    return last ? { year: last.year, grade: last.grade, final: last.final, g: last.g, level: last.level, summary: hsSummary(p.pos, last), lead: last.stats[HS_LEAD[p.pos]] ?? 0, stats: last.stats } : null;
  }

  /**
   * A prospect's page: how your staff sees him, the schools he's considering (his chance with each if he chose
   * today), how your read of him has moved week by week, and his ratings now and on arrival as your staff
   * projects them.
   */
  prospectPage(p: Prospect) {
    const s = this.state, st = s.recruiting!, me = s.user_team_id, eye = this.myEye();
    const view = this.prospectView(p);
    const considering = this.considering(p).slice(0, 10);
    // Your read each week back to his freshman August (at most a year), with today's evaluations.
    const history: { date: ISODate; est: number; lo: number; hi: number }[] = [];
    if (eye) {
      const start = `${p.cls - 4}-08-01`;
      for (let d = s.date, i = 0; d >= start && i < 53; d = addDays(d, -7), i++) {
        const r = schoolRead(eye, p, d, s.seed, looksOf(p, eye.id, st.user.evals[p.id] ?? 0));
        const c = (v: number) => Math.round(Math.max(40, Math.min(99, v)) * 10) / 10;
        history.unshift({ date: d, est: c(r.est), lo: c(r.est - 1.65 * r.sd), hi: c(r.est + 1.65 * r.sd) });
      }
    }
    // Ratings as your staff projects them: his strengths and weaknesses (they see those), at his estimated level.
    let ratings: { attr: string; now: number; arrival: number }[] = [];
    if (view.potential) {
      const rng = new Rng(mixSeed(s.seed, p.id, "enroll"));
      const zz = zOf(arrivalOvr(view.potential.est) + 0.5 * p.form);
      const nowGap = arrivalOvr(view.potential.est) - (view.ovr ? (view.ovr.lo + view.ovr.hi) / 2 : arrivalOvr(view.potential.est));
      ratings = ATTRS[p.pos].map((a) => { const arrival = fromZ(zz + 0.47 * rng.gauss(0, 1)); return { attr: a, now: Math.max(15, Math.round(arrival - nowGap)), arrival }; });
    }
    // His high school seasons so far (true production: nobody's read filters it) and his position's columns.
    const hs_seasons = hsSeasons(s.seed, p, s.date);
    return { ...view, considering, history, ratings, years_out: Math.round(yearsOut(p, s.date) * 10) / 10, persona: this.personaRead(p.id), hs_seasons, hs_cols: HS_COLS[p.pos] };
  }

  /** The schools a prospect is considering, best first (see RecruitWeek.considering). */
  considering(p: Prospect, schools = this.schools()) {
    return this.week.considering(this.state.recruiting!, this.state.year, schools, this.state.user_team_id, p);
  }

  /**
   * A college player's potential as a staff reads it: your own players closely (about ±3 points), everyone
   * else's from film and word of mouth (about ±7); never below what he is now.
   */
  scoutedPotential(pl: RatedPlayer): { est: number; lo: number; hi: number } {
    const s = this.state, mine = pl.team_id === s.user_team_id;
    const sd = mine ? 2 : 4.5;
    const est = Math.max(pl.ovr, Math.min(99, pl.hidden.potential + sd * hashGauss(s.seed, pl.id, mine ? 1 : 0, s.year)));
    return { est: Math.round(est), lo: Math.round(Math.max(pl.ovr, est - 1.65 * sd)), hi: Math.round(Math.min(99, est + 1.65 * sd)) };
  }

  // ---- the NFL draft --------------------------------------------------------------------------------
  /** Everyone who could be drafted this year as the NFL grades them, best first (their place is the slot they'd go). */
  private draftBoard(date: ISODate, seed = this.state.seed): { p: RatedPlayer; grade: number }[] {
    const s = this.state, out: { p: RatedPlayer; grade: number }[] = [];
    for (const t of this.teams) {
      const tier = this.tierOf(t.id);
      for (const p of this.roster(t.id)) {
        if (p.years < 2) continue;
        out.push({ p, grade: draftGrade({ pid: p.id, pos: p.pos, ovr: p.ovr, potential: p.hidden.potential, years: p.years + 1, tier }, seed, Number(date.slice(0, 4))) });
      }
    }
    return out.sort((a, b) => b.grade - a.grade || a.p.id - b.p.id);
  }

  /** Power program, Group of Five or FCS. */
  private tierOf(tid: number): 0 | 1 | 2 {
    const t = this.team(tid);
    return t.level !== "fbs" ? 2 : isPower(t) ? 0 : 1;
  }

  /** January's deadline: players with eligibility left decide whether to enter the draft. */
  private declarations(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    const board = this.draftBoard(date), rng = new Rng(mixSeed(s.seed, s.year, "declare"));
    const declared: { p: RatedPlayer; slot: number }[] = [];
    board.forEach(({ p }, i) => {
      const u = rng.random();
      // Juniors and fourth-year players with a year left choose; anyone out of eligibility is in the draft anyway.
      if (p.years !== 2 && p.years !== 3) return;
      // What staying pays: a deal he's signed for next season, else what he has now.
      const pay = s.next_deals?.[p.id]?.amount ?? (s.contracts?.[p.id]?.amount ?? 0) + (s.nil?.[p.id]?.amount ?? 0);
      if (u < declareChance(i + 1, pay)) declared.push({ p, slot: i + 1 });
    });
    s.declared = declared.map((d) => d.p.id).sort((a, b) => a - b);
    const round = (slot: number) => (slot <= 32 ? "a first-round pick" : slot <= 100 ? "a day-two pick" : slot <= PICKS ? "a late-round pick" : "a long shot");
    rep.news.push(this.news(date, "draft", `${declared.filter((d) => d.p.years === 2).length} underclassmen declare for the NFL draft`,
      `Leading the way: ${declared.slice(0, 5).map((d) => `${d.p.pos} ${d.p.first} ${d.p.last} (${this.team(d.p.team_id).school})`).join(", ")}.`, []));
    for (const d of declared) {
      if (d.p.team_id !== me && d.slot > 10) continue;
      rep.news.push(this.news(date, "draft", `${this.team(d.p.team_id).school} ${d.p.pos} ${d.p.first} ${d.p.last} declares for the NFL draft`,
        `Projected as ${round(d.slot)}.`, [d.p.team_id]));
    }
  }

  /** April: the draft. Picks feed each school's standing with recruits for three years. */
  private draftDay(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id, pool = s.draft_pool;
    if (!pool?.length) return;
    const year = Number(date.slice(0, 4));
    const picks = runDraft(pool, s.seed, year);
    s.draft = { year, picks };
    const by = new Map<number, number>();
    for (const p of picks) by.set(p.team_id, (by.get(p.team_id) ?? 0) + 1);
    const hist: Record<string, number[]> = {};
    for (const t of this.teams) hist[t.id] = [...(s.draft_history?.[t.id] ?? []).slice(-2), by.get(t.id) ?? 0];
    s.draft_history = hist;
    const first = picks[0], lead = [...by].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    rep.news.push(this.news(date, "draft", `${first.nfl} takes ${this.team(first.team_id).school} ${first.pos} ${first.name} first overall`,
      `${picks.filter((p) => p.round === 1).length} first-rounders; ${this.team(lead[0]).school} leads all schools with ${lead[1]} picks.`, [first.team_id, lead[0]]));
    if (me != null) {
      const mine = picks.filter((p) => p.team_id === me);
      rep.news.push(this.news(date, "draft", mine.length ? `${mine.length} ${this.team(me).school} player${mine.length === 1 ? "" : "s"} drafted` : `No ${this.team(me).school} players drafted`,
        mine.map((p) => `${p.name} (${p.pos}), round ${p.round}, No. ${p.pick} to ${p.nfl}`).join("; ") || "Recruits notice where programs send players.", [me]));
    }
  }

  /** The draft page: this year's draft once held (or last year's), and before it the early entrants and the projected board. */
  draftView() {
    const s = this.state, date = s.date;
    const last = s.draft ?? null;
    const pool = s.draft_pool ?? [];
    // The mock draft: the NFL's consensus (its own disagreement about each player isn't known until April).
    const projected = !s.draft && pool.length ? [...pool].map((e) => ({ ...e, grade: draftGrade(e, mixSeed(s.seed, "mock"), Number(this.eventDate("nfl_draft").slice(0, 4))) }))
      .sort((a, b) => b.grade - a.grade || a.pid - b.pid).slice(0, PICKS).map(({ grade: _, ...e }) => e) : [];
    // Before the January deadline, who might go: the board's top players with eligibility left.
    const declared = new Set(s.declared ?? []);
    const early = s.declared ? this.draftBoard(date).filter((x) => declared.has(x.p.id)).map((x, i) => ({ pid: x.p.id, team_id: x.p.team_id, name: `${x.p.first} ${x.p.last}`.trim(), pos: x.p.pos, ovr: x.p.ovr, rank: i + 1 })) : [];
    // During the season, the NFL's board of everyone draft-eligible (whether or not he'll leave).
    const prospects = !s.draft && !pool.length ? this.draftBoard(date, mixSeed(s.seed, "mock")).slice(0, 100)
      .map(({ p }) => ({ pid: p.id, team_id: p.team_id, name: `${p.first} ${p.last}`.trim(), pos: p.pos, ovr: p.ovr, cls: p.class, declared: declared.has(p.id) })) : [];
    return {
      draft: last, projected, early, prospects, history: s.draft_history ?? {},
      dates: { deadline: s.events.find((e) => e.type === "draft_deadline" && e.date >= date)?.date ?? null, draft: s.events.find((e) => e.type === "nfl_draft" && e.date >= date)?.date ?? null },
      prestige: Object.fromEntries(this.teams.map((t) => [t.id, draftPrestige(s.draft_history?.[t.id])])),
    };
  }

  /** Leagues saved before the draft: its January deadline and April draft go on the calendar. */
  upgradeDraft(): void {
    for (const e of this.state.events) if ((e.type === "draft_deadline" || e.type === "nfl_draft") && e.status !== "done") e.active = true;
  }

  // Your recruiting and scouting choices (actions).
  setRecruitAuto(on: boolean): void { this.userRecruiting().auto = on; }
  setRecruitHours(pid: number, hours: number): void {
    const u = this.userRecruiting();
    this.prospect(pid);
    const h = { ...u.hours };
    if (hours > 0) h[pid] = hours; else delete h[pid];
    u.hours = h;
  }
  setOffer(pid: number, on: boolean): void {
    const me = this.state.user_team_id!, p = this.prospect(pid);
    this.userRecruiting();
    if (p.commit?.signed) throw new Error(`${p.first} ${p.last} has signed`);
    if (gradeOf(p, this.state.year) < 1) throw new Error("freshmen can't be offered yet");
    if (on && !p.offers.includes(me)) p.offers = [...p.offers, me];
    if (!on) {
      p.offers = p.offers.filter((x) => x !== me);
      if (p.commit?.team === me) p.commit = null;
    }
  }
  /**
   * Send your scouts to see a prospect `trips` times (then they report back), or call them off. Without a count
   * they go every week. One already assigned keeps his place (or moves to `at`) and the read his assignment started from.
   */
  setScoutTarget(pid: number, on: boolean, trips?: number, at?: number): void {
    const u = this.userRecruiting(), p = this.prospect(pid);
    const had = u.scout.includes(pid);
    const rest = u.scout.filter((x) => x !== pid);
    if (on) rest.splice(at != null ? Math.max(0, Math.min(rest.length, at)) : had ? u.scout.indexOf(pid) : rest.length, 0, pid);
    u.scout = rest;
    const { [pid]: _l, ...left } = u.trips_left ?? {};
    const { [pid]: _f, ...from } = u.scout_from ?? {};
    u.trips_left = left;
    u.scout_from = on && had && _f ? { ...from, [pid]: _f } : from;
    if (on && trips != null) {
      u.trips_left[pid] = Math.max(1, Math.round(trips));
      const eye = this.myEye();
      if (eye && !u.scout_from[pid]) { const r = schoolRead(eye, p, this.state.date, this.state.seed, looksOf(p, eye.id, u.evals[pid] ?? 0)); u.scout_from[pid] = { est: r.est, sd: r.sd }; }
    }
  }
  /** Your scouts' weekly hours on a region (0 takes them off it). */
  setRegionHours(region: Region, hours: number): void {
    const u = this.userRecruiting();
    const h = { ...u.region_hours };
    if (hours > 0) h[region] = hours; else delete h[region];
    u.region_hours = h;
  }
  setScoutRegion(region: Region, on: boolean): void {
    const u = this.userRecruiting();
    u.regions = on ? [...new Set([...u.regions, region])].sort() : u.regions.filter((r) => r !== region);
  }
  setStaffTime(t: StaffTime): void { this.userRecruiting().time = timeSplit(t, true); }
  /** Put a prospect on your big board (at `at`, or the end) or take him off. */
  setBoard(pid: number, on: boolean, at?: number): void {
    const u = this.userRecruiting();
    this.prospect(pid);
    const b = (u.board ?? []).filter((x) => x !== pid);
    if (on) b.splice(at != null ? Math.max(0, Math.min(b.length, at)) : b.length, 0, pid);
    u.board = b;
  }
  private userRecruiting() {
    const st = this.state.recruiting;
    if (!st) throw new Error("recruiting isn't available in this league");
    if (this.state.user_team_id == null) throw new Error("you need a team to recruit");
    this.recruitRev++;
    return st.user;
  }
  prospect(pid: number): Prospect {
    const p = this.state.recruiting?.prospects.find((x) => x.id === pid);
    if (!p) throw new Error(`no prospect ${pid}`);
    return p;
  }
  // ---- your pitch to a recruit (pitch.ts) -------------------------------------------------------------
  /** Your pitch to a prospect (an empty one if you haven't made one). */
  private pitchOf(pid: number): Pitch {
    return this.state.recruiting?.user.pitches?.[pid] ?? { points: [] };
  }
  private savePitch(pid: number, pitch: Pitch): void {
    const u = this.userRecruiting();
    const empty = !pitch.points.length && !pitch.visit && !pitch.coach?.length && !pitch.nil;
    const all = { ...u.pitches };
    if (!pitch.nil) delete pitch.nil;
    if (empty) delete all[pid]; else all[pid] = pitch;
    u.pitches = all;
    this.refreshPull(this.prospect(pid));
  }

  /** A prospect you can pitch: rated by the service, a sophomore or older, not signed. */
  private pitchable(p: Prospect): void {
    if (p.commit?.signed) throw new Error(`${p.first} ${p.last} has signed`);
    if (!p.svc || gradeOf(p, this.state.year) < 1) throw new Error(`${p.first} ${p.last} isn't being recruited yet`);
  }

  /**
   * Where you stand with a prospect: your school and the others he's considering (his top ten besides you),
   * your place and chance, and what goes into your pitch's pull.
   */
  private pitchContext(p: Prospect, schools = this.schools()) {
    const s = this.state, me = s.user_team_id!, st = s.recruiting!;
    const cons = this.considering(p, schools);
    const byId = new Map(schools.map((t) => [t.id, t]));
    const i = cons.findIndex((c) => c.team === me);
    const others = cons.filter((c) => c.team !== me).slice(0, 10).map((c) => byId.get(c.team)!).filter(Boolean);
    return { mine: byId.get(me)!, others, cons, place: i >= 0 ? i + 1 : null, share: i >= 0 ? cons[i].share : 0,
      hours: p.interest[me] ?? 0, coachSkill: staffSkill(this.staff(me), "recruiting"), weekly: st.user.hours[p.id] ?? 0 };
  }

  /** Work out what your pitch adds to how he sees your school (stored on him for the weekly recruiting). */
  private refreshPull(p: Prospect, schools?: School[]): void {
    const s = this.state, me = s.user_team_id, pitch = s.recruiting?.user.pitches?.[p.id];
    if (me == null) return;
    const { [me]: _old, ...rest } = p.pull ?? {};
    if (!pitch || !p.svc || p.commit?.signed) { p.pull = Object.keys(rest).length ? rest : undefined; return; }
    const c = this.pitchContext(p, schools);
    const parts = pitchPull({ pitch, p, w: this.week.persona(p.id), me: c.mine, others: c.others, hours: c.hours, today: s.date, coachSkill: c.coachSkill });
    p.pull = { ...rest, [me]: parts.total };
  }

  /** Every pitch's pull, worked out again (contact hours grow, visits fade). */
  private refreshPulls(): void {
    const st = this.state.recruiting, ids = Object.keys(st?.user.pitches ?? {});
    if (!st || !ids.length) return;
    const schools = this.schools(), byId = new Map(st.prospects.map((p) => [p.id, p]));
    for (const id of ids) { const p = byId.get(Number(id)); if (p) this.refreshPull(p, schools); }
  }

  /** The selling points of your pitch to a prospect (at most three). */
  setPitchPoints(pid: number, points: SellingPoint[]): void {
    const p = this.prospect(pid);
    this.pitchable(p);
    const keys = new Set(SELLING_POINTS.map((x) => x.key));
    const list = [...new Set(points)].filter((k) => keys.has(k));
    if (list.length > MAX_POINTS) throw new Error(`a pitch has at most ${MAX_POINTS} selling points`);
    this.savePitch(pid, { ...this.pitchOf(pid), points: list });
  }

  /** Visits this week (Monday on) of a kind, across every prospect. */
  private visitsThisWeek(kind: "official" | "coach"): number {
    const s = this.state, monday = addDays(s.date, -((weekday(s.date) + 6) % 7));
    return Object.values(s.recruiting?.user.pitches ?? {}).reduce((a, x) => a + (kind === "official" ? (x.visit && x.visit >= monday ? 1 : 0) : (x.coach ?? []).filter((d) => d >= monday).length), 0);
  }

  /** Bring him in for an official visit (juniors and seniors, once each), or send your head coach to his home (twice at most). */
  pitchVisit(pid: number, kind: "official" | "coach"): void {
    const s = this.state, p = this.prospect(pid);
    this.pitchable(p);
    const pitch = this.pitchOf(pid), near = this.tripNear(p);
    if (kind === "official") {
      if (gradeOf(p, s.year) < 2) throw new Error("official visits are for juniors and seniors");
      if (pitch.visit) throw new Error(`he made his official visit on ${pitch.visit}`);
      if (this.visitsThisWeek("official") >= OFFICIAL_VISITS_PER_WEEK) throw new Error(`you can host ${OFFICIAL_VISITS_PER_WEEK} official visits a week`);
      this.userRecruiting().spend += near ? VISIT_COST.official_near : VISIT_COST.official_far;
      this.savePitch(pid, { ...pitch, visit: s.date });
      return;
    }
    if ((pitch.coach ?? []).length >= MAX_COACH_VISITS) throw new Error(`your head coach has visited him ${MAX_COACH_VISITS} times`);
    if (this.visitsThisWeek("coach") >= COACH_VISITS_PER_WEEK) throw new Error(`your head coach makes ${COACH_VISITS_PER_WEEK} home visits a week`);
    this.userRecruiting().spend += near ? VISIT_COST.coach_near : VISIT_COST.coach_far;
    this.savePitch(pid, { ...pitch, coach: [...(pitch.coach ?? []), s.date] });
  }

  /** What your senior recruits' agreed NIL deals take from next season's roster budget (besides `except`). */
  private recruitPledges(except?: number): number {
    const s = this.state, st = s.recruiting, me = s.user_team_id;
    if (!st || me == null) return 0;
    let sum = 0;
    for (const p of st.prospects) {
      if (p.id === except || p.cls !== s.year + 1 || (p.commit && p.commit.team !== me)) continue;
      const t = st.user.pitches?.[p.id]?.nil, d = t?.status === "agreed" ? t : t?.agreed;
      if (d) sum += d.amount;
    }
    return sum;
  }

  /**
   * Offer him an NIL deal for when he enrolls: dollars a year and seasons. He answers in a day or two. An
   * amount of 0 takes back an offer he hasn't answered, or ends a deal he agreed to (which he won't forget).
   */
  pitchNil(pid: number, amount: number, years: number): void {
    const s = this.state, p = this.prospect(pid);
    this.pitchable(p);
    const pitch = this.pitchOf(pid), t = pitch.nil;
    if (amount <= 0) {
      if (t?.status === "agreed") { this.savePitch(pid, { ...pitch, nil: { ...t, status: "pulled", answer: undefined } }); return; }
      if (t?.status !== "waiting") throw new Error("there's no offer or deal to take back");
      // An offer he hasn't answered: back to where the talks stood (his earlier deal, his counter, or nothing).
      const { agreed, ...rest } = t;
      const nil: NilTalk | undefined = agreed ? { ...rest, ...agreed, status: "agreed", answer: undefined } : t.counter != null ? { ...rest, status: "countered", answer: undefined } : undefined;
      this.savePitch(pid, { ...pitch, nil });
      return;
    }
    if (t?.status === "waiting") throw new Error("he hasn't answered your last offer yet");
    if (t?.status === "done") throw new Error("he's done talking money with you this year");
    if (t?.status === "pulled") throw new Error("you took back his deal: he won't negotiate with you again");
    if (years < 1 || years > 4) throw new Error("a deal runs 1 to 4 seasons");
    const value = recruitValue(p), top = fmvCeiling(value, !!s.settings.pcsa);
    if (amount > top) throw new Error(`the fair-market-value review would stop it: at most ${money(top)} a year for him`);
    if (p.cls === s.year + 1) {
      const b = this.nextBudget(s.user_team_id!), room = b.total - b.committed + this.recruitPledges() - this.recruitPledges(pid);
      if (amount > room) throw new Error(`that's over next season's roster budget: ${money(Math.max(0, room))} left`);
    }
    const n = Object.keys(this.userRecruiting().pitches ?? {}).length + years;
    const agreed = t?.status === "agreed" ? { amount: t.amount, years: t.years } : t?.agreed;
    this.savePitch(pid, { ...pitch, nil: { amount: roundPay(amount), years, status: "waiting", made: s.date, answer: addDays(s.date, answerDays(s.seed, pid, 211 + n)),
      // A recruit has a round more patience than a player renegotiating: it's his first deal.
      patience: t?.patience ?? patienceOf(this.week.persona(pid)) + 1, ...(t?.counter != null ? { counter: t.counter } : {}), ...(agreed ? { agreed } : {}) } });
  }

  /** Recruits answer the NIL offers that have waited a day or two (your inbox). */
  private nilAnswers(date: ISODate, rep: DayReport): void {
    const s = this.state, st = s.recruiting!, all = st.user.pitches ?? {};
    for (const [id, pitch] of Object.entries(all)) {
      const t = pitch.nil;
      if (!t || t.status !== "waiting" || (t.answer ?? date) > date) continue;
      const p = this.prospect(Number(id)), w = this.week.persona(p.id), name = `${p.first} ${p.last}`;
      const link = [{ label: "Your pitch", to: `pitch/${p.id}` }, { label: "His page", to: `prospect/${p.id}` }];
      const len = `${t.years} season${t.years === 1 ? "" : "s"}`;
      if (p.commit?.signed && p.commit.team !== s.user_team_id) {
        all[id] = { ...pitch, nil: { ...t, status: "done", answer: undefined } };
        continue;
      }
      const r = nilAnswer(t, p, w, this.pitchContext(p).place);
      let nil: NilTalk;
      if (r.accepted) {
        nil = { amount: t.amount, years: t.years, status: "agreed", made: t.made, patience: r.patience };
        this.mail({ date, category: "recruiting", from: name, subject: `${p.pos} ${name} agrees to your NIL deal: ${money(t.amount)} a year for ${len}`,
          body: `It's his when he enrolls${p.commit?.team === s.user_team_id ? "" : ", if he picks you"}. A deal that beats what he expected from you counts with him, more so the more money matters to him.`, links: link }, rep);
      } else if (r.too_long) {
        nil = { ...t, status: "countered", answer: undefined, counter: r.counter ?? t.counter };
        this.mail({ date, category: "recruiting", from: name, subject: `${p.pos} ${name} won't sign NIL for ${len}`, body: `He'll sign for ${r.too_long === 1 ? "one season at a time" : `up to ${r.too_long} seasons`}.`, links: link, urgent: true }, rep);
      } else if (r.patience <= 0) {
        nil = { ...t, status: "done", answer: undefined, patience: 0, counter: r.counter ?? undefined };
        this.mail({ date, category: "recruiting", from: name, subject: `${p.pos} ${name} is done talking NIL with you`, body: `He turned down ${money(t.amount)} a year and has run out of patience.${r.insulted ? " The offer insulted him." : ""} It has hurt how he sees you.`, links: link, urgent: true }, rep);
      } else {
        nil = { ...t, status: t.agreed ? "agreed" : "countered", answer: undefined, patience: r.patience, counter: r.counter ?? undefined, ...(t.agreed ? { amount: t.agreed.amount, years: t.agreed.years } : {}) };
        this.mail({ date, category: "recruiting", from: name, subject: `${p.pos} ${name} turns down ${money(t.amount)} a year for ${len}`,
          body: `He wants ${money(r.counter ?? 0)} a year${t.years > 1 ? " (as a one-year number)" : ""}.${r.insulted ? " The offer insulted him." : ""}${t.agreed ? ` Your earlier deal (${money(t.agreed.amount)} a year) stands.` : ""} Make another offer on your pitch page.`, links: link, urgent: true }, rep);
      }
      all[id] = { ...pitch, nil };
    }
    st.user.pitches = { ...all };
    this.refreshPulls();
  }

  /**
   * The pitch page: where you stand with him, each selling point (your school against the others he's
   * considering, and how much he cares as your staff reads him), visits, NIL talks and what it all adds.
   */
  pitchView(pid: number) {
    const s = this.state, me = s.user_team_id, p = this.prospect(pid), st = s.recruiting!;
    if (me == null) throw new Error("you need a team to recruit");
    const view = this.prospectView(p), pitch = this.pitchOf(pid);
    const open = !!p.svc && gradeOf(p, s.year) >= 1 && !p.commit?.signed;
    const c = open ? this.pitchContext(p) : null;
    // His real priorities drive the pitch; your staff knows them once it has put real time into him.
    const known = (p.interest[me] ?? 0) >= KNOW_HOURS, w = this.week.persona(pid), read = known ? w : typicalPersona(w.kind);
    const t = pitch.nil, agreed = t?.status === "agreed" ? t : t?.agreed, value = recruitValue(p);
    const str = c ? pointStrengths(c.mine, c.others, p, agreed ? agreed.amount / value : 0) : null;
    // What each part adds as your staff reads him (his chance itself is the real thing).
    const parts = c ? pitchPull({ pitch, p, w: read, me: c.mine, others: c.others, hours: c.hours, today: s.date, coachSkill: c.coachSkill }) : null;
    const near = this.tripNear(p);
    const walk = c ? nilWalk(p, read, c.place) : nilWalk(p, read, null);
    const senior = p.cls === s.year + 1, b = this.nextBudget(me);
    return {
      prospect: view, persona: { ...personaView(s.seed, pid, known), know_hours: KNOW_HOURS }, open, grade: gradeOf(p, s.year),
      standing: c ? { place: c.place, share: c.share, considering: c.cons.slice(0, 8), hours: Math.round(c.hours * 10) / 10, weekly: c.weekly, pull: p.pull?.[me] ?? 0 } : null,
      points: SELLING_POINTS.map((x) => ({ key: x.key, label: x.label, line: x.line, care: traitLevel(read[x.factor]), strength: str ? Math.round(str[x.key] * 100) / 100 : 0,
        // What it would add as one of one, two or three selling points (your staff's read of him, once heard).
        effects: [1, 2, 3].map((n) => (str ? Math.round(pointEffect(str[x.key], read[x.factor], n) * 1000) / 1000 : 0)) })),
      chosen: pitch.points, max_points: MAX_POINTS, heard_hours: HEARD_HOURS, parts,
      visits: {
        official: pitch.visit ?? null, can_official: gradeOf(p, s.year) >= 2, official_cost: near ? VISIT_COST.official_near : VISIT_COST.official_far,
        official_worth: c ? Math.round(officialWorth(c.mine) * 1000) / 1000 : 0, official_left: Math.max(0, OFFICIAL_VISITS_PER_WEEK - this.visitsThisWeek("official")),
        coach: pitch.coach ?? [], coach_max: MAX_COACH_VISITS, coach_cost: near ? VISIT_COST.coach_near : VISIT_COST.coach_far,
        coach_worth: c ? Math.round(coachWorth(c.coachSkill) * 1000) / 1000 : 0, coach_left: Math.max(0, COACH_VISITS_PER_WEEK - this.visitsThisWeek("coach")), half_life_weeks: 20,
      },
      nil: {
        value, fmv: fmvCeiling(value, !!s.settings.pcsa), talk: t ?? null, agreed: agreed ? { amount: agreed.amount, years: agreed.years } : null,
        // Your staff's guess at his number (his real one stays his until he names it).
        guess: { lo: roundPay(walk * 0.85), hi: roundPay(walk * 1.2) }, max_years: Math.min(4, maxYears(read)), years_known: known,
        // What a deal at a few sizes would add with him (by your staff's read of how much money matters to him).
        pull_at: [0.5, 1, 1.5, 2, 3].map((k) => ({ amount: roundPay(value * k), pull: Math.round(moneyPull(p, read, value * k, c?.mine.wealth ?? 1) * 1000) / 1000 })),
        budget: senior ? { year: s.year + 1, total: b.total, committed: b.committed, room: b.total - b.committed + (agreed?.amount ?? 0) } : null,
        enrolls: p.cls,
      },
      offered: p.offers.includes(me), weekly_hours: st.user.hours[pid] ?? 0, auto: st.user.auto,
    };
  }

  /**
   * NIL and offers at a glance: every prospect you've offered or are talking money with (by class and
   * position on the page), next season's budget with what your recruits have agreed to, and this season's
   * roster pay by position and class.
   */
  nilView() {
    const s = this.state, me = s.user_team_id, st = s.recruiting;
    if (me == null || !st) return { available: false as const };
    const pitches = st.user.pitches ?? {};
    const recruits = st.prospects.filter((p) => gradeOf(p, s.year) >= 0 && (p.offers.includes(me) || pitches[p.id]?.nil || p.commit?.team === me)).map((p) => {
      const t = pitches[p.id]?.nil, agreed = t?.status === "agreed" ? t : t?.agreed;
      return {
        pid: p.id, name: `${p.first} ${p.last}`, pos: p.pos, cls: p.cls, stars: p.svc ? starsOf(p.svc.r) : null, rank: p.svc?.rank ?? null,
        commit: p.commit ? { team_id: p.commit.team, signed: p.commit.signed } : null, offered: p.offers.includes(me), value: recruitValue(p),
        nil: t ? { status: t.status, amount: t.amount, years: t.years, counter: t.counter ?? null } : null,
        agreed: agreed ? { amount: agreed.amount, years: agreed.years } : null,
      };
    });
    const roster = this.roster(me).map((p) => ({ pid: p.id, name: playerName(p), pos: p.pos, cls: p.class, ovr: p.ovr,
      revenue_share: activeContract(s.contracts?.[p.id], s.year)?.amount ?? 0, nil: s.nil?.[p.id]?.amount ?? 0 }));
    return { available: true as const, year: s.year, recruits, roster, pool: this.rosterPool(me), next: this.nextBudget(me) };
  }

  /** What a week of preparation is worth for your team (staff time and game planning skill). */
  prepFactor(): number {
    const s = this.state, me = s.user_team_id;
    if (me == null || !s.recruiting) return 1;
    return prepFactor(timeSplit(s.recruiting.user.time, true).prep, staffSkill(this.staff(me), "game_planning"));
  }

  // ---- true vs scouted ratings ------------------------------------------------------------------
  /** Record what each team's camps were built on, from its coaches and opening lineup. */
  startHidden(coaches: Coach[]): void {
    const s = this.state, ctx: Record<number, TeamContext> = {};
    const cut = `${s.year - 1}-07-01`;
    // After the first season the carousel decides: a head coach hired this offseason is new, and his quality is
    // his true skill at what camp is about (game planning, development, his system).
    const co = s.past?.length ? s.coaching : undefined;
    for (const t of this.teams) {
      const rec = co?.coaches.find((c) => c.team_id === t.id && c.role === "HC");
      const hc = coaches.find((c) => c.team_id === t.id && c.role === "HC");
      const w = hc?.career.reduce((a, c) => a + c.wins, 0) ?? 0, l = hc?.career.reduce((a, c) => a + c.losses, 0) ?? 0;
      const new_coach = co ? !!rec && rec.since === s.year && !rec.user : !!hc?.hire_date && hc.hire_date >= cut;
      const st = this.openingStarters(t.id);
      const qb = st.off.find((p) => p.pos === "QB");
      const new_qb = !qb || qb.basis !== "stats" || qb.sample < 150;
      const all = [...st.off, ...st.def];
      const returning = all.length ? all.filter((p) => p.basis === "stats").length / all.length : 0;
      const q = rec ? (rec.skills.game_planning + rec.skills.development + rec.skills.scheme) / 3 : 50;
      ctx[t.id] = { new_coach, new_qb, continuity: !new_coach && !new_qb && returning >= 0.6,
        coach: co ? Math.round(Math.max(-2, Math.min(2, (q - 50) / 8)) * 100) / 100
          : w + l >= 24 ? Math.round(Math.max(-2, Math.min(2, (w / (w + l) - 0.5) / 0.15)) * 100) / 100 : 0 };
    }
    // Leagues without the carousel: about one program in five gets a new head coach each year (2026 had 35 of 138),
    // of unknown quality. Your school keeps you.
    if (s.past?.length && !co) {
      for (const t of this.teams) {
        if (t.id === s.user_team_id) continue;
        const rng = new Rng(mixSeed(s.seed, s.year, t.id, "coach-change"));
        if (rng.random() >= COACH_CHANGE) continue;
        ctx[t.id] = { ...ctx[t.id], new_coach: true, continuity: false, coach: Math.round(Math.max(-2, Math.min(2, 0.8 * rng.gauss(0, 1))) * 100) / 100 };
      }
    }
    // Coach quality is relative to the rest of the country, so the scouted view stays unbiased.
    const ids = Object.keys(ctx).map(Number), avg = ids.reduce((a, id) => a + ctx[id].coach, 0) / Math.max(1, ids.length);
    for (const id of ids) ctx[id].coach = Math.round((ctx[id].coach - avg) * 100) / 100;
    s.hidden_ctx = ctx;
  }

  private schemeCache?: Record<number, TeamSchemes>;
  /** Every team's offensive and defensive schemes. */
  allSchemes(): Record<number, TeamSchemes> {
    if (this.state.schemes) return this.state.schemes;
    if (!this.schemeCache) {
      const rosters: Record<number, RatedPlayer[]> = {};
      for (const t of this.teams) rosters[t.id] = this.roster(t.id);
      const fronts = inferFronts(this.state.seed, rosters), out: Record<number, TeamSchemes> = {};
      for (const t of this.teams) {
        // FCS ratings are generic, so their staffs draw from the real mix.
        const r = t.level === "fbs" ? this.seed.ratings[t.id]?.ratings : undefined;
        out[t.id] = { off: r ? inferOffense(r) : drawSchemes(this.state.seed, this.state.year, t.id).off, def: KNOWN_FRONTS[t.school] ?? fronts[t.id] ?? "4-2-5" };
      }
      this.schemeCache = out;
    }
    return this.schemeCache;
  }

  /** A team's schemes and the coaches who run them (the head coach stands in for a missing coordinator). */
  schemes(teamId: number): TeamSchemes & { off_coach: string | null; def_coach: string | null } {
    const sc = this.allSchemes()[teamId] ?? { off: "pro_style", def: "4-2-5" };
    const st = this.staff(teamId), name = (role: string) => {
      const c = st.find((m) => m.role === role) ?? st.find((m) => m.role === "HC");
      return c ? `${c.first} ${c.last}`.trim() : null;
    };
    return { ...sc, off_coach: name("OC"), def_coach: name("DC") };
  }

  /** Next season's schemes: the same coordinators keep theirs; a new head coach brings new ones. */
  private nextSchemes(next: Season): Record<number, TeamSchemes> {
    const now = this.allSchemes(), out: Record<number, TeamSchemes> = {};
    for (const t of next.teams) {
      const cur = now[t.id] ?? { off: "pro_style", def: "4-2-5" };
      const co = next.state.coaching;
      if (co) {
        // Each coordinator runs his own system; without one, a new head coach brings his and an old one keeps what's there.
        const st = staffRecs(co, t.id), hc = st.find((c) => c.role === "HC"), oc = st.find((c) => c.role === "OC"), dc = st.find((c) => c.role === "DC");
        const newHc = !!hc && hc.since === next.state.year;
        const off = oc ? oc.off : newHc && hc!.side === "off" ? hc!.off : cur.off;
        const def = dc ? dc.def : newHc && hc!.side === "def" ? hc!.def : cur.def;
        // The academies keep the option whoever coaches them.
        out[t.id] = { off: cur.off === "option" ? "option" : off, def };
        continue;
      }
      if (!next.state.hidden_ctx?.[t.id]?.new_coach) { out[t.id] = cur; continue; }
      const d = drawSchemes(next.state.seed, next.state.year, t.id);
      // The academies keep the option whoever coaches them.
      out[t.id] = { off: cur.off === "option" ? "option" : d.off, def: d.def };
    }
    return out;
  }

  private fitCache = new Map<number, Map<number, number>>();
  /**
   * Each player's fit from his ratings in his coaches' schemes, in SDs: at his slot in the opening depth
   * chart, or his best slot for a backup. Kickers, punters and snappers have none.
   */
  schemeFits(teamId: number): Map<number, number> {
    let m = this.fitCache.get(teamId);
    if (m) return m;
    m = new Map();
    const sc = this.allSchemes()[teamId];
    const depth = this.seed.players?.[teamId]?.depth ?? {};
    const slotOf = new Map<number, string>();
    for (const [slot, ids] of Object.entries(depth)) if (ids?.[0] != null && !slotOf.has(ids[0])) slotOf.set(ids[0], slot);
    for (const p of this.roster(teamId)) {
      const u = unitOf(p.pos);
      if (!sc || !u) continue;
      const slot = slotOf.get(p.id) as Parameters<typeof schemeRating>[2];
      const scheme = u === "off" ? sc.off : sc.def;
      m.set(p.id, fitSD(p, schemeRating(p, scheme, slot && OFF_OR_DEF[u].has(slot) ? slot : undefined)));
    }
    this.fitCache.set(teamId, m);
    return m;
  }

  /** A player's hidden makeup this season, with his scheme fit. */
  hiddenOf(p: RatedPlayer): ReturnType<typeof hiddenPlayer> {
    return hiddenPlayer(this.state.seed, this.state.year, p, this.schemeFits(p.team_id).get(p.id));
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
    const pace = lab ? this.labPace(date) : 1;
    const chem = this.facilityEffect(teamId).chemistry, m0 = s.team_mood?.[teamId];
    // A better locker room than the league started with adds chemistry to both units.
    const mood = chem ? { off: (m0?.off ?? 0) + chem, def: (m0?.def ?? 0) + chem } : m0;
    const key = `${date}|${s.morale?.[teamId] ?? 0}|${lab ? `${pace}|${JSON.stringify(lab)}` : ""}|${mood ? `${mood.off},${mood.def}` : ""}`;
    const c = this.hiddenCache.get(teamId);
    if (c && c.key === key) return c.h;
    const h = hiddenTeam({ seed: s.seed, year: s.year, team_id: teamId, date, ctx: this.teamContext(teamId), roster,
      starters: this.openingStarters(teamId), morale: s.morale?.[teamId], lab, labPace: pace, mood, schemeFit: this.schemeFits(teamId) });
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

  /**
   * Momentum, sized to real games (reports/momentum.md: 14,756 FBS team-games, 2014-2025): a result against
   * expectations moves the next game by about half a point per unit of (won - win chance). An upset loss
   * stings (1 point per unit) more than an upset win lifts (0.25), it is mostly gone a game later (x0.3),
   * streaks don't stack, and it is never worth more than a point. Stored in hidden points (one is worth
   * POINTS_PER_UNIT of margin) and split across offense and defense.
   */
  private updateMorale(g: Game): void {
    const s = this.state;
    const p = winChance((s.power[g.home_id] ?? 0) - (s.power[g.away_id] ?? 0) + (g.neutral ? 0 : s.settings.home_field_points));
    this.donors(g, p);
    const homeWon = g.home_score! > g.away_score! ? 1 : 0;
    const cap = MOMENTUM.cap / POINTS_PER_UNIT;
    for (const [id, d] of [[g.home_id, homeWon - p], [g.away_id, p - homeWon]] as const) {
      const hit = (d < 0 ? MOMENTUM.loss : MOMENTUM.win) * d / POINTS_PER_UNIT;
      s.morale![id] = Math.round(Math.max(-cap, Math.min(cap, (s.morale![id] ?? 0) * MOMENTUM.carry + hit)) * 100) / 100 + 0; // + 0: no -0, which a save turns into 0
    }
  }

  /** How fast your development plans work on a date: your staff's development time in season (staff.ts labPace), 1 out of season. */
  labPace(date = this.state.date): number {
    const st = this.state.recruiting;
    if (!st || !this.inSeason(date)) return 1;
    return labPace(timeSplit(st.user.time, true).develop);
  }

  /** Each morning, the work your development plans did since the last tally, at the pace the staff gave them. */
  private tallyLab(today: ISODate): void {
    const s = this.state;
    if (!s.lab || !Object.keys(s.lab).length) return;
    const pace = this.labPace(today);
    const lab: Record<number, LabPlan> = {};
    for (const [pid, l] of Object.entries(s.lab)) lab[Number(pid)] = today > l.from ? { ...l, work: Math.round(labWork(l, today, pace) * 1000) / 1000, upto: today } : l;
    s.lab = lab;
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
      lab[pid] = lab[pid]?.area === area ? lab[pid] : { area, from: s.date };
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
    // Each player's fit in the coaches' system (adaptable players shrug off a poor one), from its own stream so
    // adding it left the other reads where they were. Kickers and snappers have no system to fit.
    const frng = new Rng(mixSeed(s.seed, s.year, teamId, "staff-fit", week));
    const players = this.roster(teamId).map((p) => {
      const hp = this.hiddenOf(p);
      const f = hp.fit < 0 ? hp.fit * (1 - 0.6 * hp.adaptability / 99) : hp.fit;
      const fit = unitOf(p.pos) ? Math.round((f + (1 - known) * 1.2 * frng.gauss(0, 1)) * 10) / 10 : null;
      return { pid: p.id, growth: blur(h.growth.get(p.id) ?? 0, 3), expected: Math.round(hp.expected * progress(s.year, date) * 10) / 10,
        leadership: trait(hp.leadership), adaptability: trait(hp.adaptability), fit };
    });
    return { known, units, players };
  }

  /** The development phase a date is in for a team (its opener ends fall camp). */
  devPhase(teamId: number | null, date = this.state.date): DevPhase {
    const s = this.state;
    const first = s.games.filter((g) => g.kind === "regular" && (teamId == null || g.home_id === teamId || g.away_id === teamId)).reduce<ISODate | null>((m, g) => (m == null || g.date < m ? g.date : m), null);
    return devPhase(s.year, date, first ?? `${s.year}-08-29`);
  }

  /**
   * Your staff's read of how many overall points each player has gained this year by a date: what scouts
   * expected by now plus his development beyond it, blurred by how well the staff knows him. The blur is
   * the same all year for a player and shrinks as he's watched (and as there is more growth to see), so
   * the read moves smoothly from week to week.
   */
  devReads(teamId: number, date = this.state.date): Map<number, number> {
    const s = this.state, out = new Map<number, number>();
    const h = this.hidden(teamId, date);
    if (!h) return out;
    const phi = progress(s.year, date);
    const known = Math.min(0.9, 0.5 + Math.max(0, daysBetween(`${s.year}-08-01`, date)) / 150);
    for (const p of this.roster(teamId)) {
      const noise = new Rng(mixSeed(s.seed, s.year, p.id, "dev-read")).gauss(0, 1);
      out.set(p.id, Math.round((phi * hiddenPlayer(s.seed, s.year, p).expected + (h.growth.get(p.id) ?? 0) + 3 * (1 - known) * phi * noise) * 10) / 10 + 0); // + 0: no -0, which a save turns into 0
    }
    return out;
  }

  /** Snapshot your staff's development read when a phase begins, and every Monday in season (the last four kept). */
  private trackDevelopment(today: ISODate): void {
    const s = this.state, me = s.user_team_id;
    if (me == null) return;
    const key = `${s.year}:${this.devPhase(me, today).kind}`;
    const t = s.dev_track;
    const fresh = !t || t.key !== key || t.team !== me;
    if (!fresh && !(key.endsWith(":season") && weekday(today) === 1)) return;
    const read = Object.fromEntries(this.devReads(me, today));
    if (fresh) s.dev_track = { key, team: me, date: today, start: read, weeks: [] };
    else t!.weeks = [...t!.weeks, { date: today, read }].slice(-4);
  }

  /**
   * The Development screen for your team: the phase of the year, and for each player what he is working on
   * and how far he has come this phase against what the staff planned for (his class's expected growth
   * plus his plan). Ratings themselves move at the rollover; until then this is the staff's read.
   */
  developmentReport(teamId: number) {
    const s = this.state, date = s.date;
    const phase = this.devPhase(teamId, date);
    const t = s.dev_track?.team === teamId && s.dev_track.key === `${s.year}:${phase.kind}` ? s.dev_track : null;
    // Without a snapshot yet (a new league, or one saved before this), the phase is measured from its start.
    const baseDate = t?.date ?? (phase.start > date ? date : phase.start);
    const now = this.devReads(teamId, date);
    let then: Map<number, number> | null = null;
    const base = (pid: number) => t?.start[pid] ?? (then ??= this.devReads(teamId, baseDate)).get(pid) ?? now.get(pid) ?? 0;
    const week = t?.weeks.length ? t.weeks[0] : null;
    const last = t?.weeks.length ? t.weeks[t.weeks.length - 1] : null;
    const pEnd = progress(s.year, phase.end), pBase = progress(s.year, baseDate), pNow = progress(s.year, date);
    const trait = new Map((this.staffView(teamId, date)?.players ?? []).map((x) => [x.pid, x]));
    // Starters on offense and defense (a lineman who long-snaps is not the line's starter for that).
    const dc = this.depthChart(teamId);
    const starters = new Set([...OFFENSE_SLOTS, ...DEFENSE_SLOTS].map((k) => dc[k]?.[0]).filter((x) => x != null));
    const pace = this.labPace(date);
    const players = this.roster(teamId).map((p) => {
      const plan = teamId === s.user_team_id ? s.lab?.[p.id] : undefined;
      const exp = hiddenPlayer(s.seed, s.year, p).expected;
      const r1 = (x: number) => Math.round(x * 10) / 10;
      const so_far = now.get(p.id) ?? 0, gained = r1(so_far - base(p.id));
      // What the staff planned for this phase: his share of a normal year's growth, plus his plan's work.
      const target = r1((pEnd - pBase) * exp + labGain(plan, phase.end, pace) - labGain(plan, baseDate, pace));
      const by_now = r1((pNow - pBase) * exp + labGain(plan, date, pace) - labGain(plan, baseDate, pace));
      // In season: his read now against a few Mondays ago, less what a normal week adds.
      const trend = week && week.read[p.id] != null ? r1(so_far - week.read[p.id] - (pNow - progress(s.year, week.date)) * exp - labGain(plan, date, pace) + labGain(plan, week.date, pace)) : null;
      return {
        pid: p.id, name: playerName(p), pos: p.pos, class: p.class, years: p.years, ovr: p.ovr, starter: starters.has(p.id), gp: s.player_stats?.[p.id]?.gp ?? 0,
        plan: plan ?? null, focus: devFocus(p, plan), so_far, gained, target, by_now, trend,
        last_week: last && last.read[p.id] != null ? r1(so_far - last.read[p.id]) : null,
        leadership: trait.get(p.id)?.leadership ?? null, adaptability: trait.get(p.id)?.adaptability ?? null,
      };
    });
    return { phase, since: baseDate, done: pNow >= 1, weeks: t?.weeks.length ?? 0, trend_since: week?.date ?? null, players };
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

  // ---- keeping players and the transfer portal (M3 step 5) ----------------------------------------
  private portalCache: { date: ISODate; tiers: TierStats; next: Map<number, NextYear> } | null = null;
  private leavingCache: { date: ISODate; out: Set<number> } | null = null;

  /** What each level pays for value, its starters' ratings by position and how it looks to a player, and every team's projected next season. */
  private portalBasis(): { tiers: TierStats; next: Map<number, NextYear> } {
    const s = this.state;
    if (this.portalCache?.date === s.date) return this.portalCache;
    const ratios: number[][] = [[], [], []], bars: Partial<Record<Pos, number[]>>[] = [{}, {}, {}], wins: number[][] = [[], [], []];
    const recs = records(s.games, this.teams);
    const leaving = this.leavingSet();
    const inPortal = new Set((s.portal?.entries ?? []).map((e) => e.pid));
    const committedTo = new Map<number, RatedPlayer[]>();
    for (const e of s.portal?.entries ?? []) {
      const p = e.status === "committed" && e.to != null ? this.playerById.get(e.pid) : undefined;
      if (p) { const g = committedTo.get(e.to!) ?? []; g.push(p); committedTo.set(e.to!, g); }
    }
    const signees = new Map<number, Partial<Record<Pos, number>>>();
    for (const p of s.recruiting?.prospects ?? []) {
      if (p.cls !== s.year + 1 || p.commit?.team == null) continue;
      const m = signees.get(p.commit.team) ?? {}; m[p.pos] = (m[p.pos] ?? 0) + 1; signees.set(p.commit.team, m);
    }
    const next = new Map<number, NextYear>();
    for (const t of this.teams) {
      const tier = this.tierOf(t.id), roster = this.roster(t.id);
      if (!roster.length) continue;
      let pay = 0, val = 0;
      for (const p of roster) { const v = this.value(p.id); if (v > 0) { val += v; pay += this.pay(p.id); } }
      if (t.level === "fbs" && val > 0) ratios[tier].push(pay / val);
      // Next season's room at each position: returning players by projected rating, plus transfers already committed in.
      const byPos = new Map<Pos, { id: number; o: number }[]>();
      for (const p of roster) {
        if (leaving.has(p.id) || inPortal.has(p.id)) continue;
        const g = byPos.get(p.pos) ?? []; g.push({ id: p.id, o: ovrNext(p) }); byPos.set(p.pos, g);
      }
      const transfers_in: Partial<Record<Pos, number>> = {};
      for (const p of committedTo.get(t.id) ?? []) {
        const g = byPos.get(p.pos) ?? []; g.push({ id: p.id, o: ovrNext(p) }); byPos.set(p.pos, g);
        if (p.team_id !== t.id) transfers_in[p.pos] = (transfers_in[p.pos] ?? 0) + 1;
      }
      const rank = new Map<number, number>(), bar: Partial<Record<Pos, number>> = {}, count: Partial<Record<Pos, number>> = {}, os: Partial<Record<Pos, number[]>> = {};
      for (const pos of POSITIONS) {
        const g = (byPos.get(pos) ?? []).sort((a, b) => b.o - a.o || a.id - b.id);
        g.forEach((x, i) => rank.set(x.id, i));
        count[pos] = g.length;
        os[pos] = g.map((x) => x.o);
        // This year's starters set the bar a newcomer has to clear.
        const o = roster.filter((p) => p.pos === pos).map((p) => p.ovr).sort((a, b) => b - a);
        bar[pos] = o[Math.min(o.length, STARTERS[pos]) - 1] ?? 55;
        (bars[tier][pos] ??= []).push(bar[pos]!);
      }
      const rec = recs.get(t.id);
      const win = rec && rec.w + rec.l > 0 ? rec.w / (rec.w + rec.l) : 0.5;
      const w = winTerm((t.prestige ?? 30) + draftPrestige(s.draft_history?.[t.id]), win, tier === 0, 0);
      if (t.level === "fbs" || tier === 2) wins[tier].push(w);
      next.set(t.id, { tier, rank, bar, count, os, ratio: val > 0 ? pay / val : 0, win, prestige: (t.prestige ?? 30) + draftPrestige(s.draft_history?.[t.id]),
        signees: signees.get(t.id) ?? {}, transfers_in, budget: this.nextBudgetTotal(t) });
    }
    const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
    const tiers: TierStats = [0, 1, 2].map((i) => ({
      ratio: i === 2 ? 0 : med(ratios[i]),
      bar: Object.fromEntries(POSITIONS.map((pos) => [pos, med(bars[i][pos] ?? [60])])) as Record<Pos, number>,
      win: med(wins[i]),
    }));
    this.portalCache = { date: s.date, tiers, next };
    return this.portalCache;
  }

  /** Players who won't be back next season whatever happens: out of eligibility, or declared for the draft. */
  private leavingSet(): Set<number> {
    const s = this.state;
    if (this.leavingCache?.date === s.date && this.leavingCache.out.size >= (s.declared?.length ?? 0)) return this.leavingCache.out;
    const out = new Set<number>(s.declared ?? []);
    for (const t of this.teams) for (const p of this.roster(t.id)) if (p.years + 1 >= 5) out.add(p.id);
    this.leavingCache = { date: s.date, out };
    return out;
  }

  /** Projected NFL slot among this year's draft-eligible players (players who'd go in the top 100 weigh the NFL, not the portal). */
  private nflSlots(): Map<number, number> {
    if (this.nflCache?.date === this.state.date) return this.nflCache.slots;
    const slots = new Map(this.draftBoard(this.state.date, mixSeed(this.state.seed, "mock")).map((x, i) => [x.p.id, i + 1]));
    this.nflCache = { date: this.state.date, slots };
    return slots;
  }
  private nflCache: { date: ISODate; slots: Map<number, number> } | null = null;

  /** What a player weighs about staying (pay: what staying pays him next season; default his pay now). */
  stayContext(p: RatedPlayer, pay = this.nextPay(p)): StayContext {
    const s = this.state, { tiers, next } = this.portalBasis();
    const me = next.get(p.team_id)!, t = this.team(p.team_id);
    const o = ovrNext(p), value = playerValue({ pos: p.pos, ovr: o, stars: p.stars, years: p.years + 1 });
    const q = Math.max(-2, Math.min(3, (o - 72) / 5));
    // The level he'd land at: the best mix of playing time, winning and money among the levels that would want
    // him (where he'd be close to the starters; FCS takes anyone).
    let best = { tier: 2 as 0 | 1 | 2, u: -Infinity, start: 0 };
    for (const i of [0, 1, 2] as const) {
      if (i < 2 && o < tiers[i].bar[p.pos] - (i < me.tier ? 4 : 6)) continue;
      const start = sigmoid((o - tiers[i].bar[p.pos]) / 2.5);
      const u = STAY.playing * start + STAY.winning * winTerm(i === 0 ? 70 : i === 1 ? 40 : 25, 0.5, i === 0, q) + Math.log(tiers[i].ratio + 0.05);
      if (u > best.u) best = { tier: i, u, start };
    }
    const away = tiers[best.tier];
    const r = me.rank.get(p.id), jobs = STARTERS[p.pos];
    const start_here = r == null ? 0 : r < jobs ? 1 : r === jobs ? 0.4 : r === jobs + 1 ? 0.2 : 0.08;
    const home = p.home.lat != null && p.home.lon != null && t.venue?.lat != null && t.venue?.lon != null
      ? homeTerm(miles({ lat: p.home.lat, lon: p.home.lon }, { lat: t.venue.lat, lon: t.venue.lon }), p.home.state === t.venue.state) : homeTerm(250, false);
    const frozen = s.recruiting?.frozen?.year === s.year ? s.recruiting.frozen.schools[t.id] : undefined;
    return {
      value, pay, ratio_away: away.ratio, demand: 1 + 0.4 * Math.max(0, Math.min(1, (o - away.bar[p.pos]) / 8)),
      start_here, start_away: best.start,
      dev_here: frozen?.development ?? (devRate(this.facilityGrades(t.id)) - 1) * 5,
      fit: Math.max(-1.5, Math.min(1.5, this.hiddenOf(p).fit)),
      win_here: winTerm(me.prestige, me.win, me.tier === 0, q), win_away: winTerm(best.tier === 0 ? 70 : best.tier === 1 ? 40 : 25, 0.55, best.tier === 0, q),
      home_here: home, home_away: homeTerm(250, false),
      morale: s.player_morale?.[p.id] ?? 0, years: p.years, tier: me.tier, tier_away: best.tier,
      contract: !!activeContract(s.contracts?.[p.id], s.year + 1),
      locked: !!activeContract(s.contracts?.[p.id], s.year + 1)?.locked || !!s.next_deals?.[p.id]?.locked,
      costs_season: !!s.settings.pcsa && (s.moves?.[p.id] ?? 0) >= 1,
      promise: s.promises?.[p.id]?.year === s.year + 1,
      noise: hashGauss(s.seed, s.year, p.id, 91),
    };
  }

  /** What staying pays him next season if nothing changes: a deal you've signed, a multi-year deal, or his pay now grown with his value. */
  nextPay(p: RatedPlayer): number {
    const s = this.state;
    const deal = s.next_deals?.[p.id];
    if (deal) return deal.amount;
    const c = activeContract(s.contracts?.[p.id], s.year + 1);
    // Your players: renewing him keeps roughly all he's paid now (revenue share and NIL), nudged by his season.
    // Only a multi-year deal he agreed to holds as it is.
    if (p.team_id === s.user_team_id && !c?.locked) return roundPay(this.pay(p.id) * this.renewalFactor(p).factor);
    if (c) return dealAmount(c);
    const now = this.pay(p.id);
    const v = this.value(p.id);
    const vNext = playerValue({ pos: p.pos, ovr: ovrNext(p), stars: p.stars, years: p.years + 1 });
    return v > 0 ? Math.round(now * vNext / v) : 0;
  }

  /**
   * How his season moves his renewal: where his production ranks among FBS players at his position (season
   * totals, so playing time counts; linemen and punters by games played), plus a little for his honors.
   */
  renewalFactor(p: RatedPlayer): { factor: number; pct: number | null; honor: "all_american" | "poy" | null } {
    const s = this.state, st = s.player_stats?.[p.id];
    const honors = (s.awards ?? []).filter((a) => a.year === s.year && a.pid === p.id);
    const honor = honors.some((a) => a.type === "all_american") ? "all_american" as const : honors.some((a) => a.type === "conf_poy_off" || a.type === "conf_poy_def" || a.type === "heisman") ? "poy" as const : null;
    if (!st || st.gp <= 0) return { factor: renewalNudge(null, honor), pct: null, honor };
    const ranks = this.statRanks();
    const pct = ranks.byGames.has(p.pos) ? Math.min(1, st.gp / Math.max(1, ranks.games.get(p.team_id) ?? st.gp)) * 0.6
      : (() => { const xs = ranks.scores.get(p.pos) ?? []; const me = scoreOf(p.pos, st); let lo = 0; while (lo < xs.length && xs[lo] < me) lo++; return xs.length ? lo / xs.length : 0.5; })();
    return { factor: renewalNudge(pct, honor), pct: Math.round(pct * 100) / 100, honor };
  }
  private statRanks(): { scores: Map<Pos, number[]>; games: Map<number, number>; byGames: Set<Pos> } {
    const s = this.state;
    if (this.rankCache?.date === s.date) return this.rankCache.v;
    const scores = new Map<Pos, number[]>(), byGames = new Set<Pos>(["OL", "P"]);
    for (const [id, st] of Object.entries(s.player_stats ?? {})) {
      const p = this.playerById.get(Number(id));
      if (!p || st.gp <= 0 || byGames.has(p.pos)) continue;
      (scores.get(p.pos) ?? scores.set(p.pos, []).get(p.pos)!).push(scoreOf(p.pos, st));
    }
    for (const xs of scores.values()) xs.sort((a, b) => a - b);
    const games = new Map<number, number>();
    for (const g of s.games) if (g.status === "final") for (const t of [g.home_id, g.away_id]) games.set(t, (games.get(t) ?? 0) + 1);
    const v = { scores, games, byGames };
    this.rankCache = { date: s.date, v };
    return v;
  }
  private rankCache: { date: ISODate; v: { scores: Map<Pos, number[]>; games: Map<number, number>; byGames: Set<Pos> } } | null = null;

  /** Whether you've talked with him: until then your staff assumes his class's typical personality. */
  private known(pid: number): boolean { return this.state.talked?.[pid] != null; }
  private personaOf(pid: number, truth: boolean): Persona { const w = persona(this.state.seed, pid); return truth ? w : typicalPersona(w.kind); }
  /** A player's (or prospect's) personality as his page shows it: his class always, his own traits once you've talked with him. */
  personaRead(pid: number) { return personaView(this.state.seed, pid, this.known(pid)); }

  /**
   * A player's portal watch as you see it: his chance to enter, the reasons and what would keep him. Your staff's
   * read (an average personality) until you've talked with him; then his own.
   */
  watchView(pid: number) {
    const s = this.state, p = this.playerById.get(pid);
    if (!p) return null;
    const w = this.personaOf(pid, this.known(pid));
    const ctx = this.stayContext(p);
    // Your staff only half sees his own pull this year until you've talked with him.
    if (!this.known(pid)) ctx.noise *= 0.5;
    // A player who's committed for next season isn't going anywhere.
    const committed = s.talks?.[pid]?.outcome === "signed";
    const r0 = stayScore(ctx, w), r = committed ? { ...r0, p: 0 } : r0, keep = payFor(ctx, w, COMMIT), walk = keep;
    const leaving = this.leavingSet().has(pid) || p.years + 1 >= 5;
    const reasons = committed ? [] : reasonsOf(r).map((x) => ({ ...x, label: REASON_WORDS[x.reason] }));
    // The first reason money can't answer.
    const top = reasons.find((x) => x.reason !== "pay")?.reason;
    const why = top === "playing" ? (ctx.start_away > ctx.start_here ? `He wants to start: he's behind ${STARTERS[p.pos] === 1 ? "the starter" : "the starters"} here and would start elsewhere.` : "He wants more playing time.")
      : top === "winning" ? "He wants to play for a winner." : top === "home" ? "He wants to be closer to home." : top === "fit" ? "He doesn't fit your scheme." : top === "development" ? "He doesn't think he's developing here." : top === "unhappy" ? "He's unhappy here." : null;
    return {
      p: Math.round(r.p * 1000) / 1000, watch: watchOf(r.p), label: committed ? "Committed" : WATCH_WORDS[watchOf(r.p)], known: this.known(pid), persona: PERSONA_NAMES[w.kind],
      reasons, leaving, value: ctx.value, pay: ctx.pay, keep, walk_range: walk == null ? null : [roundPay(walk * (this.known(pid) ? 0.95 : 0.8)), roundPay(walk * (this.known(pid) ? 1.05 : 1.25))],
      fix: leaving ? "He's out of eligibility after this season." : committed ? `He's committed to stay next season (${money(s.next_deals?.[pid]?.amount ?? ctx.pay)}).` : keep == null ? `${reasons[0]?.reason === "pay" ? "Money alone won't settle him." : "Money won't fix this."} ${why ?? ""}`.trim() : keep <= ctx.pay ? "He's happy with what he has." : this.known(pid) ? `Pay him ${money(keep)} next season and he'll commit to stay.` : `Your staff thinks about ${money(keep)} next season would keep him.`,
      promise: s.promises?.[pid] ?? null,
    };
  }

  /** Monday: your players' portal watch, and an alert when a starter or one of your most valuable players starts shopping. */
  private weeklyWatch(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || !this.roster(me).length || this.done) return;
    const prev = s.watch ?? {}, next: Record<number, number> = {};
    const starters = new Set(Object.values(this.depthChart(me)).map((ids) => ids[0]));
    const top = new Set(this.roster(me).map((p) => ({ id: p.id, v: this.value(p.id) })).sort((a, b) => b.v - a.v).slice(0, 25).map((x) => x.id));
    for (const p of this.roster(me)) {
      if (p.years + 1 >= 5) continue;
      const v = this.watchView(p.id);
      if (!v) continue;
      next[p.id] = v.p;
      const was = prev[p.id];
      if (was != null && was < 0.3 && v.p >= 0.3 && (starters.has(p.id) || top.has(p.id))) {
        rep.news.push(this.news(date, "retention", `${p.pos} ${playerName(p)} is shopping`,
          `${v.reasons.map((r) => r.label).join(", ") || "Several things"} ${v.known ? "" : "(your staff's read) "}could take him to the portal in January. ${v.fix}`, [me]));
      }
    }
    s.watch = next;
  }

  /** Talk with one of your players: you learn his real reasons (five talks a week); it lifts his morale a little. */
  talkTo(pid: number): void {
    const s = this.state, me = s.user_team_id, p = this.playerById.get(pid);
    if (me == null || !p || p.team_id !== me) throw new Error("you can only talk with your own players");
    const monday = addDays(s.date, -((weekday(s.date) + 6) % 7));
    const used = Object.values(s.talked ?? {}).filter((d) => d >= monday && d <= s.date).length;
    if (used >= TALKS_PER_WEEK) throw new Error(`you've had your ${TALKS_PER_WEEK} talks this week`);
    s.talked = { ...s.talked, [pid]: s.date };
    s.player_morale = { ...s.player_morale, [pid]: Math.round(((s.player_morale?.[pid] ?? 0) + 0.05) * 100) / 100 };
    const t = s.talks?.[pid];
    if (t) s.talks = { ...s.talks, [pid]: this.planTalk({ ...t }) };
  }

  /** Next season's roster budget for a school (revenue share, retention fund and boosters), and what's committed to it. */
  nextBudget(teamId: number): { total: number; committed: number; deals: number; contracts: number; recruits: number } {
    const s = this.state, ny = s.year + 1;
    const total = this.nextBudgetTotal(this.team(teamId));
    const leaving = this.leavingSet();
    const deals = Object.entries(s.next_deals ?? {}).reduce((a, [, d]) => a + d.amount, 0);
    let contracts = 0;
    for (const p of this.roster(teamId)) if (!leaving.has(p.id) && !s.next_deals?.[p.id]) { const c = activeContract(s.contracts?.[p.id], ny); contracts += c ? dealAmount(c) : 0; }
    // NIL deals your senior recruits agreed to (unless they've committed elsewhere): theirs when they enroll.
    const recruits = teamId === s.user_team_id ? this.recruitPledges() : 0;
    return { total, committed: deals + contracts + recruits, deals, contracts, recruits };
  }

  private nextBudgetTotal(t: Team): number {
    const s = this.state, f = this.state.budgets?.[t.id] ? this.projectedFortune(t.id) : NEUTRAL, now = this.fortune(t.id);
    const pool = this.adPool(t, s.year + 1, f.ad);
    // Boosters next year: a normal year's, grown with the market, moved by how this season is going.
    const boost = Math.round(this.boosters(t) / now.donors * f.donors * 1.04);
    const ret = s.settings.pcsa ? Math.min(RETENTION_FUND * FOOTBALL_SHARE, 0.6 * boost) : 0;
    return Math.round((pool + Math.max(0, boost - ret) + ret) / 10_000) * 10_000;
  }

  /** Renewal talks open (the day after the conference championships): every player posts a status and an ask, and your standing rule signs most. */
  private openTalks(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || !this.roster(me).length) return;
    s.renewal_rule ??= { ...DEFAULT_RULE };
    s.next_deals ??= {};
    const talks: Record<number, Talk> = {};
    const leaving = this.leavingSet(), nfl = this.nflSlots();
    for (const p of this.roster(me)) {
      let status: TalkStatus;
      if (p.years + 1 >= 5) status = "graduating";
      else if (leaving.has(p.id) || (p.years >= 2 && (nfl.get(p.id) ?? 999) <= 100)) status = "nfl";
      // A multi-year deal he agreed to holds: no talks until it ends. Any other deal is renegotiated every winter.
      else if (activeContract(s.contracts?.[p.id], s.year + 1)?.locked) status = "contract";
      else status = "staying";
      talks[p.id] = this.planTalk({ pid: p.id, status, ask: null, walk: null, patience: patienceOf(persona(s.seed, p.id)) }, true);
    }
    s.talks = talks;
    this.applyRule();
    const open = Object.values(s.talks).filter((t) => !t.outcome && t.plan?.kind === "needs_you").length;
    const signed = Object.values(s.talks).filter((t) => t.deal?.via === "rule").length;
    rep.news.push(this.news(date, "retention", `Renewal talks open: ${open} player${open === 1 ? "" : "s"} need you`,
      `Your standing rule renewed ${signed} players at about their current pay: confirm them on the Renewals screen, or revoke any you'd rather send to the portal. Talks run until January 1; anyone who wants a deal and doesn't have one enters the portal on January 2.`, [me]));
  }

  /** A player's status, ask and walk-away number for the talks, and your staff's plan for him under the rule. */
  private planTalk(t: Talk, fresh = false): Talk {
    const s = this.state, p = this.playerById.get(t.pid)!, w = persona(s.seed, t.pid), rule = s.renewal_rule ?? DEFAULT_RULE;
    if (t.status === "graduating" || t.status === "nfl" || t.status === "contract" || t.outcome) return t;
    const now = this.nextPay(p), ctx = this.stayContext(p, now);
    // The least he'd commit for.
    const walk = payFor(ctx, w, COMMIT), r = stayScore(ctx, w);
    if (walk == null) t.status = r.p > 0.85 ? "leaving" : "testing";
    else t.status = walk <= now || ctx.value === 0 ? "staying" : "raise";
    t.walk = walk;
    if (fresh || t.ask == null) t.ask = walk == null ? null : t.status === "staying" ? Math.max(walk, now) : openingAsk(walk, w);
    t.market = this.marketFor(p, ctx.value);
    const v = ctx.value;
    const important = this.importance(p) <= 30;
    if (t.status === "staying" && v === 0) t.plan = { kind: "renew", amount: 0 };
    // A player happy to stay is renewed at his number (roughly his pay now); the rule's cap on value is for raises.
    else if (t.ask != null && (t.ask <= rule.auto_up_to * v || (t.status === "staying" && t.ask <= Math.max(now, rule.auto_up_to * v)))) t.plan = { kind: "renew", amount: t.ask };
    // (A backup happy to stay at his pay isn't let go: the staff offers him what the rule allows.)
    else if (t.ask != null && t.status !== "staying" && !important && ctx.start_here < 0.4 && t.ask > rule.release_over && t.ask > v) t.plan = { kind: "let_go" };
    // Otherwise the staff offers up to the rule's share of his value; if money won't keep him, he decides for himself in January.
    else t.plan = important ? { kind: "needs_you" } : { kind: "offer", amount: roundPay(rule.offer_up_to * v) };
    return t;
  }

  /** How much a player matters to next season: his rank on your roster by projected rating against his position's starters (1 = most). */
  private importance(p: RatedPlayer): number {
    const roster = this.roster(p.team_id).map((x) => ({ id: x.id, v: this.value(x.id) })).sort((a, b) => b.v - a.v || a.id - b.id);
    return roster.findIndex((x) => x.id === p.id) + 1;
  }

  /** What players like him are paid at his level: the median of up to five comparables (null without enough). */
  marketFor(p: RatedPlayer, value: number): number {
    return this.comparables(p).median ?? roundPay(value * this.portalBasis().tiers[this.tierOf(p.team_id)].ratio);
  }

  /** Five players at his position, rating and level at other schools, and their pay this season. */
  comparables(p: RatedPlayer): { players: { pid: number; team_id: number; name: string; ovr: number; pay: number }[]; median: number | null } {
    const tier = this.tierOf(p.team_id), o = ovrNext(p), out: { pid: number; team_id: number; name: string; ovr: number; pay: number; d: number }[] = [];
    for (const t of this.teams) {
      if (t.id === p.team_id || this.tierOf(t.id) !== tier) continue;
      for (const x of this.roster(t.id)) if (x.pos === p.pos && Math.abs(x.ovr - o) <= 2) out.push({ pid: x.id, team_id: t.id, name: playerName(x), ovr: x.ovr, pay: this.pay(x.id), d: Math.abs(x.ovr - o) * 1000 + (hashGauss(p.id, x.id) + 4) });
    }
    const players = out.sort((a, b) => a.d - b.d).slice(0, 5).map(({ d: _, ...x }) => x);
    const pays = players.map((x) => x.pay).sort((a, b) => a - b);
    return { players, median: pays.length >= 3 ? pays[Math.floor(pays.length / 2)] : null };
  }

  /** Your standing rule signs everyone it covers, most valuable first, within its share of next season's budget. */
  private applyRule(): void {
    const s = this.state, me = s.user_team_id!, rule = s.renewal_rule ?? DEFAULT_RULE;
    const b = this.nextBudget(me);
    let room = rule.budget_share * b.total - b.committed;
    const talks = { ...s.talks };
    const order = Object.values(talks).filter((t) => !t.outcome && !t.mine && t.plan?.kind === "renew")
      .sort((a, b2) => this.value(b2.pid) - this.value(a.pid) || a.pid - b2.pid);
    for (const t of order) {
      // (A player re-signed over a multi-year deal only costs the raise: his deal is already counted.)
      const amount = t.plan!.amount ?? 0, cost = amount - (s.next_deals?.[t.pid] ? 0 : dealAmount(activeContract(s.contracts?.[t.pid], s.year + 1) ?? { amount: 0, years: 0, start: 0 }));
      if (cost > room) continue;
      room -= cost;
      // The rule signs one-year deals (a longer one is yours to negotiate), and nothing is official until you confirm it.
      talks[t.pid] = { ...this.sign({ ...t }, amount, 1, "rule"), pending: true };
    }
    s.talks = talks;
  }

  private sign(t: Talk, amount: number, years: number, via: NonNullable<Talk["deal"]>["via"]): Talk {
    const s = this.state;
    if (amount > 0) s.next_deals = { ...s.next_deals, [t.pid]: { amount, years, ...(years > 1 ? { locked: true } : {}) } };
    return { ...t, deal: { amount, years, via }, outcome: "signed", offer: undefined, pending: undefined };
  }

  /** Make the standing rule's renewals official: these players (all pending ones by default). */
  confirmRenewals(pids?: number[]): number {
    const s = this.state;
    if (!s.talks || s.portal) throw new Error("renewal talks aren't open");
    const want = pids ? new Set(pids) : null;
    let n = 0;
    const talks = { ...s.talks };
    for (const t of Object.values(talks)) if (t.pending && (!want || want.has(t.pid))) { talks[t.pid] = { ...t, pending: undefined }; n++; }
    s.talks = talks;
    return n;
  }

  /** Change your standing rule; your staff re-plans everyone still open (and the rule signs whoever it now covers). */
  setRenewalRule(rule: Partial<RenewalRule>): void {
    const s = this.state;
    if (!s.talks) throw new Error("renewal talks haven't opened");
    s.renewal_rule = { ...(s.renewal_rule ?? DEFAULT_RULE), ...rule };
    s.talks = Object.fromEntries(Object.entries(s.talks).map(([k, t]) => [k, this.planTalk({ ...t })]));
    this.applyRule();
  }

  /** Make one of your players an offer for next season: he answers in a day or two. */
  renewalOffer(pid: number, amount: number, years: number): void {
    const s = this.state, t = s.talks?.[pid], p = this.playerById.get(pid);
    if (!t || !p) throw new Error("no renewal talks with him");
    if (t.outcome) throw new Error("his decision is made");
    if (t.status === "graduating" || t.status === "contract") throw new Error(`he's ${STATUS_WORDS[t.status].toLowerCase()}`);
    if (t.offer) throw new Error("he hasn't answered your last offer yet");
    if (years < 1 || years > eligibilityLeft({ years: p.years + 1 })) throw new Error(`he has ${eligibilityLeft({ years: p.years + 1 })} season(s) left`);
    const b = this.nextBudget(p.team_id);
    if (amount > b.total - b.committed) throw new Error(`that's over next season's budget: ${money(b.total - b.committed)} left`);
    const n = (t.patience ?? 0) * 7 + Object.keys(s.talks!).length;
    s.talks = { ...s.talks, [pid]: { ...t, mine: true, offer: { amount: roundPay(amount), years, made: s.date, answer: addDays(s.date, answerDays(s.seed, pid, n)) } } };
  }

  /** Promise him a starting job next season (one per starting job at his position), or take it back. */
  setPromise(pid: number, on: boolean): void {
    const s = this.state, p = this.playerById.get(pid), me = s.user_team_id;
    if (me == null || !p || p.team_id !== me) throw new Error("you can only promise your own players");
    const ny = s.year + 1, list = { ...s.promises };
    if (on) {
      const held = Object.entries(list).filter(([id, x]) => x.year === ny && Number(id) !== pid && this.playerById.get(Number(id))?.pos === p.pos).length;
      if (held >= STARTERS[p.pos]) throw new Error(`you've already promised every starting ${p.pos} job`);
      list[pid] = { year: ny };
    } else delete list[pid];
    s.promises = list;
    const t = s.talks?.[pid];
    if (t && !t.outcome) s.talks = { ...s.talks, [pid]: this.planTalk({ ...t }) };
  }

  /** Let him go (he enters the portal), or put him back in your staff's hands; "mine" keeps the staff's plan off him on December 31. */
  setTalk(pid: number, patch: { let_go?: boolean; mine?: boolean; reopen?: boolean }): void {
    const s = this.state, t = s.talks?.[pid];
    if (!t) throw new Error("no renewal talks with him");
    if (t.outcome === "signed" && !t.pending) throw new Error("he's already signed");
    if (s.portal) throw new Error("the talks are over");
    let next = { ...t };
    // An unconfirmed renewal: revoke it (let him go, or reopen talks and negotiate yourself).
    if (t.pending && (patch.let_go || patch.reopen)) {
      const deals = { ...s.next_deals }; delete deals[pid]; s.next_deals = deals;
      next = { ...t, pending: undefined, deal: undefined, outcome: undefined, mine: true, plan: { kind: "needs_you" } };
    } else if (t.pending) throw new Error("confirm or revoke his renewal first");
    if (patch.reopen && !t.pending) throw new Error("there's no renewal to reopen");
    if (patch.let_go != null) next.outcome = patch.let_go ? "let_go" : undefined;
    if (patch.mine != null) next.mine = patch.mine;
    s.talks = { ...s.talks, [pid]: next };
  }

  /** Each day of the talks, players answer the offers that have waited a day or two. */
  private talksDay(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    if (!s.talks || me == null) return;
    for (const t of Object.values(s.talks)) {
      if (!t.offer || t.offer.answer > date || t.outcome) continue;
      const p = this.playerById.get(t.pid)!;
      const a = respond(t, t.offer.amount, t.offer.years, persona(s.seed, t.pid));
      if (a.too_long) {
        s.talks[t.pid] = { ...t, offer: undefined };
        rep.news.push(this.news(date, "retention", `${p.pos} ${playerName(p)} won't sign for ${t.offer.years} seasons`,
          a.too_long === 1 ? "He wants a one-year deal so he can test the market again next winter." : `He'll sign for up to ${a.too_long} seasons.`, [me]));
        continue;
      }
      if (a.accepted) {
        s.talks[t.pid] = this.sign(t, t.offer.amount, t.offer.years, "talks");
        rep.news.push(this.news(date, "retention", `${p.pos} ${playerName(p)} commits to stay`, `${money(t.offer.amount)} a year for ${t.offer.years} season${t.offer.years === 1 ? "" : "s"}.`, [me]));
        continue;
      }
      if (a.insulted) s.player_morale = { ...s.player_morale, [t.pid]: Math.round(((s.player_morale?.[t.pid] ?? 0) - 0.3) * 100) / 100 };
      const done = a.patience <= 0;
      s.talks[t.pid] = { ...t, offer: undefined, counter: a.counter ?? undefined, patience: a.patience, outcome: done ? "portal" : undefined };
      rep.news.push(this.news(date, "retention", done ? `${p.pos} ${playerName(p)} is done talking` : `${p.pos} ${playerName(p)} turns down your offer`,
        done ? "He'll enter the portal on January 2. You can still bid for him there." : `He wants ${money(a.counter!)}${a.insulted ? "; the offer insulted him" : ""}. ${a.patience} more round${a.patience === 1 ? "" : "s"} before he stops talking.`, [me]));
    }
  }

  /**
   * January 2: talks are over. Your staff's plan settles anyone you left to it; everyone who wanted a deal and
   * has none enters, and across the country every player decides by his stay-or-go score. Then schools bid.
   */
  private openPortal(date: ISODate, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    const leaving = this.leavingSet(), nfl = this.nflSlots();
    // Your open talks: the staff's plan for whatever you left to it.
    if (s.talks && me != null) {
      const pending = Object.values(s.talks).filter((t) => t.pending);
      for (const t of pending) s.talks[t.pid] = { ...t, pending: undefined };
      if (pending.length) rep.news.push(this.news(date, "retention", `Your staff confirmed ${pending.length} renewal${pending.length === 1 ? "" : "s"}`,
        "Renewals your standing rule made that you hadn't confirmed are now official.", [me]));
      for (const t of Object.values(s.talks)) {
        if (t.outcome || t.status === "graduating" || t.status === "nfl" || t.status === "contract") continue;
        if (t.mine) { if (t.status === "raise") s.talks[t.pid] = { ...t, outcome: "portal" }; continue; }
        const plan = t.plan;
        if (plan?.kind === "renew") s.talks[t.pid] = this.sign(t, plan.amount ?? 0, 1, "staff");
        else if (plan?.kind === "offer" && t.walk != null && t.walk <= (plan.amount ?? 0)) s.talks[t.pid] = this.sign(t, t.walk, 1, "staff");
        // Players you didn't get to get the rule's standard offer.
        else if (plan?.kind === "needs_you" && t.walk != null && t.walk <= (s.renewal_rule ?? DEFAULT_RULE).offer_up_to * this.stayContext(this.playerById.get(t.pid)!).value) s.talks[t.pid] = this.sign(t, t.walk, 1, "staff");
        else if (plan?.kind === "let_go") s.talks[t.pid] = { ...t, outcome: "let_go" };
        else if (t.status === "raise") s.talks[t.pid] = { ...t, outcome: "portal" };
      }
    }
    const entries: PortalEntry[] = [];
    const lastGame = new Map<number, ISODate>();
    for (const g of s.games) for (const id of [g.home_id, g.away_id]) if ((lastGame.get(id) ?? "") < g.date) lastGame.set(id, g.date);
    for (const t of this.teams) {
      const mine = t.id === me;
      const mix = STYLE_MIX[styleOf(this.seed.styles, t.id)];
      for (const p of this.roster(t.id)) {
        if (leaving.has(p.id) || (p.years >= 2 && (nfl.get(p.id) ?? 999) <= 100)) continue;
        let enters: boolean;
        const talk = mine ? s.talks?.[p.id] : undefined;
        if (talk?.outcome === "portal" || talk?.outcome === "let_go") enters = true;
        else if (talk?.outcome === "signed") enters = false;
        else {
          // AI schools offer to keep their players by their style; yours keep what they have.
          const pay = mine ? this.nextPay(p) : Math.round(this.nextPay(p) * mix.retain);
          const r = stayScore(this.stayContext(p, pay), persona(s.seed, p.id));
          enters = new Rng(mixSeed(s.seed, s.year, p.id, "enter")).random() < r.p;
        }
        if (!enters) continue;
        const ctx = this.stayContext(p);
        const r = stayScore(ctx, persona(s.seed, p.id));
        const end = lastGame.get(t.id) ?? date;
        entries.push({
          pid: p.id, from: t.id, entered: end >= date ? addDays(end, 1) : date, status: "open", offers: [],
          reasons: talk?.outcome === "let_go" ? ["Released"] : reasonsOf(r).map((x) => REASON_WORDS[x.reason]),
          ask: roundPay(ctx.value * ctx.ratio_away * ctx.demand),
        });
      }
    }
    s.portal = { year: s.year, entries };
    this.portalCache = null;
    const fbs = entries.filter((e) => this.team(e.from).level === "fbs").length;
    const big = entries.map((e) => this.playerById.get(e.pid)!).sort((a, b) => this.value(b.id) - this.value(a.id) || b.ovr - a.ovr).slice(0, 6);
    rep.news.push(this.news(date, "portal", `The transfer portal opens: ${entries.length} players enter`,
      `${fbs} from FBS. Biggest names: ${big.map((p) => `${p.pos} ${playerName(p)} (${this.team(p.team_id).school})`).join(", ")}.`, big.map((p) => p.team_id)));
    if (me != null) {
      const mineOut = entries.filter((e) => e.from === me).map((e) => this.playerById.get(e.pid)!);
      if (mineOut.length) rep.news.push(this.news(date, "portal", `${mineOut.length} ${this.team(me).school} player${mineOut.length === 1 ? "" : "s"} enter the portal`,
        mineOut.sort((a, b) => b.ovr - a.ovr).map((p) => `${p.pos} ${playerName(p)} (${p.ovr})`).join(", ") + ".", [me]));
    }
  }

  /**
   * What a school still wants next season by position: open spots against a healthy room, starting jobs
   * without a returning starter, and upgrades on its two-deep (a transfer who'd play over the backups it has).
   * `floor` is the rating a newcomer has to beat to be worth a spot.
   */
  needsOf(teamId: number): Partial<Record<Pos, Need>> {
    const nx = this.portalBasis().next.get(teamId);
    const out: Partial<Record<Pos, Need>> = {};
    if (!nx) return out;
    const tiers = this.portalBasis().tiers;
    for (const pos of POSITIONS) {
      const os = nx.os[pos] ?? [], bar = nx.bar[pos] ?? tiers[nx.tier].bar[pos];
      const have = os.length + (nx.signees[pos] ?? 0);
      // Returning players good enough to start at this level.
      const startersBack = os.filter((o) => o >= bar - 3).length;
      // A full roster's share at the position (a healthy room scaled up to the roster limit, less a few spots for walk-ons).
      const spots = Math.max(0, Math.round(ROOM[pos] * FULL_ROOM - have));
      const starter = startersBack < STARTERS[pos];
      // The two-deep's weakest returning player: anyone clearly better is an upgrade.
      const depth = os[Math.min(os.length, 2 * STARTERS[pos]) - 1] ?? 0;
      const upgrade = pos === "K" || pos === "P" || pos === "LS" ? 0 : Math.max(0, (nx.tier === 0 ? STARTERS[pos] : Math.ceil(STARTERS[pos] / 2)) - (nx.transfers_in[pos] ?? 0));
      const floor = starter ? bar - 3 : spots > 0 ? Math.min(bar - 7, depth) : Math.max(bar - 8, depth);
      if (spots > 0 || starter || upgrade > 0) out[pos] = { spots: Math.max(spots, starter ? 1 : 0, upgrade > 0 ? 1 : 0), starter, floor: Math.round(floor) };
    }
    return out;
  }

  /** Each day of the window: AI schools make offers to fill their needs, and players with offers commit. */
  private portalDay(date: ISODate, rep: DayReport): void {
    const s = this.state, pt = s.portal;
    if (!pt || pt.year !== s.year) return;
    const open = pt.entries.filter((e) => e.status === "open" && e.entered <= date);
    if (!open.length) return;
    const { tiers, next } = this.portalBasis();
    const byPos = new Map<Pos, PortalEntry[]>();
    for (const e of open) { const p = this.playerById.get(e.pid)!; const g = byPos.get(p.pos) ?? []; g.push(e); byPos.set(p.pos, g); }
    // What each school has out in offers (by position) and has spent on commits.
    const pending = new Map<number, Map<Pos, number>>(), spent = new Map<number, number>();
    for (const e of pt.entries) for (const o of e.offers) {
      if (e.status === "open") {
        const m = pending.get(o.team_id) ?? new Map<Pos, number>(), pos = this.playerById.get(e.pid)!.pos;
        m.set(pos, (m.get(pos) ?? 0) + 1); pending.set(o.team_id, m);
      }
      if (e.status === "open" || e.to === o.team_id) spent.set(o.team_id, (spent.get(o.team_id) ?? 0) + o.amount);
    }
    // AI schools: offers to the best fits for what they still need, from what's left of next season's money for transfers.
    for (const t of this.teams) {
      if (t.id === s.user_team_id) continue;
      const nx = next.get(t.id);
      if (!nx) continue;
      const style = styleOf(this.seed.styles, t.id), mix = STYLE_MIX[style];
      // (Out of money, a school can still offer a scholarship to players with no market value.)
      let left = Math.max(0, this.transferShare(t) * nx.budget - (spent.get(t.id) ?? 0));
      for (const [pos, need] of Object.entries(this.needsOf(t.id)) as [Pos, Need][]) {
        let want = Math.min(4, 2 * need.spots) - (pending.get(t.id)?.get(pos) ?? 0);
        if (want <= 0) continue;
        const bar = nx.bar[pos] ?? 60;
        // (A player with a crowd of offers is a long shot: schools look elsewhere.)
        const cands = (byPos.get(pos) ?? []).filter((e) => e.from !== t.id && e.offers.length < CROWD && !e.offers.some((o) => o.team_id === t.id))
          .map((e) => ({ e, p: this.playerById.get(e.pid)! })).map((x) => ({ ...x, o: ovrNext(x.p) }))
          // Someone who'd start, or add real depth; not a player far above what the school can attract.
          .filter((x) => x.o >= need.floor && x.o <= bar + (nx.prestige >= 70 ? 40 : nx.tier === 0 ? 12 : nx.tier === 1 ? 5 : 4))
          .map((x) => ({ ...x, sv: schoolValue({ value: Math.max(10_000, playerValue({ pos, ovr: x.o, stars: x.p.stars, years: x.p.years + 1 })), need: need.starter ? 1.4 : 1, fit: 0, style, source: "transfer", years: x.p.years + 1 }) / (1 + 0.3 * x.e.offers.length) + 1000 * hashGauss(t.id, x.e.pid, s.year) }))
          .sort((a, b2) => b2.sv - a.sv || a.e.pid - b2.e.pid);
        for (const c of cands) {
          if (want <= 0) break;
          const value = playerValue({ pos, ovr: c.o, stars: c.p.stars, years: c.p.years + 1 });
          const amount = roundPay(Math.min(left, value * Math.max(0.15, nx.ratio) * mix.transfers * (need.starter ? 1.15 : 0.9)));
          if (value > 0 && amount < 0.25 * value * nx.ratio) continue;
          c.e.offers.push({ team_id: t.id, amount, years: 1, date });
          left -= amount;
          want--;
        }
      }
    }
    // Players with offers commit: slowly at first, most by the end of the window.
    const rng = new Rng(mixSeed(s.seed, date, "portal"));
    for (const e of open) {
      const u = rng.random(), v = rng.random();
      if (!e.offers.length) continue;
      // (Nobody commits the day he enters: every school gets a day to call.)
      const days = daysBetween(e.entered, date);
      if (days < 1 || u >= transferHazard(days, 0)) continue;
      const p = this.playerById.get(e.pid)!;
      const scored = this.scoreOffers(e, p);
      const best = Math.max(...scored.map((x) => x.score));
      if (u >= transferHazard(days, best < -1.5 ? 2 : 0)) continue;
      const pick = scored[chooseIdx(scored.map((x) => x.score), v)];
      this.commitTransfer(e, pick.team_id, date, rep);
    }
  }

  /** How an entrant scores each offer he holds (the recruits' choice model, with his old school's loyalty and your pitches). */
  private scoreOffers(e: PortalEntry, p: RatedPlayer): { team_id: number; score: number }[] {
    const s = this.state, { next } = this.portalBasis(), w = persona(s.seed, p.id);
    const o = ovrNext(p), value = Math.max(10_000, playerValue({ pos: p.pos, ovr: o, stars: p.stars, years: p.years + 1 }));
    const q = Math.max(-2, Math.min(3, (o - 72) / 5));
    return e.offers.map((off) => {
      const t = this.team(off.team_id), nx = next.get(t.id)!;
      const ahead = (nx.os[p.pos] ?? []).filter((x) => x > o).length;
      const start = ahead < STARTERS[p.pos] ? 0.9 : ahead === STARTERS[p.pos] ? 0.4 : 0.1;
      const home = p.home.lat != null && p.home.lon != null && t.venue?.lat != null && t.venue?.lon != null ? miles({ lat: p.home.lat, lon: p.home.lon }, { lat: t.venue.lat, lon: t.venue.lon }) : 400;
      const offer: SchoolOffer = {
        team_id: t.id, prestige: nx.prestige, power: nx.tier === 0, win_pct: nx.win, miles: home, home_state: p.home.state != null && p.home.state === t.venue?.state,
        money: off.amount, start_chance: start, development: (devRate(this.facilityGrades(t.id)) - 1) * 5, fit: 0, chemistry: 0,
        current: t.id === e.from, morale: s.player_morale?.[p.id] ?? 0,
      };
      const pitch = t.id === s.user_team_id ? 0.25 * Math.min(4, e.pitches ?? 0) : 0;
      return { team_id: t.id, score: offerScore(offer, { value, quality: q, persona: w }) + pitch + 0.5 * hashGauss(s.seed, p.id, t.id, 13) };
    });
  }

  private commitTransfer(e: PortalEntry, to: number, date: ISODate, rep: DayReport): void {
    const s = this.state, p = this.playerById.get(e.pid)!, me = s.user_team_id;
    // Most FBS players whose best road leads down to FCS stop playing instead.
    if (to !== me && this.team(e.from).level === "fbs" && this.team(to).level !== "fbs" && new Rng(mixSeed(s.seed, s.year, e.pid, "quit")).random() < QUIT_FCS) {
      e.status = "none";
      return;
    }
    // (Rosters for the bids are recounted tomorrow: the day's basis is kept.)
    e.status = "committed"; e.to = to; e.committed = date;
    const off = e.offers.find((o) => o.team_id === to)!;
    if (to === me) s.next_deals = { ...s.next_deals, [p.id]: { amount: off.amount, years: off.years } };
    const big = p.ovr >= 82 || to === me || e.from === me;
    if (big) rep.news.push(this.news(date, "portal", to === e.from ? `${p.pos} ${playerName(p)} returns to ${this.team(to).school}` : `${p.pos} ${playerName(p)} transfers to ${this.team(to).school}`,
      `From ${this.team(e.from).school} (${p.ovr}), ${money(off.amount)} a year.`, [to, e.from]));
  }

  /** National signing day closes the portal: entrants with offers choose now; anyone without one leaves college football. */
  private closePortal(date: ISODate, rep: DayReport): void {
    const s = this.state, pt = s.portal;
    if (!pt || pt.year !== s.year) return;
    const rng = new Rng(mixSeed(s.seed, date, "portal-close"));
    for (const e of pt.entries) {
      if (e.status !== "open") continue;
      const v = rng.random();
      if (!e.offers.length) { e.status = "none"; continue; }
      const scored = this.scoreOffers(e, this.playerById.get(e.pid)!);
      this.commitTransfer(e, scored[chooseIdx(scored.map((x) => x.score), v)].team_id, date, rep);
    }
    const none = pt.entries.filter((e) => e.status === "none").length;
    rep.news.push(this.news(date, "portal", `The portal closes: ${pt.entries.length - none} players found new schools`, `${none} found none and leave college football.`, []));
  }

  /** The share of next season's budget a school's style puts into transfers (FCS schools don't bid). */
  private transferShare(t: Team): number {
    if (t.level !== "fbs") return 0;
    const style = styleOf(this.seed.styles, t.id);
    return style === "portal" || style === "win_now" ? 0.4 : style === "balanced" ? 0.3 : 0.2;
  }

  /** Bid for a player in the portal (0 withdraws your offer). The money comes from next season's budget. */
  portalOffer(pid: number, amount: number, years: number): void {
    const s = this.state, me = s.user_team_id, e = s.portal?.entries.find((x) => x.pid === pid);
    if (me == null || !e) throw new Error("he isn't in the portal");
    if (e.status !== "open" || e.entered > s.date) throw new Error("he isn't open to offers");
    const p = this.playerById.get(pid)!;
    e.offers = e.offers.filter((o) => o.team_id !== me);
    if (amount <= 0) return;
    if (years < 1 || years > eligibilityLeft({ years: p.years + 1 })) throw new Error(`he has ${eligibilityLeft({ years: p.years + 1 })} season(s) left`);
    const b = this.nextBudget(me);
    const out = s.portal!.entries.filter((x) => x.status === "open").reduce((a, x) => a + (x.offers.find((o) => o.team_id === me)?.amount ?? 0), 0);
    if (amount > b.total - b.committed - out) throw new Error(`that's over next season's budget: ${money(b.total - b.committed - out)} left after your other offers`);
    e.offers.push({ team_id: me, amount: roundPay(amount), years, date: s.date });
  }

  /** A pitch call to a player in the portal (six a day): each builds his interest in your school. */
  portalPitch(pid: number): void {
    const s = this.state, e = s.portal?.entries.find((x) => x.pid === pid);
    if (!e || e.status !== "open") throw new Error("he isn't open");
    const today = s.portal!.entries.reduce((a, x) => a + ((x as PortalEntry & { pitched?: string }).pitched === s.date ? 1 : 0), 0);
    if (today >= PITCHES_PER_DAY) throw new Error(`you've made your ${PITCHES_PER_DAY} pitch calls today`);
    if ((e as PortalEntry & { pitched?: string }).pitched === s.date) throw new Error("you've already called him today");
    e.pitches = (e.pitches ?? 0) + 1;
    (e as PortalEntry & { pitched?: string }).pitched = s.date;
  }

  /** The portal as you see it: entrants with their asks, offers and top schools, and your needs and budget. */
  portalView() {
    const s = this.state, me = s.user_team_id, pt = s.portal;
    const entries = (pt?.entries ?? []).filter((e) => e.entered <= s.date).map((e) => this.portalRow(e));
    return {
      year: pt?.year ?? null, open: !!pt && pt.year === s.year, window: s.events.find((e) => e.type === "portal_window")?.date ?? null,
      entries, needs: me != null ? this.needsOf(me) : {}, budget: me != null ? this.nextBudget(me) : null,
      offered: me != null ? (pt?.entries ?? []).filter((e) => e.status === "open").reduce((a, e) => a + (e.offers.find((o) => o.team_id === me)?.amount ?? 0), 0) : 0,
      pitches_left: PITCHES_PER_DAY - (pt?.entries ?? []).filter((x) => (x as PortalEntry & { pitched?: string }).pitched === s.date).length,
    };
  }

  /** One player's portal entry as you see it (null when he isn't in this winter's portal). */
  portalEntry(pid: number) {
    const s = this.state, e = s.portal?.year === s.year ? s.portal.entries.find((x) => x.pid === pid && x.entered <= s.date) : undefined;
    return e ? this.portalRow(e) : null;
  }

  private portalRow(e: PortalEntry) {
      const s = this.state, me = s.user_team_id, p = this.playerById.get(e.pid)!;
      const scored = e.status === "open" && e.offers.length ? this.scoreOffers(e, p) : [];
      const chances = scored.length ? softmax(scored.map((x) => x.score)) : [];
      const top = scored.map((x, i) => ({ team_id: x.team_id, share: Math.round(chances[i] * 100) })).sort((a, b) => b.share - a.share).slice(0, 5);
      const mine = e.offers.find((o) => o.team_id === me);
      return {
        pid: e.pid, name: playerName(p), pos: p.pos, ovr: p.ovr, next: Math.round(ovrNext(p)), potential: this.scoutedPotential(p), years: p.years, cls: p.class, stars: p.stars,
        from: e.from, entered: e.entered, reasons: e.reasons, ask: e.ask, offers: e.offers.length, status: e.status, to: e.to ?? null,
        top, mine: mine ? { amount: mine.amount, years: mine.years } : null, pitches: e.pitches ?? 0,
        costs_season: !!s.settings.pcsa && (s.moves?.[e.pid] ?? 0) >= 1,
        offers_list: e.offers.map((o) => ({ team_id: o.team_id, amount: o.team_id === me ? o.amount : null, years: o.years, date: o.date })),
        pitched_today: (e as PortalEntry & { pitched?: string }).pitched === s.date,
        /** His stats this season (the season he's leaving). */
        stats: s.player_stats?.[e.pid] ?? null,
      };
  }

  /** A player's Future tab: his portal watch, what keeps him, the talks and players like him. Your players only. */
  futureView(pid: number) {
    const s = this.state, p = this.playerById.get(pid), me = s.user_team_id;
    if (!p || me == null || p.team_id !== me) return null;
    const row = this.retentionRow(p, new Set(Object.values(this.depthChart(me)).map((ids) => ids[0])));
    const monday = addDays(s.date, -((weekday(s.date) + 6) % 7));
    return {
      ...row, comparables: this.comparables(p), budget: this.nextBudget(me), rule: s.renewal_rule ?? DEFAULT_RULE,
      talks_open: !!s.talks && !s.portal, talked: s.talked?.[pid] ?? null, eligibility: eligibilityLeft({ years: p.years + 1 }),
      talks_left: TALKS_PER_WEEK - Object.values(s.talked ?? {}).filter((d) => d >= monday && d <= s.date).length,
      dates: { talks: s.events.find((e) => e.type === "renewal_talks")?.date ?? null, portal: s.events.find((e) => e.type === "portal_window")?.date ?? null },
    };
  }

  /** Your retention screen: every player's portal watch, and the renewal talks when they're open. */
  retentionView() {
    const s = this.state, me = s.user_team_id;
    if (me == null) return null;
    const starters = new Set(Object.values(this.depthChart(me)).map((ids) => ids[0]));
    const rows = this.roster(me).map((p) => this.retentionRow(p, starters));
    const monday = addDays(s.date, -((weekday(s.date) + 6) % 7));
    return {
      talks_open: !!s.talks && !s.portal, portal_open: s.portal?.year === s.year && s.portal.entries.some((e) => e.status === "open"),
      rule: s.renewal_rule ?? DEFAULT_RULE, budget: this.nextBudget(me), rows,
      talks_left: TALKS_PER_WEEK - Object.values(s.talked ?? {}).filter((d) => d >= monday && d <= s.date).length,
      dates: { talks: s.events.find((e) => e.type === "renewal_talks")?.date ?? null, portal: s.events.find((e) => e.type === "portal_window")?.date ?? null },
    };
  }

  /**
   * How he feels about a longer deal: how much more a year he wants per extra season and the longest he'll
   * sign. Until you talk with him your staff reads him as a typical player.
   */
  lengthView(p: RatedPlayer): { premium: number; max: number; known: boolean } {
    const known = this.known(p.id), w = known ? persona(this.state.seed, p.id) : { money: 1, development: 1, loyalty: 1, home: 1 };
    return { premium: lengthPremium(w), max: Math.min(maxYears(w), eligibilityLeft({ years: p.years + 1 })), known };
  }

  private retentionRow(p: RatedPlayer, starters: Set<number>) {
    const s = this.state, w = this.watchView(p.id)!, t = s.talks?.[p.id];
    return {
      pid: p.id, name: playerName(p), pos: p.pos, ovr: p.ovr, years: p.years, cls: p.class, starter: starters.has(p.id), importance: this.importance(p),
      watch: w, talk: t ? { status: t.status, label: STATUS_WORDS[t.status], ask: t.ask, patience: t.patience, offer: t.offer ?? null, counter: t.counter ?? null,
        deal: t.deal ?? null, outcome: t.outcome ?? null, mine: !!t.mine, plan: t.plan ?? null, market: t.market ?? null, length: this.lengthView(p), pending: !!t.pending } : null,
      pay: this.pay(p.id), next_deal: s.next_deals?.[p.id] ?? null,
      /** How his season moves his renewal, and his season's line. */
      renewal: this.renewalFactor(p), line: s.player_stats?.[p.id] ? lineText(s.player_stats[p.id]) : "", gp: s.player_stats?.[p.id]?.gp ?? 0,
    };
  }

  /** The fourth game of the season: a promised starter who isn't starting has had his promise broken. */
  private checkPromises(g: Game, rep: DayReport): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || (g.home_id !== me && g.away_id !== me) || g.kind !== "regular") return;
    const played = s.games.filter((x) => x.kind === "regular" && x.status === "final" && (x.home_id === me || x.away_id === me)).length;
    if (played !== 4) return;
    const starters = new Set(Object.values(this.depthChart(me)).map((ids) => ids[0]));
    for (const [id, pr] of Object.entries(s.promises ?? {})) {
      const pid = Number(id), p = this.playerById.get(pid);
      if (pr.year !== s.year || pr.broken || !p || p.team_id !== me || starters.has(pid)) continue;
      s.promises![pid] = { ...pr, broken: true };
      s.player_morale = { ...s.player_morale, [pid]: -1.5 };
      rep.news.push(this.news(g.date, "retention", `${p.pos} ${playerName(p)}: a broken promise`, "You promised him a starting job and he isn't starting. He won't forget it this winter.", [me]));
    }
  }

  /** Leagues saved before the portal: renewal talks and the window go on the calendar. */
  upgradePortal(): void {
    const s = this.state;
    for (const e of s.events) if (e.type === "portal_window" && e.status !== "done") e.active = true;
    if (!s.events.some((e) => e.type === "renewal_talks")) {
      const ev = seasonEvents(s.year, s.events.find((e) => e.type === "dynasty_start")?.date ?? this.seed.start_date, this.seed.schedule, s.settings.playoff).filter((e) => e.type === "renewal_talks" && e.date >= s.date);
      s.events = sortEvents([...s.events, ...ev]);
    }
  }

  /** Leagues saved before the carousel: this season's carousel goes on the calendar if it's still ahead. */
  upgradeCoaching(): void {
    const s = this.state;
    if (!s.coaching || s.events.some((e) => e.type === "coaching_carousel")) return;
    const date = addDays(nthWeekday(s.year, 11, 6, 4), 1);
    if (date < s.date) return;
    s.events = sortEvents([...s.events, { id: `${s.year}:coaching_carousel:${date}`, date, end_date: CAROUSEL_CLOSE(s.year), type: "coaching_carousel", scope: "league",
      label: "Coaching carousel", status: "upcoming", needs_you: false, approx: false, active: true }]);
  }

  // ---- stats, awards and redshirts -------------------------------------------------------------
  private names = new Map<number, Map<string, number>>();
  private pidByName(teamId: number, name: string): number | undefined {
    const build = () => {
      const m = new Map<string, number>();
      for (const p of this.roster(teamId)) if (!m.has(playerName(p))) m.set(playerName(p), p.id);
      this.names.set(teamId, m);
      return m;
    };
    // Rosters change (signings, the portal, a new season): a name the cached map misses rebuilds it.
    const m = this.names.get(teamId);
    return m?.get(name) ?? build().get(name);
  }

  /**
   * One team's box score lines with who each player is: the engine keeps ball carriers by name and the
   * game day keeps defenders by id, so this joins them into one row per player (pid null when nobody on
   * the roster has that name any more). `defense` is this team's defenders only.
   */
  boxRows(teamId: number, players: Record<string, unknown>, defense: Record<number, DefLine>): BoxRow[] {
    const rows = new Map<string, BoxRow>();
    for (const [name, l] of Object.entries(players)) {
      const pid = this.pidByName(teamId, name) ?? null;
      const p = pid != null ? this.playerById.get(pid) : undefined;
      rows.set(pid != null ? `#${pid}` : name, { ...(l as StatLine), pid, name, pos: p?.pos ?? "", team_id: teamId });
    }
    for (const [k, l] of Object.entries(defense)) {
      const pid = Number(k), p = this.playerById.get(pid);
      const row = rows.get(`#${pid}`);
      if (row) Object.assign(row, l);
      else rows.set(`#${pid}`, { ...l, pid: p ? pid : null, name: p ? playerName(p) : "Unknown", pos: p?.pos ?? "", team_id: teamId });
    }
    return [...rows.values()];
  }

  /** Add a game to season stats and to each player's best game of the week. */
  recordStats(g: Game, d: GameDetail, week = true): void {
    const s = this.state;
    const homeWon = g.home_score! > g.away_score!;
    const ts = (s.team_stats ??= {});
    const team = (id: number) => (ts[id] ??= { gp: 0, w: 0, l: 0, pf: 0, pa: 0, off: {}, def: {} });
    if (d.home_box && d.away_box) {
      addTeamGame(team(g.home_id), g.home_score!, g.away_score!, d.home_box, d.away_box);
      addTeamGame(team(g.away_id), g.away_score!, g.home_score!, d.away_box, d.home_box);
    }
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
    s.team_stats = {};
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
    for (const w of week) { const c = this.team(w.team_id).conference; if (this.inConference(c)) confs.set(c, [...(confs.get(c) ?? []), w]); }
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
    for (const r of rows) { const c = this.team(r.st.team_id).conference; if (this.inConference(c)) confs.set(c, [...(confs.get(c) ?? []), r]); }
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
      case "early_signing": {
        const st = s.recruiting;
        if (!st) break;
        earlySigning(st, s.year, new Rng(mixSeed(s.seed, s.year, "early-signing")));
        this.signingNews(e.date, "Early signing period", rep);
        break;
      }
      case "signing_day": {
        const st = s.recruiting;
        if (!st) break;
        signingDay(st, s.year, this.schools(e.date), this.week, e.date, new Rng(mixSeed(s.seed, s.year, "signing-day")));
        this.signingNews(e.date, "National signing day", rep);
        this.closePortal(e.date, rep);
        break;
      }
      case "draft_deadline": this.declarations(e.date, rep); break;
      case "coaching_carousel": this.openCarouselDay(e.date, rep); break;
      case "renewal_talks": this.openTalks(e.date, rep); break;
      case "portal_window": this.openPortal(e.date, rep); break;
      case "nfl_draft": this.draftDay(e.date, rep); break;
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
      plans: { [userSide]: this.gamePlan }, prep: { [userSide]: scaleEdge(prepEdge(this.prepFor(g.id)), this.prepFactor()) },
      schemes: { home: this.allSchemes()[g.home_id], away: this.allSchemes()[g.away_id] },
      scout: { home: this.scoutKnowledge(g.home_id, g.id), away: this.scoutKnowledge(g.away_id, g.id) },
      ratings: { home: this.teamRatings(g.home_id) ?? undefined, away: this.teamRatings(g.away_id) ?? undefined },
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

  /** Record the user's clock management from a live game. */
  setClockCalls(gameId: number, clock: ClockEvent[]): void {
    if (!clock.length) return;
    (this.state.clock_calls ??= {})[gameId] = clock;
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

  /**
   * Film of the next opponent: in the six days before your game, the staff's opponent share of its week
   * goes into film, worth more with a better scouting staff.
   */
  private filmDay(today: ISODate): void {
    const s = this.state, me = s.user_team_id;
    if (me == null || !s.recruiting) return;
    const g = this.nextUserGame();
    if (!g || g.date <= today || daysBetween(today, g.date) > 6) return;
    if (!s.film || s.film.game_id !== g.id) s.film = { game_id: g.id, hours: 0 };
    const share = timeSplit(s.recruiting.user.time, true).opponent;
    s.film.hours = Math.round((s.film.hours + STAFF_HOURS / 6 * share * filmEff(staffSkill(this.staff(me), "scouting"))) * 10) / 10;
    // The night before the game, the staff's opponent report reaches your inbox.
    if (daysBetween(today, g.date) === 1) this.opponentMail(today);
  }

  private opponentMail(date: ISODate): void {
    const r = this.scoutReport();
    if (!r) return;
    const opp = this.team(r.opponent), found = r.insights;
    const lines = found.map((x) => `${x.side === "offense" ? "Their offense" : x.side === "defense" ? "Their defense" : "Personnel"}: ${x.text}${x.counter ? ` ${x.counter}` : ""}`);
    this.mail({ date, category: "opponent", from: "Your staff", subject: `Opponent report: ${opp.school} (${Math.round(r.knowledge * 100)}% known)`,
      body: [`${r.hours} hours of film this week (a usual week is ${Math.round(r.usual)}).`, ...(lines.length ? lines : ["Nothing on film stands out yet."])].join("\n"),
      team_ids: [r.opponent], links: [{ label: "Game plan", to: "plan" }, { label: opp.school, to: `team/${opp.id}` }] });
  }

  /** How well a team's staff knows its opponent in a game (0 to 1): your film this week, or a usual week for everyone else. */
  scoutKnowledge(teamId: number, gameId: number): number {
    const s = this.state;
    if (teamId === s.user_team_id) return knowledge(BASE_FILM + (s.film?.game_id === gameId ? s.film.hours : 0));
    return knowledge(BASE_FILM + USUAL_FILM_HOURS * filmEff(staffSkill(this.staff(teamId), "scouting")));
  }

  /** Your staff's report on your next opponent: what it knows, and the tendencies it has found. */
  scoutReport(): { game_id: number; opponent: number; knowledge: number; hours: number; usual: number; insights: Insight[]; schemes: TeamSchemes } | null {
    const s = this.state, me = s.user_team_id, g = this.nextUserGame();
    if (me == null || !g) return null;
    const opp = g.home_id === me ? g.away_id : g.home_id;
    const r = this.teamRatings(opp);
    const sc = this.allSchemes()[opp];
    if (!r || !sc) return null;
    const k = this.scoutKnowledge(me, g.id);
    return { game_id: g.id, opponent: opp, knowledge: k, hours: s.film?.game_id === g.id ? s.film.hours : 0, usual: USUAL_FILM_HOURS * filmEff(staffSkill(this.staff(me), "scouting")),
      insights: insights(tendencies(r, sc), k, s.seed, g.id), schemes: sc };
  }

  private play(g: Game, rep: DayReport): void {
    const s = this.state;
    const rankH = this.rankOf(g.home_id), rankA = this.rankOf(g.away_id);
    this.recordGate(g);
    const { sim, gd, sides, caller } = this.gameSetup(g);
    const subs = s.subs?.[g.id] ?? [];
    const userSide = caller?.userSide;
    const clock = s.clock_calls?.[g.id] ?? [];
    const called = caller ? caller.replay(s.calls?.[g.id] ?? [], (i) => {
      for (const x of subs) if (x.at === i && gd && userSide) gd.setDepth(userSide, x.depth);
      for (const x of clock) if (x.at === i && userSide) applyClock(sim, userSide, x);
    }) : undefined;
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
    this.checkPromises(g, rep);
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
      // Better medical facilities than the league started with bring players back sooner.
      const k = this.facilityEffect(x.team_id).injury, days = k === 1 || x.days === 0 ? x.days : Math.max(1, Math.round(x.days * k));
      const inj: Injury = { pid: x.pid, team_id: x.team_id, name: x.name, pos: x.pos, game_id: g.id, date: g.date, type: x.type, days,
        back: addDays(g.date, Math.max(1, days)), starter };
      s.injuries!.push(inj);
      const t = this.team(x.team_id);
      const mine = s.user_team_id === x.team_id;
      // Around the league only starting quarterbacks and ranked teams' season-ending injuries make the news.
      const notable = starter && t.level === "fbs" && (x.pos === "QB" ? x.days >= 5 : x.days >= 90 && this.rankOf(t.id) != null);
      if (x.days >= 5 && (mine || notable)) {
        rep.news.push(this.news(g.date, "injury", `${t.school} ${POSITIONS.includes(x.pos) ? x.pos : ""} ${x.name} ${injuryOutlook(days)}`.replace(/\s+/g, " "),
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
    if (mine) {
      const won = (s.user_team_id === g.home_id) === homeWon, opp = s.user_team_id === g.home_id ? a : h;
      const r = records(s.games, this.teams).get(s.user_team_id!);
      this.mail({ date: g.date, category: "games", from: g.label ?? "Final", subject: `${won ? "Win" : "Loss"} ${won ? "over" : "to"} ${opp.school}: ${this.scoreLine(g)}`,
        body: r ? `You're ${r.w}-${r.l}.` : "", team_ids: [g.home_id, g.away_id], links: [{ label: "Box score", to: `game/${g.id}` }] }, rep);
    }
  }

  /** Post a message to the user team's inbox (none without a user team); returns it. */
  mail(m: InboxPost, rep?: DayReport | null): InboxMessage | null {
    const s = this.state, me = s.user_team_id;
    if (me == null) return null;
    s.inbox ??= [];
    const date = m.date ?? s.date;
    const msg: InboxMessage = { ...m, id: `${s.year}:${date}:${s.inbox.length}`, date, team_ids: m.team_ids ?? [me] };
    s.inbox.push(msg);
    rep?.inbox.push(msg);
    return msg;
  }

  private news(date: ISODate, kind: string, headline: string, body: string, team_ids: number[]): NewsItem {
    const n = { id: `${date}:${this.state.news.length}`, date, kind, headline, body, team_ids };
    this.state.news.push(n);
    this.newsMail(n);
    return n;
  }

  /** The news the user team's coach should see, into the inbox (inbox.ts says which). */
  private newsMail(n: NewsItem): void {
    const me = this.state.user_team_id;
    if (me == null) return;
    const r = newsToInbox(n.kind, n.team_ids, me);
    if (!r) return;
    let subject = n.headline;
    if (n.kind === "poll") {
      const rk = this.latestPoll("ap")?.ranks.findIndex((x) => x.team_id === me) ?? -1;
      subject += rk >= 0 && rk < 25 ? ` · ${this.team(me).school} No. ${rk + 1}` : ` · ${this.team(me).school} unranked`;
    }
    this.mail({ ...r, date: n.date, subject, body: n.body, team_ids: n.team_ids.length ? n.team_ids : [me], news_id: n.id, urgent: URGENT_NEWS.test(n.headline) || undefined });
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

  /** The league's conferences, and one by name. */
  conferences(): ConferenceDef[] { return this.state.conferences!; }
  conference(name: string): ConferenceDef | undefined { return this.state.conferences!.find((c) => c.name === name); }
  /** A real conference (not the independents) that plays for a title. */
  inConference(name: string): boolean { const c = this.conference(name); return !!c && c.tier !== "independent"; }
  /** Every bowl in selection order with the league's tie-ins (the New Year's Six first). */
  bowlSlate(): Bowl[] { return [...NY6, ...BOWLS].map((b) => ({ ...b, sides: this.state.tie_ins?.[b.name] ?? b.sides })); }

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
    for (const t of this.teams) if (this.inConference(t.conference) && this.conference(t.conference)!.title_game) byConf.set(t.conference, [...(byConf.get(t.conference) || []), t]);
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
      this.addGame(rep, { kind: "conf_champ", date, home_id: a.id, away_id: b.id, neutral: this.conference(conf)!.tier === "power", venue: null, label: `${conf} Championship` });
    }
  }

  private crownChampions(titles: Game[], rep: DayReport): void {
    const s = this.state;
    for (const g of titles) s.conf_champs[this.team(g.home_id).conference] = this.winner(g).team_id;
    // Conferences without a title game (or every one, when the league plays none) crown their standings leader.
    for (const c of this.conferences()) {
      if (c.tier === "independent" || s.conf_champs[c.name] != null) continue;
      const ts = this.teams.filter((t) => t.conference === c.name);
      if (ts.length) s.conf_champs[c.name] = this.confStandings(c.name, ts)[0].t.id;
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
    // Conferences' guaranteed spots go to their best teams in the ranking, then the highest-ranked champions take the automatic bids.
    const field: number[] = [];
    for (const c of this.conferences()) {
      if (!c.cfp_bids || c.tier === "independent") continue;
      field.push(...ranking.ranks.filter((r) => this.team(r.team_id).conference === c.name).slice(0, c.cfp_bids).map((r) => r.team_id));
    }
    const auto = ranking.ranks.filter((r) => champs.has(r.team_id) && !field.includes(r.team_id)).slice(0, p.auto_bids).map((r) => r.team_id);
    field.push(...auto);
    field.splice(p.teams);
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
    const bowls = this.bowlSlate().filter((b) => !usedByPlayoff.has(b.name)).map((bowl) => ({ bowl, date: bowlDate(bowl, s.year) }));
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
