/**
 * Play-by-play game engine: a TypeScript port of reference/cfb_sim/engine.py (via the browser app's
 * engine.js), with every constant and decision rule unchanged.
 *
 * Field position: `yl` is yards to the opponent's goal line (100 = own goal line, 0 = touchdown).
 *
 * Steppable: the game runs as a generator that stops at every snap and at every choice a coach makes
 * (4th down, run or pass, two-point try, onside kick, kneel-down). Each stop is a DecisionRequest
 * carrying the engine's own call as `suggestion`; whoever drives the generator answers it (a human, a
 * coordinator AI, or nothing, which takes the suggestion). The suggestion is always computed first, so
 * random draws happen in the same order whoever answers, and `play()` reproduces the Python engine.
 */
import { Rng } from "./rng.ts";
import { buildMatchup, LEAGUE_PASS_RATE, LEAGUE_PLAYS_PER_GAME, type Matchup, type PlayerShare, type TeamRatings } from "./ratings.ts";
import { newTeamStats, PlayerBook, teamDerived, type TeamBox, type TeamStats } from "./boxscore.ts";
import FOURTH_DOWN from "./fourth_down_table.json" with { type: "json" };

// ---- constants (engine.py) --------------------------------------------------------
export const QUARTER_SECONDS = 900;
/** Yardage bump for the home offense: about 5 points a game between equal teams (measured). */
export const HOME_EDGE = 0.039;
/** Seconds of clock between snaps at league pace (32 reproduces 2026's ~66 plays per team). */
export const BETWEEN_PLAYS_BASE = 32;
export const SCRAMBLE_RATE = 0.12;
export const SCRAMBLE_SCALE = 5.1;
export const RUSH_CAL = 1.10;
export const COMP_YDS_CAL = 1.107;
export const COMP_PCT_CAL = 1.01;
export const STICKS_RUN = 0.25;
export const STICKS_PASS = 0.30;
export const TWO_PT_BASE = 0.46;
export const AGGR_LOGIT = 1.0;
export const FG_SLOPE = 0.082;
export const FG_MID = 51.25;
export const FG_MAX_EXTRA = 5;

const trunc = Math.trunc;

/** Python 3 round(): half to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x), diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
const logit4 = (p: number) => { p = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(p / (1 - p)); };
const logit3 = (p: number) => { p = Math.min(Math.max(p, 1e-3), 1 - 1e-3); return Math.log(p / (1 - p)); };
const invLogit = (x: number) => 1 / (1 + Math.exp(-x));

export function fourthDownMix(yl: number, ytg: number): [number, number, number] {
  const find = (labels: string[], x: number) => {
    for (const lab of labels) {
      const [lo, hi] = lab.split("-").map(Number);
      if (lo <= x && x <= hi) return lab;
    }
    return labels[labels.length - 1];
  };
  const key = `${find(FOURTH_DOWN.zones, Math.max(1, yl))}|${find(FOURTH_DOWN.dists, Math.max(1, ytg))}`;
  return (FOURTH_DOWN.table as unknown as Record<string, [number, number, number]>)[key];
}

export function situationBucket(down: number, distance: number): string {
  if (down === 1) return "1st";
  if (down === 2) return distance >= 8 ? "2nd_long" : distance <= 3 ? "2nd_short" : "2nd_mid";
  return distance >= 8 ? "3rd_long" : distance >= 5 ? "3rd_mid" : distance >= 3 ? "3rd_short" : "3rd_inches";
}

// ---- yardage samplers -----------------------------------------------------------------
/** erf to near machine precision (Python uses math.erf). */
function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  if (x < 3) {
    let sum = x, term = x, n = 0;
    while (Math.abs(term) > 1e-15 * Math.abs(sum)) { n++; term *= -x * x / n; sum += term / (2 * n + 1); }
    return s * 2 / Math.sqrt(Math.PI) * sum;
  }
  let f = 0;
  for (let k = 60; k >= 1; k--) f = (k / 2) / (x + f);
  return s * (1 - Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f));
}
const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/** Mean of round(N(mu, sd)) clipped to [lo, hi]. */
function clippedMean(mu: number, sd: number, lo: number, hi: number): number {
  let total = 0;
  for (let k = lo; k <= hi; k++) {
    const a = k === lo ? -Infinity : (k - 0.5 - mu) / sd;
    const b = k === hi ? Infinity : (k + 0.5 - mu) / sd;
    const p = (b === Infinity ? 1 : normCdf(b)) - (a === -Infinity ? 0 : normCdf(a));
    total += k * p;
  }
  return total;
}

/** Mixture of stuffed run, ordinary gain, explosive run; the mid-mode mean is solved so the overall mean matches. */
export interface RushModel { stuff: number; explosive: number; mid_mu: number }
const RUSH = { STUFF_MEAN: -1.3, EXPL_BASE: 12, EXPL_TAIL: 11.0, MID_SD: 2.7 };

export function fitRush(ypc: number, stuff: number, explosive: number): RushModel {
  const midShare = 1 - stuff - explosive;
  let target = (ypc - stuff * RUSH.STUFF_MEAN - explosive * (RUSH.EXPL_BASE + RUSH.EXPL_TAIL)) / midShare;
  target = Math.min(Math.max(target, 1.2), 10.5);
  let lo = -5, hi = 15;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (clippedMean(mid, RUSH.MID_SD, 1, 11) < target) lo = mid; else hi = mid;
  }
  return { stuff, explosive, mid_mu: (lo + hi) / 2 };
}

/**
 * fitRush by table lookup: the same model to about 1e-4 of a yard, without the 40-step search.
 * Substitutions refit every few snaps; kickoff keeps the exact fit so engine parity is untouched.
 */
let midTable: Float64Array | null = null;
const MID_LO = -5, MID_STEP = 0.005, MID_N = 4001;
export function fitRushFast(ypc: number, stuff: number, explosive: number): RushModel {
  const t = (midTable ??= Float64Array.from({ length: MID_N }, (_, i) => clippedMean(MID_LO + i * MID_STEP, RUSH.MID_SD, 1, 11)));
  const midShare = 1 - stuff - explosive;
  let target = (ypc - stuff * RUSH.STUFF_MEAN - explosive * (RUSH.EXPL_BASE + RUSH.EXPL_TAIL)) / midShare;
  target = Math.min(Math.max(target, 1.2), 10.5);
  let lo = 0, hi = MID_N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] < target) lo = m; else hi = m; }
  const f = (target - t[lo]) / (t[hi] - t[lo] || 1);
  return { stuff, explosive, mid_mu: MID_LO + (lo + f) * MID_STEP };
}

function sampleRush(m: RushModel, rng: Rng): number {
  const u = rng.random();
  if (u < m.stuff) return -Math.min(trunc(rng.expovariate(1 / 1.3)), 8);
  if (u < m.stuff + m.explosive) return RUSH.EXPL_BASE + trunc(rng.expovariate(1 / RUSH.EXPL_TAIL));
  return trunc(Math.min(Math.max(pyRound(rng.gauss(m.mid_mu, RUSH.MID_SD)), 1), 11));
}

function sampleCompletionYards(rng: Rng, mean: number): number {
  const shape = 1.35;
  const y = rng.gammavariate(shape, (mean + 1.5) / shape) - 1.5;
  return Math.max(-4, trunc(pyRound(y)));
}

interface Player { name: string; pos: string; share: number; catch_mult: number; ypc_mult: number }

/**
 * A play call's effect on one scrimmage snap: shifts on the offense's matchup (log-odds for rates,
 * log for yards) and, optionally, who can get the ball. It changes odds only, never the number of
 * random draws, so a game without one is the calibrated engine draw for draw.
 */
export interface SnapMod {
  comp?: number; ypcomp?: number; sack?: number; int?: number; scramble?: number;
  ypc?: number; stuff?: number; explosive?: number;
  /** Only these positions carry (e.g. ["QB"] for a designed QB run) or are targeted (["RB", "TE"] for a screen). */
  rushers?: string[]; receivers?: string[];
}

const prep = (r: TeamRatings) => ({ ...r, rushers: normalizePlayers(r.rushers || []), receivers: normalizePlayers(r.receivers || []) });

/** Rescale player multipliers so the share-weighted mean is 1, keeping team rates intact. */
function normalizePlayers(players: PlayerShare[]): Player[] {
  const out: Player[] = players.map((p) => ({ catch_mult: 1, ypc_mult: 1, ...p }) as Player);
  const tot = out.reduce((s, p) => s + p.share, 0);
  if (!tot) return out;
  for (const attr of ["ypc_mult", "catch_mult"] as const) {
    const mean = out.reduce((s, p) => s + p.share * p[attr], 0) / tot;
    for (const p of out) p[attr] /= mean;
  }
  return out;
}

// ---- records -------------------------------------------------------------------
export interface PlayRecord {
  quarter: number;
  clock: number;
  offense: string;
  offense_home: boolean;
  down: number;
  distance: number;
  yardline: string;
  play_type: string;
  description: string;
  yards: number;
  home_score: number;
  away_score: number;
  drive: number;
  yards_to_goal: number;
}

export interface DriveRecord {
  num: number;
  team: string;
  home: boolean;
  quarter: number;
  clock: number;
  start_yl: number;
  plays: number;
  yards: number;
  seconds: number;
  result: string;
}

// ---- decisions -------------------------------------------------------------------
export type FourthDownCall = "go" | "fg" | "punt";
export type PlayCall = "run" | "pass";

export interface Situation {
  quarter: number;
  clock: number;
  down: number;
  distance: number;
  yl: number;
  home_score: number;
  away_score: number;
  offense_home: boolean;
  overtime: boolean;
}

/** A stop in the game. `side` is the team that owns the choice; `snap` stops carry no choice. */
export type DecisionRequest =
  | { kind: "snap"; side: "home" | "away"; situation: Situation; suggestion: null }
  | { kind: "fourthDown"; side: "home" | "away"; situation: Situation; suggestion: FourthDownCall }
  | { kind: "playCall"; side: "home" | "away"; situation: Situation; suggestion: PlayCall }
  | { kind: "twoPoint"; side: "home" | "away"; situation: Situation; suggestion: boolean }
  | { kind: "onside"; side: "home" | "away"; situation: Situation; suggestion: boolean }
  | { kind: "kneel"; side: "home" | "away"; situation: Situation; suggestion: boolean };

export type DecisionAnswer = FourthDownCall | PlayCall | boolean | null | undefined;
/** Answers a request, or returns undefined to take the engine's suggestion. */
export type DecisionProvider = (req: DecisionRequest, game: GameSim) => DecisionAnswer;

type Gen<T = void> = Generator<DecisionRequest, T, DecisionAnswer>;

class Side {
  score = 0;
  timeouts = 3;
  stats: TeamStats = newTeamStats();
  players = new PlayerBook();
  qscores: number[] = [];
  constructor(public ratings: TeamRatings & { rushers: Player[]; receivers: Player[] }, public isHome: boolean) {}
}

type PlayResult = [gained: number, clockStop: boolean, desc: string, turnover: "fumble" | "int" | null];

interface LogOpts { down?: number; dist?: number; yl?: number; quarter?: number; clock?: number; offense?: Side }

export interface GameOptions {
  seed?: number;
  neutral?: boolean;
  /** false = headless: no play-by-play or drive log, only stats */
  record?: boolean;
  rng?: Rng;
}

export interface GameResult {
  home: { abbr: string; score: number; qscores: number[]; box: TeamBox; players: ReturnType<PlayerBook["toJSON"]> };
  away: { abbr: string; score: number; qscores: number[]; box: TeamBox; players: ReturnType<PlayerBook["toJSON"]> };
  overtime: boolean;
  ot_rounds: number;
  plays?: PlayRecord[];
  drives?: DriveRecord[];
}

export class GameSim {
  readonly rng: Rng;
  readonly record: boolean;
  readonly home: Side;
  readonly away: Side;
  readonly neutral: boolean;
  private homeMu!: Matchup;
  private awayMu!: Matchup;
  private homeRush!: RushModel;
  private awayRush!: RushModel;
  readonly plays: PlayRecord[] = [];
  readonly drives: DriveRecord[] = [];
  quarter = 1;
  clock = QUARTER_SECONDS;
  offense: Side;
  down = 1;
  distance = 10;
  yl = 75;
  drive: DriveRecord | null = null;
  gameOver = false;
  overtime = false;
  private pendingTimeout: Side | null = null;
  private rzCounted = false;
  private otRound = 0;
  private otPossessionOver = false;
  private secondHalfKicker!: Side;
  /** Who had the ball on the last scrimmage play (runner, sacked or scrambling QB, or the receiver who caught it). */
  lastTouch: { name: string; side: "home" | "away" } | null = null;
  /** The play call's effect on the next scrimmage snap; set by a decision provider, cleared after the snap. */
  snapMod: SnapMod | null = null;

  constructor(home: TeamRatings, away: TeamRatings, opts: GameOptions = {}) {
    this.rng = opts.rng ?? new Rng(opts.seed ?? 0);
    this.record = opts.record ?? true;
    this.home = new Side(prep(home), true);
    this.away = new Side(prep(away), false);
    this.neutral = opts.neutral ?? false;
    this.matchups(fitRush);
    this.offense = this.home;
  }

  private matchups(fit = fitRushFast): void {
    const edge = this.neutral ? 0 : HOME_EDGE, home = this.home.ratings, away = this.away.ratings;
    this.homeMu = buildMatchup(home, away, edge);
    this.awayMu = buildMatchup(away, home, -edge);
    for (const mu of [this.homeMu, this.awayMu]) mu.comp_pct = Math.min(0.85, mu.comp_pct * COMP_PCT_CAL);
    this.homeRush = fit(this.homeMu.rush_ypc * RUSH_CAL, this.homeMu.rush_stuff, this.homeMu.rush_explosive);
    this.awayRush = fit(this.awayMu.rush_ypc * RUSH_CAL, this.awayMu.rush_stuff, this.awayMu.rush_explosive);
  }

  /** A substitution: swap one side's ratings mid-game and rebuild the matchups. Draws nothing from the RNG. */
  setRatings(side: "home" | "away", r: TeamRatings): void {
    (side === "home" ? this.home : this.away).ratings = prep(r);
    this.matchups();
  }

  /** Add a line to the play-by-play (an injury, a substitution) without touching the game. */
  note(playType: string, desc: string): void {
    this.log(playType, desc, 0, { down: 0, dist: 0 });
  }

  // ---- running the game ----------------------------------------------------------------
  /** Play the whole game. Without a provider every choice is the engine's own call. */
  play(provider?: DecisionProvider): this {
    const it = this.run();
    let answer: DecisionAnswer = undefined;
    for (;;) {
      const r = it.next(answer);
      if (r.done) return this;
      answer = provider ? provider(r.value, this) : undefined;
    }
  }

  /** The game as a generator: resume with next(answer) after each DecisionRequest. */
  *run(): Gen {
    const toss = this.rng.random() < 0.5 ? this.home : this.away;
    this.secondHalfKicker = this.other(toss);
    yield* this.kickoff(toss);
    let guard = 0;
    while (this.quarter <= 4) {
      if (++guard > 1000) throw new Error("runaway game loop");
      if (this.clock <= 0) {
        const q = this.quarter;
        yield* this.endQuarter();
        if (q === 4) break;
        continue;
      }
      yield this.request("snap", null);
      yield* this.scrimmage();
    }
    for (const s of [this.home, this.away]) while (s.qscores.length < 4) s.qscores.push(0);
    if (this.home.score === this.away.score) yield* this.playOvertime();
    this.gameOver = true;
    this.log("END", `Final: ${this.away.ratings.abbr} ${this.away.score}, ${this.home.ratings.abbr} ${this.home.score}`, 0, { down: 0, dist: 0 });
  }

  result(): GameResult {
    const side = (s: Side) => ({
      abbr: s.ratings.abbr, score: s.score, qscores: [...s.qscores], box: teamDerived(s.stats), players: s.players.toJSON(),
    });
    const out: GameResult = { home: side(this.home), away: side(this.away), overtime: this.overtime, ot_rounds: this.otRound };
    if (this.record) { out.plays = this.plays; out.drives = this.drives; }
    return out;
  }

  situation(): Situation {
    return {
      quarter: this.quarter, clock: this.clock, down: this.down, distance: this.distance, yl: this.yl,
      home_score: this.home.score, away_score: this.away.score, offense_home: this.offense === this.home, overtime: this.overtime,
    };
  }

  private request(kind: DecisionRequest["kind"], suggestion: unknown, side: Side = this.offense): DecisionRequest {
    return { kind, side: side === this.home ? "home" : "away", situation: this.situation(), suggestion } as DecisionRequest;
  }

  /** Ask for a decision; an undefined or null answer keeps the suggestion. */
  private *decide<K extends Exclude<DecisionRequest["kind"], "snap">, S extends Extract<DecisionRequest, { kind: K }>["suggestion"]>(kind: K, suggestion: S, side: Side = this.offense): Gen<S> {
    const ans = yield this.request(kind, suggestion, side);
    return (ans === undefined || ans === null ? suggestion : ans) as S;
  }

  // ---- helpers ----------------------------------------------------------------------
  get defense(): Side { return this.offense === this.home ? this.away : this.home; }
  other(side: Side): Side { return side === this.home ? this.away : this.home; }
  private get mu(): Matchup { return this.offense === this.home ? this.homeMu : this.awayMu; }

  /** The matchup and rush model for this snap, with any play-call effect on top. */
  private snapRates(): { m: Matchup; rush: RushModel } {
    const m = this.mu, d = this.snapMod;
    if (!d) return { m, rush: this.rushModel(this.offense) };
    const lg = (p: number, x = 0) => { p = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return 1 / (1 + Math.exp(-(Math.log(p / (1 - p)) + x))); };
    const mm: Matchup = {
      ...m,
      comp_pct: Math.min(0.92, lg(m.comp_pct, d.comp ?? 0)), yds_per_comp: m.yds_per_comp * Math.exp(d.ypcomp ?? 0),
      sack_rate: lg(m.sack_rate, d.sack ?? 0), int_rate: lg(m.int_rate, d.int ?? 0),
      rush_ypc: m.rush_ypc * Math.exp(d.ypc ?? 0), rush_stuff: lg(m.rush_stuff, d.stuff ?? 0), rush_explosive: lg(m.rush_explosive, d.explosive ?? 0),
    };
    return { m: mm, rush: fitRushFast(mm.rush_ypc * RUSH_CAL, mm.rush_stuff, mm.rush_explosive) };
  }

  /** The players who can get the ball on this snap (the call may limit positions; never to nobody). */
  private eligible(players: Player[], pos: string[] | undefined): Player[] {
    if (!pos) return players;
    const only = players.filter((p) => pos.includes(p.pos));
    return only.length ? only : players;
  }
  private rushModel(side: Side): RushModel { return side === this.home ? this.homeRush : this.awayRush; }
  margin(side?: Side): number { side = side || this.offense; return side.score - this.other(side).score; }
  gameSecondsLeft(): number { return this.quarter > 4 ? 0 : this.clock + (4 - this.quarter) * QUARTER_SECONDS; }
  spotStr(yl?: number): string {
    yl = yl == null ? this.yl : yl;
    if (yl === 50) return "50";
    if (yl > 50) return `${this.offense.ratings.abbr} ${100 - yl}`;
    return `${this.defense.ratings.abbr} ${yl}`;
  }

  private log(playType: string, desc: string, yards = 0, o: LogOpts = {}) {
    if (this.drive && !["KICKOFF", "PAT", "2PT", "TIMEOUT", "END", "INJURY", "SUB"].includes(playType)) this.drive.plays += 1;
    if (!this.record) return;
    const off = o.offense || this.offense;
    const yl = o.yl == null ? this.yl : o.yl;
    this.plays.push({
      quarter: o.quarter == null ? this.quarter : o.quarter,
      clock: o.clock == null ? this.clock : o.clock,
      offense: off.ratings.abbr, offense_home: off === this.home,
      down: o.down == null ? this.down : o.down,
      distance: o.dist == null ? this.distance : o.dist,
      yardline: off === this.offense ? this.spotStr(o.yl == null ? undefined : o.yl) : "",
      play_type: playType, description: desc, yards,
      home_score: this.home.score, away_score: this.away.score,
      drive: this.drive ? this.drive.num : 0, yards_to_goal: yl,
    });
  }

  // ---- clock ------------------------------------------------------------------------
  private tempoGap(): number {
    const r = this.offense.ratings;
    const gap = BETWEEN_PLAYS_BASE * LEAGUE_PLAYS_PER_GAME / r.plays_per_game;
    if (this.hurryUp()) return 12;
    if (this.milking()) return 37;
    return trunc(gap + this.rng.uniform(-4, 4));
  }
  hurryUp(): boolean {
    if (this.overtime) return false;
    if (this.quarter === 2 && this.clock < 120) return true;
    if (this.quarter === 4 && this.margin() < 0 && (this.clock < 300 || (this.margin() < -8 && this.clock < 600))) return true;
    return false;
  }
  milking(): boolean {
    return (!this.overtime && this.quarter === 4 && this.margin() > 0 && this.clock < 480) ||
      (this.quarter === 3 && this.margin() > 17);
  }
  private runClock(playSecs: number, clockStops: boolean, inboundsPlay = true) {
    if (this.overtime) return;
    let used = playSecs;
    if (!clockStops) {
      let gap = this.tempoGap();
      const dfn = this.defense;
      if (this.quarter === 4 && this.clock - used < 210 && this.margin(dfn) < 0 && this.margin(dfn) >= -16 &&
          dfn.timeouts > 0 && inboundsPlay) {
        dfn.timeouts -= 1; gap = 0; this.pendingTimeout = dfn;
      } else if (this.hurryUp() && this.clock - used < 60 && this.offense.timeouts > 0 &&
                 (this.quarter === 2 || this.margin() < 0)) {
        this.offense.timeouts -= 1; gap = 0; this.pendingTimeout = this.offense;
      }
      used += gap;
    }
    used = Math.min(used, this.clock);
    this.clock -= used;
    this.offense.stats.top_seconds += used;
    if (this.drive) this.drive.seconds += used;
  }

  // ---- possession changes -------------------------------------------------------------
  private newDrive(side: Side, yl: number) {
    this.offense = side; this.yl = yl;
    this.down = 1; this.distance = Math.min(10, yl);
    this.drive = {
      num: this.drives.length + 1, team: side.ratings.abbr, home: side === this.home, quarter: this.quarter,
      clock: this.clock, start_yl: yl, plays: 0, yards: 0, seconds: 0, result: "",
    };
    this.drives.push(this.drive);
    if (yl <= 20) { side.stats.red_zone_trips += 1; this.rzCounted = true; } else this.rzCounted = false;
  }
  private endDrive(result: string) {
    if (this.drive && !this.drive.result) { this.drive.result = result; this.drive.yards = this.drive.start_yl - this.yl; }
  }
  private score(side: Side, pts: number) {
    side.score += pts;
    const qi = Math.min(this.quarter, 5) - 1;
    while (side.qscores.length <= qi) side.qscores.push(0);
    side.qscores[qi] += pts;
  }

  // ---- kicks --------------------------------------------------------------------------
  private *kickoff(kicking: Side, fromYlOwn = 35, onside = false, freeKick = false): Gen {
    const recv = this.other(kicking);
    const q = this.quarter, c = this.clock;
    this.offense = kicking;
    const kr = kicking.ratings, rng = this.rng;
    const K: LogOpts = { quarter: q, clock: c, down: 0, dist: 0 };
    if (onside) {
      if (rng.random() < 0.10) {
        this.log("KICKOFF", `${kr.abbr} onside kick recovered by ${kr.abbr}!`, 0, K);
        this.runClock(4, true);
        this.newDrive(kicking, 100 - fromYlOwn - 11);
        return;
      }
      this.log("KICKOFF", `${kr.abbr} onside kick recovered by ${recv.ratings.abbr}`, 0, K);
      this.runClock(4, true);
      this.newDrive(recv, 100 - (100 - fromYlOwn - 11));
      return;
    }
    const rr = recv.ratings;
    if (!freeKick && rng.random() < kr.kick_touchback) {
      this.log("KICKOFF", `${kr.abbr} kickoff, touchback.`, 0, K);
      this.newDrive(recv, 75);
      return;
    }
    let land = 100 - fromYlOwn - trunc(rng.gauss(!freeKick ? 62 : 45, 4));
    land = Math.max(-5, land);
    if (land <= 0 && rng.random() < 0.6) {
      this.log("KICKOFF", `${kr.abbr} kickoff into the end zone, touchback.`, 0, K);
      this.newDrive(recv, 75);
      return;
    }
    if (land < 25 && rng.random() < 0.25) {
      this.log("KICKOFF", `${kr.abbr} kickoff, fair catch at the 25.`, 0, K);
      this.newDrive(recv, 75);
      return;
    }
    let ret = Math.max(0, trunc(rng.gauss(rr.kick_return_avg, 7)));
    if (rng.random() < 0.06) ret += trunc(rng.expovariate(1 / 25));
    const end = Math.max(1, land) + ret;
    const secs = 6;
    if (end >= 100) {
      this.offense = recv;
      this.runClock(secs, true);
      this.score(recv, 6);
      recv.stats.return_tds += 1;
      this.log("KICKOFF", `${kr.abbr} kickoff, returned ${ret} yards for a TOUCHDOWN by ${rr.abbr}!`, 0, { ...K, offense: kicking });
      this.drive = null;
      yield* this.afterTouchdown(recv);
      return;
    }
    recv.stats.kick_return_yards += ret;
    this.log("KICKOFF", `${kr.abbr} kickoff ${!freeKick ? 65 : 45} yards, returned ${ret} yards to the ${rr.abbr} ${end <= 50 ? end : 100 - end}.`,
      0, { ...K, offense: kicking });
    this.offense = recv;
    this.runClock(secs, true);
    this.newDrive(recv, 100 - end);
  }

  private *punt(): Gen {
    const off = this.offense, dfn = this.defense, r = off.ratings, rng = this.rng;
    off.stats.punts += 1;
    if (rng.random() < 0.006) {
      this.log("PUNT", `${r.punter} punt BLOCKED, recovered by ${dfn.ratings.abbr}.`, 0);
      this.runClock(5, true);
      this.endDrive("Blocked punt");
      this.newDrive(dfn, Math.max(1, 100 - this.yl - 8));
      return;
    }
    let gross = trunc(rng.gauss(r.punt_gross, 6.5));
    if (this.yl < 55) gross = Math.min(gross, this.yl - 5 + trunc(rng.gauss(0, 4)));
    const land = this.yl - gross;
    if (land <= 0) {
      off.stats.punt_yards += this.yl - 20;
      this.log("PUNT", `${r.punter} punts ${this.yl} yards into the end zone, touchback.`, this.yl - 20);
      this.runClock(6, true);
      this.endDrive("Punt");
      this.newDrive(dfn, 75);
      return;
    }
    off.stats.punt_yards += gross;
    const dr = dfn.ratings;
    let ret: number, txt: string;
    if (rng.random() < 0.45 || land < 10) {
      ret = 0; txt = rng.random() < 0.6 ? "fair catch" : "downed";
    } else {
      ret = trunc(rng.expovariate(1 / dr.punt_return_avg));
      txt = `returned ${ret} yards`;
    }
    const newFromGoal = land + ret;
    if (newFromGoal >= 100) {
      this.log("PUNT", `${r.punter} punts ${gross} yards, returned for a TOUCHDOWN by ${dr.abbr}!`, gross);
      this.runClock(8, true);
      this.endDrive("Punt return TD");
      dfn.stats.return_tds += 1;
      this.score(dfn, 6);
      this.offense = dfn;
      this.drive = null;
      yield* this.afterTouchdown(dfn);
      return;
    }
    dfn.stats.punt_return_yards += ret;
    this.log("PUNT", `${r.punter} punts ${gross} yards to the ${this.spotStr(land)}, ${txt}.`, gross);
    this.runClock(8, true);
    this.endDrive("Punt");
    this.newDrive(dfn, 100 - newFromGoal);
  }

  fgMakeProb(dist: number, side: Side): number {
    return 1 / (1 + Math.exp(FG_SLOPE * (dist - (FG_MID + side.ratings.fg_skill))));
  }

  private *fieldGoal(): Gen {
    const off = this.offense, dfn = this.defense;
    const dist = this.yl + 17;
    let p = this.fgMakeProb(dist, off);
    if (this.overtime) p = Math.min(p, 0.97);
    off.stats.fga += 1;
    off.players.kick(off.ratings.kicker, dist, false);
    if (this.rng.random() < p) {
      off.stats.fgm += 1;
      off.players.kick(off.ratings.kicker, dist, true);
      this.score(off, 3);
      this.log("FG", `${off.ratings.kicker} ${dist}-yard field goal is GOOD.`);
      this.runClock(5, true);
      this.endDrive("Field goal");
      this.drive = null;
      if (!this.overtime) {
        const onside = yield* this.decide("onside", this.shouldOnside(off), off);
        yield* this.kickoff(off, 35, onside);
      }
      return;
    }
    const blocked = this.rng.random() < 0.06;
    this.log("FG", `${off.ratings.kicker} ${dist}-yard field goal is ${blocked ? "BLOCKED" : "NO GOOD"}.`);
    this.runClock(5, true);
    this.endDrive("Missed FG");
    if (!this.overtime) this.newDrive(dfn, 100 - Math.max(this.yl + 7, 20));
  }

  // ---- scoring tries --------------------------------------------------------------------
  private twoPointProb(): number {
    const m = this.mu;
    const strength = (m.rush_ypc / 4.6 + m.comp_pct / 0.62) / 2;
    return Math.min(0.65, Math.max(0.3, TWO_PT_BASE * strength));
  }
  goForTwo(side: Side): boolean {
    if (this.overtime) return this.otRound >= 2;
    const m = this.margin(side);
    if (this.quarter === 4 || (this.quarter === 3 && this.clock < 300))
      return [-10, -5, -2, 1, 5, -13, -16].includes(m) || (m === -1 && this.clock < 60);
    return false;
  }
  private *afterTouchdown(side: Side): Gen {
    this.offense = side;
    side.stats.tds += 1;
    if (this.overtime && this.otRound >= 3) return;
    const Z: LogOpts = { down: 0, dist: 0 };
    let goForTwo = this.goForTwo(side);
    // In overtime from the second round on, two-point tries are the rule, not a choice.
    if (!(this.overtime && this.otRound >= 2)) goForTwo = yield* this.decide("twoPoint", goForTwo, side);
    if (goForTwo) {
      const ok = this.rng.random() < this.twoPointProb();
      side.stats.two_pt_att += 1;
      if (ok) { side.stats.two_pt_made += 1; this.score(side, 2); }
      this.log("2PT", `${side.ratings.abbr} two-point conversion ${ok ? "GOOD" : "FAILED"}.`, 0, Z);
    } else {
      const ok = this.rng.random() < 0.985;
      side.stats.xpa += 1;
      if (ok) { side.stats.xpm += 1; this.score(side, 1); }
      side.players.pat(side.ratings.kicker, ok);
      this.log("PAT", `${side.ratings.kicker} extra point ${ok ? "is GOOD" : "is NO GOOD"}.`, 0, Z);
    }
    if (!this.overtime && !this.gameOver) {
      const onside = yield* this.decide("onside", this.shouldOnside(side), side);
      yield* this.kickoff(side, 35, onside);
    }
  }

  // ---- coaching decisions (the engine's own calls) -----------------------------------------
  shouldOnside(kicking: Side): boolean {
    const m = this.margin(kicking);
    return this.quarter === 4 && this.clock < 150 && m >= -16 && m < 0;
  }
  fourthDownCall(): FourthDownCall {
    const yl = this.yl, ytg = this.distance, r = this.offense.ratings;
    const aggr = r.aggressiveness || 0, m = this.margin(), secs = this.gameSecondsLeft();
    const fgDist = yl + 17, inRange = fgDist <= 52 + r.fg_skill;
    if ((this.quarter === 2 || this.quarter === 4) && this.clock < 20) {
      if (inRange && (this.quarter === 2 || (m >= -3 && m <= 0) || m > 0)) return "fg";
      return this.quarter === 4 && m < 0 ? "go" : (inRange ? "fg" : "punt");
    }
    if (this.quarter === 4 && m < 0) {
      if (m >= -3 && inRange && secs < 240) return "fg";
      if (secs < 300 || (m < -8 && secs < 600) || (m < -16 && secs < 900)) return "go";
    }
    if (this.quarter === 4 && m > 0 && secs < 240) return inRange ? "fg" : "punt";
    let [go, fg, punt] = fourthDownMix(yl, ytg);
    if (fgDist > 52 + r.fg_skill + FG_MAX_EXTRA) { punt += fg; fg = 0; }
    if (aggr) {
      const g2 = invLogit(logit4(go) + AGGR_LOGIT * aggr), rest = (1 - g2) / Math.max(1e-9, fg + punt);
      go = g2; fg *= rest; punt *= rest;
    }
    const u = this.rng.random();
    return u < go ? "go" : u < go + fg ? "fg" : "punt";
  }
  passProb(): number {
    const r = this.offense.ratings;
    const tend = r.pass_tendency && Object.keys(r.pass_tendency).length ? r.pass_tendency : null;
    let p = tend ? LEAGUE_PASS_RATE : r.pass_rate;
    const d = this.down, ytg = this.distance, m = this.margin();
    if (d === 3) p = ytg >= 8 ? 0.86 : ytg >= 5 ? 0.70 : ytg >= 3 ? 0.52 : 0.32;
    else if (d === 4) p = ytg >= 5 ? 0.75 : ytg >= 3 ? 0.55 : 0.3;
    else if (d === 2) p += ytg >= 8 ? 0.12 : (ytg <= 3 ? -0.08 : 0);
    else if (d === 1 && ytg < 10) p -= 0.08;
    if (this.yl <= 3) p -= 0.15;
    const off = tend ? tend[situationBucket(d, ytg)] : null;
    if (off) {
      p = Math.min(0.97, Math.max(0.03, p));
      p = 1 / (1 + Math.exp(-(logit3(p) + off)));
    }
    if (this.hurryUp()) p = Math.max(p, 0.78);
    else if (this.milking()) p = Math.min(p, 0.22);
    else if (this.quarter >= 3 && m <= -14) p += 0.15;
    else if (this.quarter >= 3 && m >= 14) p -= 0.12;
    return Math.min(0.95, Math.max(0.05, p));
  }
  shouldKneel(): boolean {
    if (this.overtime || this.margin() <= 0) return false;
    if (this.quarter === 2 && this.clock <= 40 && this.yl >= 60 && this.down < 4) return true;
    if (this.quarter !== 4) return false;
    const downsLeft = 4 - this.down;
    const burn = downsLeft * 42 - this.defense.timeouts * 40;
    return this.clock <= burn;
  }

  // ---- the snap ---------------------------------------------------------------------
  private *scrimmage(): Gen {
    const off = this.offense, dfn = this.defense;
    this.pendingTimeout = null;
    this.lastTouch = null;
    if (!this.overtime && this.clock <= 8 && this.yl + 17 <= 55 + off.ratings.fg_skill &&
        (this.quarter === 2 || (this.quarter === 4 && this.margin() >= -3 && this.margin() <= 0))) {
      yield* this.fieldGoal();
      return;
    }
    if (this.down === 4 && !this.overtime) {
      const call = yield* this.decide("fourthDown", this.fourthDownCall());
      if (call === "punt") { yield* this.punt(); return; }
      if (call === "fg") { yield* this.fieldGoal(); return; }
    }
    const kneel = this.shouldKneel() ? yield* this.decide("kneel", true) : false;
    if (kneel) {
      this.log("KNEEL", `${off.ratings.qb} kneels.`, -1);
      this.yl += 1;
      off.stats.rush_att += 1; off.stats.rush_yards -= 1; off.stats.plays += 1;
      this.runClock(2, false);
      yield* this.advanceDown(-1);
      return;
    }
    if (this.rng.random() < (off.ratings.penalty_rate + dfn.ratings.penalty_rate)) {
      if (this.handlePenalty()) return;
    }
    const down0 = this.down, dist0 = this.distance, yl0 = this.yl, q0 = this.quarter, c0 = this.clock;
    off.stats.plays += 1;
    const draw = this.rng.random();
    const call = yield* this.decide("playCall", draw < this.passProb() ? "pass" : "run");
    const isPass = call === "pass";
    const res = isPass ? this.passPlay() : this.runPlay();
    this.snapMod = null;
    yield* this.postPlay(res[0], res[1], res[2], res[3], down0, dist0, yl0, q0, c0, isPass ? "PASS" : "RUN");
  }

  private touch(name: string): void { this.lastTouch = { name, side: this.offense === this.home ? "home" : "away" }; }

  private pickPlayer(players: Player[], fallback: string): Player {
    if (!players.length) return { name: fallback, pos: "?", share: 1, ypc_mult: 1, catch_mult: 1 };
    const tot = players.reduce((s, p) => s + p.share, 0);
    let u = this.rng.random() * tot;
    for (const p of players) { u -= p.share; if (u <= 0) return p; }
    return players[players.length - 1];
  }

  /** A designed QB run: the quarterback carries (one draw, like any carrier pick). */
  private qbRunner(off: Side): Player {
    this.rng.random();
    const listed = (off.ratings.rushers as Player[]).find((p) => p.pos === "QB" && p.name === off.ratings.qb);
    return listed ?? { name: off.ratings.qb, pos: "QB", share: 1, ypc_mult: 1, catch_mult: 1 };
  }

  private runPlay(): PlayResult {
    const off = this.offense, { m, rush } = this.snapRates(), rng = this.rng;
    const rusher = this.snapMod?.rushers?.includes("QB") ? this.qbRunner(off) : this.pickPlayer(this.eligible(off.ratings.rushers, this.snapMod?.rushers), "RB1");
    let y = sampleRush(rush, rng);
    y = y > 0 ? trunc(pyRound(y * rusher.ypc_mult)) : y;
    if (this.down >= 3 && this.distance <= 2 && y < this.distance && rng.random() < STICKS_RUN + m.third_down_bonus)
      y = this.distance;
    y = Math.min(y, this.yl);
    off.stats.rush_att += 1; off.stats.rush_yards += y;
    off.players.rush(rusher.name, y, y === this.yl);
    this.touch(rusher.name);
    if (y >= 12) off.stats.explosive += 1;
    const yds = (n: number) => `${n} yard${Math.abs(n) !== 1 ? "s" : ""}`;
    if (rng.random() < m.fumble_lost_rate * 1.0 && y < this.yl) {
      off.players.fumble(rusher.name);
      return [y, true, `${rusher.name} rush for ${yds(y)}, FUMBLES, recovered by ${this.defense.ratings.abbr}`, "fumble"];
    }
    const oob = rng.random() < (this.hurryUp() ? 0.12 : 0.06);
    const twoMin = (this.quarter === 2 || this.quarter === 4) && this.clock < 120;
    let desc = `${rusher.name} rush ${y === 0 ? "for no gain" : "for " + yds(y)}`;
    if (oob) desc += ", out of bounds";
    return [y, oob && twoMin, desc, null];
  }

  private passPlay(): PlayResult {
    const off = this.offense, dfn = this.defense, { m } = this.snapRates(), rng = this.rng;
    const qb = off.ratings.qb;
    if (rng.random() < m.sack_rate) {
      const y = -Math.max(1, trunc(rng.gauss(7, 3)));
      off.stats.sacks_taken += 1; off.stats.sack_yards += -y; dfn.stats.sacks += 1;
      off.players.sacked(qb);
      this.touch(qb);
      if (rng.random() < 0.05 && this.yl - y < 100) {
        off.players.fumble(qb);
        return [y, true, `${qb} sacked for ${-y} yards, FUMBLES, recovered by ${dfn.ratings.abbr}`, "fumble"];
      }
      return [y, false, `${qb} sacked for a loss of ${-y} yards`, null];
    }
    if (rng.random() < (off.ratings.scramble_rate || SCRAMBLE_RATE) * Math.exp(this.snapMod?.scramble ?? 0)) {
      const y = Math.min(this.yl, Math.max(-2, trunc(rng.gammavariate(1.6, off.ratings.scramble_scale || SCRAMBLE_SCALE)) - 1));
      off.stats.rush_att += 1; off.stats.rush_yards += y;
      off.players.rush(qb, y, y === this.yl);
      this.touch(qb);
      if (y >= 12) off.stats.explosive += 1;
      return [y, false, `${qb} scrambles for ${y} yards`, null];
    }
    const tgt = this.pickPlayer(this.eligible(off.ratings.receivers, this.snapMod?.receivers), "WR1");
    off.stats.pass_att += 1;
    if (rng.random() < m.int_rate) {
      off.stats.ints_thrown += 1;
      off.players.pass(qb, false, 0, false, true);
      off.players.target(tgt.name);
      const air = Math.max(1, trunc(rng.gauss(14, 7)));
      return [Math.min(air, this.yl - 1), true, `${qb} pass intended for ${tgt.name} INTERCEPTED by ${dfn.ratings.abbr}`, "int"];
    }
    let compP = Math.min(0.92, m.comp_pct * tgt.catch_mult + (this.down === 3 ? m.third_down_bonus : 0));
    if (this.distance >= 15) compP += 0.04;
    if (rng.random() >= compP) {
      off.players.pass(qb, false, 0, false, false);
      off.players.target(tgt.name);
      return [0, true, `${qb} pass incomplete intended for ${tgt.name}`, null];
    }
    let y = sampleCompletionYards(rng, m.yds_per_comp * tgt.ypc_mult * COMP_YDS_CAL);
    if (this.down >= 3 && y < this.distance && rng.random() < STICKS_PASS + m.third_down_bonus)
      y = this.distance + trunc(rng.expovariate(1 / 3));
    y = Math.min(y, this.yl);
    const td = y === this.yl;
    off.stats.completions += 1; off.stats.pass_yards += y;
    if (y >= 20) off.stats.explosive += 1;
    off.players.pass(qb, true, y, td, false);
    off.players.catch(tgt.name, y, td);
    this.touch(tgt.name);
    if (!td && rng.random() < m.fumble_lost_rate * 0.8) {
      off.players.fumble(tgt.name);
      return [y, true, `${qb} pass complete to ${tgt.name} for ${y} yards, FUMBLES, recovered by ${dfn.ratings.abbr}`, "fumble"];
    }
    const oob = rng.random() < (this.hurryUp() ? 0.35 : 0.15);
    const twoMin = (this.quarter === 2 || this.quarter === 4) && this.clock < 120;
    let desc = `${qb} pass complete to ${tgt.name} for ${y} yard${Math.abs(y) !== 1 ? "s" : ""}`;
    if (oob) desc += ", out of bounds";
    return [y, oob && twoMin, desc, null];
  }

  private *postPlay(gained: number, clockStop: boolean, desc: string, turnover: "fumble" | "int" | null,
    down0: number, dist0: number, yl0: number, q0: number, c0: number, ptype: string): Gen {
    const off = this.offense, dfn = this.defense;
    const L: LogOpts = { down: down0, dist: dist0, yl: yl0, quarter: q0, clock: c0 };
    const newYl = this.yl - gained;
    const success = gained >= (down0 === 1 ? 0.5 * dist0 : down0 === 2 ? 0.7 * dist0 : dist0);
    off.stats.success += +(success && !turnover);
    if (down0 === 3) off.stats.third_att += 1;
    if (down0 === 4) off.stats.fourth_att += 1;
    if (!this.rzCounted && newYl <= 20 && !turnover) { off.stats.red_zone_trips += 1; this.rzCounted = true; }

    if (turnover) {
      off.stats.turnovers += 1; dfn.stats.takeaways += 1;
      this.yl = newYl;
      let ret = trunc(this.rng.expovariate(1 / (turnover === "int" ? 12 : 4)));
      if (this.rng.random() < (turnover === "int" ? 0.04 : 0.02)) ret = 100;
      const spotForDef = (100 - this.yl) - ret;
      this.log(ptype, desc + (ret ? `, returned ${Math.min(ret, 100 - this.yl)} yards` : ""), gained, L);
      this.runClock(7, true);
      this.endDrive(turnover === "int" ? "Interception" : "Fumble");
      if (spotForDef <= 0) {
        this.offense = dfn;
        this.drive = null;
        dfn.stats.def_tds += 1;
        this.score(dfn, 6);
        this.log(ptype, `${dfn.ratings.abbr} defensive TOUCHDOWN!`, 0, { down: 0, dist: 0, yl: 0 });
        yield* this.afterTouchdown(dfn);
        return;
      }
      this.newDrive(dfn, Math.min(spotForDef, 99));
      if (this.overtime) this.otPossessionOver = true;
      return;
    }
    if (newYl <= 0) {
      this.yl = 0;
      this.score(off, 6);
      this.log(ptype, desc + ", TOUCHDOWN.", gained, L);
      if (down0 === 3) off.stats.third_conv += 1;
      if (down0 === 4) off.stats.fourth_conv += 1;
      off.stats.first_downs += 1;
      if (this.rzCounted) off.stats.red_zone_tds += 1;
      this.runClock(6, true);
      this.endDrive("Touchdown");
      this.drive = null;
      yield* this.afterTouchdown(off);
      if (this.overtime) this.otPossessionOver = true;
      return;
    }
    if (newYl >= 100) {
      this.yl = 100;
      this.log(ptype, desc + ", tackled in the end zone. SAFETY.", gained, L);
      this.score(dfn, 2);
      this.runClock(6, true);
      this.endDrive("Safety");
      this.drive = null;
      if (!this.overtime) yield* this.kickoff(off, 20, false, true);
      return;
    }
    this.yl = newYl;
    const first = gained >= dist0;
    let fd = "";
    if (first) {
      off.stats.first_downs += 1; fd = ", 1ST DOWN";
      if (down0 === 3) off.stats.third_conv += 1;
      if (down0 === 4) off.stats.fourth_conv += 1;
    } else if (down0 === 4) fd = ", turnover on downs";
    this.log(ptype, desc + fd + ".", gained, L);
    const twoMinFirst = first && (this.quarter === 2 || this.quarter === 4) && this.clock < 120;
    this.runClock(6, clockStop || twoMinFirst || (down0 === 4 && !first));
    if (this.pendingTimeout !== null) {
      const t = this.pendingTimeout;
      this.log("TIMEOUT", `Timeout ${t.ratings.abbr} (${t.timeouts} left).`, 0, { down: 0, dist: 0 });
    }
    yield* this.advanceDown(gained);
  }

  private *advanceDown(gained: number): Gen {
    if (gained >= this.distance) { this.down = 1; this.distance = Math.min(10, this.yl); return; }
    this.distance -= gained;
    this.down += 1;
    if (this.down > 4) {
      this.endDrive("Downs");
      this.newDrive(this.defense, 100 - this.yl);
      if (this.overtime) this.otPossessionOver = true;
    }
  }

  private handlePenalty(): boolean {
    const off = this.offense, dfn = this.defense, rng = this.rng;
    const pOff = off.ratings.penalty_rate / (off.ratings.penalty_rate + dfn.ratings.penalty_rate);
    if (rng.random() < pOff) {
      const u = rng.random();
      let [yards, name]: [number, string] = u < 0.45 ? [5, "False start"] : u < 0.85 ? [10, "Holding"] : [15, "Personal foul"];
      if (this.yl + yards >= 100) yards = Math.floor((100 - this.yl) / 2);
      off.stats.penalties += 1; off.stats.penalty_yards += yards;
      this.log("PENALTY", `PENALTY ${off.ratings.abbr} ${name}, ${yards} yards.`, -yards);
      this.yl += yards; this.distance += yards;
      this.runClock(name === "False start" ? 0 : 5, true);
      return true;
    }
    const u = rng.random();
    let yards: number, name: string, auto: boolean;
    if (u < 0.40) [yards, name, auto] = [5, "Offside", false];
    else if (u < 0.65) [yards, name, auto] = [10, "Holding", true];
    else if (u < 0.88) [yards, name, auto] = [15, "Pass interference", true];
    else [yards, name, auto] = [15, "Personal foul", true];
    if (yards >= this.yl) yards = Math.floor(this.yl / 2);
    dfn.stats.penalties += 1; dfn.stats.penalty_yards += yards;
    const L: LogOpts = { down: this.down, dist: this.distance, yl: this.yl };
    this.yl -= yards;
    if (auto || yards >= this.distance) {
      off.stats.first_downs += 1; off.stats.penalty_first_downs += 1;
      this.log("PENALTY", `PENALTY ${dfn.ratings.abbr} ${name}, ${yards} yards, 1ST DOWN.`, yards, L);
      this.down = 1; this.distance = Math.min(10, this.yl);
    } else {
      this.log("PENALTY", `PENALTY ${dfn.ratings.abbr} ${name}, ${yards} yards.`, yards, L);
      this.distance -= yards;
    }
    if (!this.rzCounted && this.yl <= 20) { off.stats.red_zone_trips += 1; this.rzCounted = true; }
    this.runClock(5, true);
    return true;
  }

  // ---- flow -------------------------------------------------------------------------
  private *endQuarter(): Gen {
    if (this.quarter === 2) {
      this.endDrive("End of half");
      this.home.timeouts = this.away.timeouts = 3;
      this.quarter = 3; this.clock = QUARTER_SECONDS;
      this.log("END", "End of 1st half.", 0, { down: 0, dist: 0 });
      yield* this.kickoff(this.secondHalfKicker);
      return;
    }
    if (this.quarter === 4) { this.endDrive("End of game"); return; }
    this.quarter += 1; this.clock = QUARTER_SECONDS;
  }

  private *playOvertime(): Gen {
    this.overtime = true; this.otRound = 0;
    const first = this.rng.random() < 0.5 ? this.away : this.home;
    while (this.home.score === this.away.score) {
      this.otRound += 1;
      this.quarter = 4 + this.otRound;
      if (this.otRound >= 3) {
        for (const side of [first, this.other(first)]) {
          this.offense = side;
          const ok = this.rng.random() < this.twoPointProb();
          side.stats.two_pt_att += 1;
          if (ok) { side.stats.two_pt_made += 1; this.score(side, 2); }
          this.log("2PT", `OT${this.otRound}: ${side.ratings.abbr} two-point play ${ok ? "GOOD" : "FAILED"}.`, 0, { down: 0, dist: 0 });
        }
      } else {
        for (const side of [first, this.other(first)]) yield* this.otPossession(side);
      }
      if (this.otRound > 12) break;
    }
  }

  private *otPossession(side: Side): Gen {
    this.newDrive(side, 25);
    this.otPossessionOver = false;
    const start = [this.home.score, this.away.score];
    let guard = 0;
    while (!this.otPossessionOver && guard < 60) {
      guard++;
      if (this.down === 4) {
        const call = yield* this.decide("fourthDown", this.otFourthDown());
        if (call === "fg") { yield* this.fieldGoal(); return; }
      }
      yield this.request("snap", null);
      yield* this.scrimmage();
      if (this.home.score !== start[0] || this.away.score !== start[1]) return;
      if (this.offense !== side) return;
    }
  }

  private otFourthDown(): FourthDownCall {
    const m = this.margin(), inRange = this.yl + 17 <= 55;
    if (m < -3 || (m < 0 && !inRange)) return "go";
    if (this.distance <= 1 && this.yl <= 5) return "go";
    return inRange ? "fg" : "go";
  }
}

/** Play one game with the engine's own calls. */
export function simulate(home: TeamRatings, away: TeamRatings, opts: GameOptions = {}): GameSim {
  return new GameSim(home, away, opts).play();
}
