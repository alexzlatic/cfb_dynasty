import type { DecisionAnswer, DecisionRequest, FourthDownCall, GameSim, PlayRecord } from "@cfb/engine";
import { Caller, DEF_CALLS, OFF_CALLS, isDefCall, isOffCall, type CallPair, type DefCall, type OffCall, type UserCall } from "./calls.ts";
import type { GameDay } from "./gameday.ts";
import type { Season } from "./season.ts";
import type { Game } from "./types.ts";

/** Moments that stop the game for you while your coordinators are calling (M1 plan defaults). */
export const ALERTS = {
  fourth_down: { label: "4th down past midfield, or 4th and 3 or less", on: true },
  two_point: { label: "Two-point decision", on: true },
  two_minute: { label: "Final 2:00 of either half, game within 16", on: true },
  defend_late: { label: "Opponent in your territory, 4th quarter, one-score game", on: true },
  overtime: { label: "Overtime", on: true },
  qb_hurt: { label: "Your QB is hurt", on: true },
  starter_hurt: { label: "Any other starter is hurt", on: false },
  red_zone: { label: "Your offense reaches the red zone", on: false },
  quarter: { label: "Start of each quarter", on: false },
} as const;
export type AlertKey = keyof typeof ALERTS;

export interface LiveMode {
  /** Call every snap on this side yourself, or let the coordinator call it (stopping on alerts). */
  offense: "me" | "coordinator";
  defense: "me" | "coordinator";
  alerts: Partial<Record<AlertKey, boolean>>;
}

export const DEFAULT_MODE: LiveMode = { offense: "me", defense: "coordinator", alerts: {} };

export interface LiveStop {
  kind: Exclude<DecisionRequest["kind"], "snap">;
  /** "offense" = your snap to call, "defense" = theirs to defend. */
  role: "offense" | "defense" | "kick";
  situation: DecisionRequest["situation"];
  /** What the coordinator would do. */
  suggestion: OffCall | DefCall | FourthDownCall | boolean;
  /** Why the game stopped when coordinators are calling. */
  alert: AlertKey | null;
  options: { id: string; label: string }[];
}

export interface CallStat { call: string; label: string; plays: number; yards: number; success: number }

export interface LiveView {
  game_id: number; home_id: number; away_id: number;
  user_side: "home" | "away";
  final: boolean;
  quarter: number; clock: number; overtime: boolean;
  home_score: number; away_score: number;
  home_timeouts: number; away_timeouts: number;
  possession: "home" | "away";
  down: number; distance: number; yards_to_goal: number;
  /** Plays since the game started (the client shows the new ones). */
  plays: PlayRecord[];
  stop: LiveStop | null;
  mode: LiveMode;
  /** How your calls have done this game, offense and defense. */
  offense_calls: CallStat[];
  defense_calls: CallStat[];
  calls_made: number;
}

const FOURTH: { id: FourthDownCall; label: string }[] = [{ id: "go", label: "Go for it" }, { id: "fg", label: "Field goal" }, { id: "punt", label: "Punt" }];
const YES_NO = (yes: string, no: string) => [{ id: "true", label: yes }, { id: "false", label: no }];

/**
 * A game the user is watching and calling. It steps the same engine, game day and caller that the
 * season would build for this game, stopping where the user wants to call; every user decision (or
 * null for the coordinator's) is kept in `calls`. Recording those calls on the season and playing the
 * day gives exactly this game.
 */
export class LiveGame {
  readonly calls: UserCall[] = [];
  readonly sim: GameSim;
  private gd: GameDay | null;
  private caller: Caller;
  private it: Generator<DecisionRequest, unknown, DecisionAnswer>;
  private pending: { req: DecisionRequest; ai: { off: OffCall; def: DefCall } | null; alert: AlertKey | null } | null = null;
  private done = false;
  private lastQuarter = 1;
  private seenInjuries = 0;
  private hurtAlert: AlertKey | null = null;
  private stats = { offense: new Map<string, CallStat>(), defense: new Map<string, CallStat>() };
  mode: LiveMode;

  constructor(season: Season, readonly game: Game, mode: Partial<LiveMode> = {}) {
    const setup = season.gameSetup(game);
    if (!setup.caller) throw new Error("you can only call your own games");
    this.sim = setup.sim;
    this.gd = setup.gd;
    this.caller = setup.caller;
    this.mode = { ...DEFAULT_MODE, ...mode, alerts: { ...mode.alerts } };
    this.it = this.sim.run();
    this.userStarters = new Set(setup.sides ? Object.values(setup.sides[this.userSide === "home" ? 0 : 1].depth).map((ids) => ids?.[0]).filter((x): x is number => x != null) : []);
    this.userQb = setup.sides?.[this.userSide === "home" ? 0 : 1].depth.QB?.[0] ?? null;
    this.run(undefined);
  }
  private userStarters: Set<number>;
  private userQb: number | null;

  get userSide(): "home" | "away" { return this.caller.userSide!; }

  setMode(mode: Partial<LiveMode>): void {
    this.mode = { ...this.mode, ...mode, alerts: { ...this.mode.alerts, ...mode.alerts } };
  }

  /**
   * Answer the stop (null = the coordinator's call) and play on to the next stop. `toEnd` hands every
   * remaining decision to the coordinators.
   */
  advance(call: UserCall | undefined, toEnd = false): void {
    if (this.done) return;
    if (!this.pending) throw new Error("the game is not waiting for a call");
    const user = this.validate(this.pending.req, call ?? null);
    this.run(user, toEnd);
  }

  private validate(req: DecisionRequest, call: UserCall): UserCall {
    if (call == null) return null;
    const role = this.role(req);
    const ok = req.kind === "playCall" ? (role === "offense" ? isOffCall(call) : isDefCall(call))
      : req.kind === "fourthDown" ? FOURTH.some((f) => f.id === call)
      : typeof call === "boolean";
    if (!ok) throw new Error(`not a valid call here: ${String(call)}`);
    return call;
  }

  private role(req: DecisionRequest): LiveStop["role"] {
    if (req.kind === "playCall") return req.side === this.userSide ? "offense" : "defense";
    return req.kind === "onside" ? "kick" : "offense";
  }

  /** Answer the pending request with `user`, then step the game until it needs the user or ends. */
  private run(user: UserCall | undefined, toEnd = false): void {
    let answer: DecisionAnswer = undefined;
    if (this.pending) {
      const { req, ai } = this.pending;
      this.calls.push(user ?? null);
      answer = this.caller.answer(req, this.sim, ai, user);
      this.pending = null;
    }
    const gdp = this.gd?.provider();
    for (;;) {
      const before = this.sim.plays.length;
      const r = this.it.next(answer);
      this.tally(before);
      if (r.done) { this.done = true; return; }
      const req = r.value;
      answer = undefined;
      if (req.kind === "snap") { gdp?.(req, this.sim); this.watchInjuries(); continue; }
      const ai = this.caller.prepare(req, this.sim);
      if (!this.caller.isUserTurn(req)) { answer = this.caller.answer(req, this.sim, ai, undefined); continue; }
      const alert = toEnd ? null : this.stopFor(req);
      if (alert !== undefined) { this.pending = { req, ai, alert }; return; }
      this.calls.push(null);
      answer = this.caller.answer(req, this.sim, ai, null);
    }
  }

  /** Whether to stop for this decision: null = you are calling it; an alert key = coordinator mode stopped; undefined = play on. */
  private stopFor(req: DecisionRequest): AlertKey | null | undefined {
    const s = req.situation, role = this.role(req);
    const on = (k: AlertKey) => this.mode.alerts[k] ?? ALERTS[k].on;
    if (role === "defense" ? this.mode.defense === "me" : this.mode.offense === "me") return null;
    const mine = s.offense_home === (this.userSide === "home");
    const margin = Math.abs(s.home_score - s.away_score);
    if (this.hurtAlert && on(this.hurtAlert)) { const k = this.hurtAlert; this.hurtAlert = null; return k; }
    this.hurtAlert = null;
    if (s.overtime && on("overtime")) return "overtime";
    if (req.kind === "twoPoint" && on("two_point")) return "two_point";
    if (req.kind === "fourthDown" && (s.yl < 50 || s.distance <= 3) && on("fourth_down")) return "fourth_down";
    if (req.kind !== "playCall") return undefined;
    if (s.quarter !== this.lastQuarter) { this.lastQuarter = s.quarter; if (on("quarter")) return "quarter"; }
    if ((s.quarter === 2 || s.quarter === 4) && s.clock <= 120 && margin <= 16 && on("two_minute")) return "two_minute";
    if (!mine && s.quarter === 4 && s.yl <= 50 && margin <= 8 && on("defend_late")) return "defend_late";
    if (mine && s.yl <= 20 && on("red_zone")) return "red_zone";
    return undefined;
  }

  private watchInjuries(): void {
    const all = this.gd?.injuries ?? [];
    for (; this.seenInjuries < all.length; this.seenInjuries++) {
      const x = all[this.seenInjuries];
      if (x.team_id !== this.game[this.userSide === "home" ? "home_id" : "away_id"]) continue;
      if (x.pid === this.userQb) this.hurtAlert = "qb_hurt";
      else if (this.userStarters.has(x.pid) && this.hurtAlert == null) this.hurtAlert = "starter_hurt";
    }
  }

  /** Credit the snap just played to the calls made on it. */
  private tally(before: number): void {
    const last = this.caller.last;
    if (!last || this.sim.plays.length === before) return;
    const p = this.sim.plays.slice(before).find((x) => x.play_type === "RUN" || x.play_type === "PASS");
    if (!p) return;
    this.caller.last = null;
    const success = p.down === 1 ? p.yards >= 0.4 * p.distance : p.down === 2 ? p.yards >= 0.6 * p.distance : p.yards >= p.distance;
    const userOff = last.side === this.userSide;
    const key = userOff ? last.off : last.def;
    const label = userOff ? OFF_CALLS.find((c) => c.id === key)!.label : DEF_CALLS.find((c) => c.id === key)!.label;
    const m = userOff ? this.stats.offense : this.stats.defense;
    const st = m.get(key) ?? { call: key, label, plays: 0, yards: 0, success: 0 };
    st.plays++; st.yards += p.yards; if (success) st.success++;
    m.set(key, st);
  }

  /** The game now; `since` drops plays the client already has (the list is still indexed from the start). */
  view(since = 0): LiveView & { since: number } {
    const g = this.sim, p = this.pending;
    return {
      game_id: this.game.id, home_id: this.game.home_id, away_id: this.game.away_id, user_side: this.userSide, final: this.done,
      quarter: g.quarter, clock: g.clock, overtime: g.overtime,
      home_score: g.home.score, away_score: g.away.score, home_timeouts: g.home.timeouts, away_timeouts: g.away.timeouts,
      possession: g.offense === g.home ? "home" : "away", down: g.down, distance: g.distance, yards_to_goal: g.yl,
      plays: g.plays.slice(since), since,
      stop: p ? this.stopView(p.req, p.ai, p.alert) : null,
      mode: this.mode,
      offense_calls: [...this.stats.offense.values()], defense_calls: [...this.stats.defense.values()],
      calls_made: this.calls.filter((c) => c != null).length,
    };
  }

  private stopView(req: DecisionRequest, ai: { off: OffCall; def: DefCall } | null, alert: AlertKey | null): LiveStop {
    const role = this.role(req);
    const kind = req.kind as LiveStop["kind"];
    const base = { kind, role, situation: req.situation, alert };
    switch (req.kind) {
      case "playCall":
        return role === "offense"
          ? { ...base, suggestion: ai!.off, options: OFF_CALLS.map(({ id, label }) => ({ id, label })) }
          : { ...base, suggestion: ai!.def, options: DEF_CALLS.map(({ id, label }) => ({ id, label })) };
      case "fourthDown": return { ...base, suggestion: req.suggestion, options: FOURTH };
      case "twoPoint": return { ...base, suggestion: req.suggestion, options: YES_NO("Go for two", "Kick the extra point") };
      case "onside": return { ...base, suggestion: req.suggestion, options: YES_NO("Onside kick", "Kick deep") };
      default: return { ...base, suggestion: req.suggestion as boolean, options: YES_NO("Kneel", "Run a play") };
    }
  }
}
