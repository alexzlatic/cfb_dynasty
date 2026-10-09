import type { ClockPlay, DecisionAnswer, DecisionRequest, FourthDownCall, GameSim, PlayRecord, TeamBox, Tempo } from "@cfb/engine";
import { Caller, DEF_CALLS, OFF_CALLS, applyClock, isClockPlay, isDefCall, isOffCall, type Adjustment, type ClockEvent, type DefCall, type OffCall, type UserCall } from "./calls.ts";
import type { DefLine, GameDay, SidelineSlot } from "./gameday.ts";
import type { BoxRow } from "./awards.ts";
import { SLOT_POS, type DepthChart, type Slot } from "./players.ts";
import type { GameSub, Season } from "./season.ts";
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
  clock: { label: "Clock running late in a half, when you call your own timeouts", on: true },
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

/** The box score as of a play: each team's totals and its players' lines. */
export interface LiveBox {
  /** Plays logged when it was taken (the client asks for the box as of the play it is showing). */
  at: number;
  home_box: TeamBox; away_box: TeamBox;
  home: BoxRow[]; away: BoxRow[];
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
  /** Your side's field slots: who is in and who could come in. */
  sideline: SidelineSlot[];
  /** Where the coordinators have moved off their usual calls because of how this game is going. */
  adjustments: (Adjustment & { team_id: number })[];
  /** Your clock management: your offense's tempo, who calls your timeouts, and what you can do at this stop. */
  clock_control: {
    tempo: Tempo | "auto";
    manual_timeouts: boolean;
    /** The clock is running toward the next snap: a timeout now stops it where the last play ended. */
    running: boolean;
    can_timeout: boolean;
    /** Spike or kneel in place of a play (offense play calls only). */
    plays: { id: ClockPlay; label: string }[];
  };
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
  /** Lineup changes, each before the user decision it was made at. */
  readonly subs: GameSub[] = [];
  /** Tempo changes and timeouts, each before the user decision it was made at. */
  readonly clock: ClockEvent[] = [];
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
  private tallied = 0;
  /** Box score snapshots before each snap, so the live box can show the game as of the play on screen. */
  private boxes: { at: number; home: [string, unknown][]; away: [string, unknown][]; home_box: TeamBox; away_box: TeamBox; defense: [number, DefLine][] }[] = [];
  mode: LiveMode;

  constructor(private season: Season, readonly game: Game, mode: Partial<LiveMode> = {}) {
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
    // Handing the rest of the game over hands over the clock too.
    if (toEnd && (this.tempo !== "auto" || this.manualTimeouts)) this.setClock({ tempo: "auto", manual_timeouts: false });
    this.run(user, toEnd);
  }

  private get tempo(): Tempo | "auto" { return this.sim.tempo[this.userSide] ?? "auto"; }
  private get manualTimeouts(): boolean { return !!this.sim.manualTimeouts[this.userSide]; }

  /** Set your offense's tempo, or take over (or hand back) your timeouts, from this stop on. */
  setClock(c: { tempo?: Tempo | "auto"; manual_timeouts?: boolean }): void {
    if (this.done || !this.pending) throw new Error("the game is not stopped");
    const e: ClockEvent = { at: this.calls.length };
    if (c.tempo != null && c.tempo !== this.tempo) {
      if (c.tempo !== "auto" && !["normal", "uptempo", "hurry", "milk"].includes(c.tempo)) throw new Error(`unknown tempo ${String(c.tempo)}`);
      e.tempo = c.tempo;
    }
    if (c.manual_timeouts != null && !!c.manual_timeouts !== this.manualTimeouts) e.manual_timeouts = !!c.manual_timeouts;
    if (e.tempo == null && e.manual_timeouts == null) return;
    applyClock(this.sim, this.userSide, e);
    this.clock.push(e);
  }

  /** Call a timeout now: the clock goes back to where the last play ended. */
  timeout(): void {
    if (this.done || !this.pending) throw new Error("the game is not stopped");
    if ((this.userSide === "home" ? this.sim.home : this.sim.away).timeouts <= 0) throw new Error("no timeouts left");
    if (!this.sim.clockRunning) throw new Error("the clock is already stopped");
    const e: ClockEvent = { at: this.calls.length, timeout: true };
    applyClock(this.sim, this.userSide, e);
    this.clock.push(e);
  }

  /**
   * Put a player in at a field slot for the rest of the game (he moves to the top of that slot's list,
   * and out of any other slot he was starting at). It takes effect at the next snap.
   */
  substitute(slot: Slot, pid: number): void {
    if (this.done || !this.pending) throw new Error("the game is not stopped");
    if (!this.gd) throw new Error("this game has no lineups");
    const side = this.gd.sides[this.userSide];
    const p = side.byId.get(pid);
    if (!p) throw new Error("not one of your players");
    if (!(SLOT_POS[slot] ?? []).includes(p.pos)) throw new Error(`${p.pos} cannot play ${slot}`);
    if (side.unavailable(false).has(pid)) throw new Error("he is hurt");
    const depth: DepthChart = {};
    for (const [k, ids] of Object.entries(side.s.depth) as [Slot, number[]][]) depth[k] = ids.filter((x) => x !== pid || k === slot);
    depth[slot] = [pid, ...(depth[slot] ?? []).filter((x) => x !== pid)].slice(0, 4);
    this.gd.setDepth(this.userSide, depth);
    const at = this.calls.length;
    const prev = this.subs.at(-1);
    if (prev?.at === at) prev.depth = depth; else this.subs.push({ at, depth });
  }

  private validate(req: DecisionRequest, call: UserCall): UserCall {
    if (call == null) return null;
    const role = this.role(req);
    if (isClockPlay(call) && !this.clockPlays(req).some((x) => x.id === call)) throw new Error(`you can't ${call} here`);
    const ok = req.kind === "playCall" ? (role === "offense" ? isOffCall(call) || isClockPlay(call) : isDefCall(call))
      : req.kind === "fourthDown" ? FOURTH.some((f) => f.id === call)
      : typeof call === "boolean";
    if (!ok) throw new Error(`not a valid call here: ${String(call)}`);
    return call;
  }

  /** A spike stops a running clock before 4th down; a kneel works late in a half when you're not behind. */
  private clockPlays(req: DecisionRequest): { id: ClockPlay; label: string }[] {
    if (req.kind !== "playCall" || req.side !== this.userSide || req.situation.overtime) return [];
    const s = req.situation, m = (s.offense_home ? 1 : -1) * (s.home_score - s.away_score);
    const out: { id: ClockPlay; label: string }[] = [];
    if (this.sim.clockRunning && s.down < 4) out.push({ id: "spike", label: "Spike it" });
    if ((s.quarter === 2 || s.quarter === 4) && m >= 0 && s.yl < 97) out.push({ id: "kneel", label: "Kneel" });
    return out;
  }

  private role(req: DecisionRequest): LiveStop["role"] {
    if (req.kind === "playCall") return req.side === this.userSide ? "offense" : "defense";
    if (req.kind === "timeout") return req.situation.offense_home === (this.userSide === "home") ? "offense" : "defense";
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
      const r = this.it.next(answer);
      this.tally();
      if (r.done) { this.done = true; this.snapshot(); return; }
      const req = r.value;
      answer = undefined;
      if (req.kind === "snap") { gdp?.(req, this.sim); this.watchInjuries(); this.snapshot(); continue; }
      const ai = this.caller.prepare(req, this.sim);
      if (!this.caller.isUserTurn(req)) { answer = this.caller.answer(req, this.sim, ai, undefined); continue; }
      const alert = toEnd ? undefined : this.stopFor(req);
      if (alert !== undefined) { this.pending = { req, ai, alert }; return; }
      this.calls.push(null);
      answer = this.caller.answer(req, this.sim, ai, null);
    }
  }

  /** Whether to stop for this decision: null = you are calling it; an alert key = coordinator mode stopped; undefined = play on. */
  private stopFor(req: DecisionRequest): AlertKey | null | undefined {
    const s = req.situation, role = this.role(req);
    const on = (k: AlertKey) => this.mode.alerts[k] ?? ALERTS[k].on;
    if (req.kind === "timeout") {
      // Only asked when you call your own timeouts. When you're calling this side's snaps the play call
      // stop has the timeout button, so this one stops only when the clock has run out the half.
      const m = (this.userSide === "home" ? 1 : -1) * (s.home_score - s.away_score);
      const ball = s.offense_home === (this.userSide === "home");
      // Out of time: worth a stop only when one more snap could help you.
      if (s.clock <= 0) return (s.quarter === 2 ? ball : m < 0 ? m >= -16 : m === 0 && ball) ? "clock" : undefined;
      if ((ball ? this.mode.offense === "me" : this.mode.defense === "me") || !on("clock")) return undefined;
      const late = (s.quarter === 2 && s.clock <= 120) || (s.quarter === 4 && Math.abs(m) <= 16 && (s.clock <= 120 || (s.clock <= 300 && m < 0)));
      return late ? "clock" : undefined;
    }
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

  private snapshot(): void {
    const r = this.sim.result(), at = this.sim.plays.length;
    const shot = { at, home: Object.entries(r.home.players), away: Object.entries(r.away.players), home_box: r.home.box, away_box: r.away.box,
      defense: [...(this.gd?.defense ?? new Map<number, DefLine>())].map(([k, l]) => [k, { ...l }] as [number, DefLine]) };
    if (this.boxes.at(-1)?.at === at) this.boxes[this.boxes.length - 1] = shot; else this.boxes.push(shot);
  }

  /** The box score as of play `at` (the latest snapshot taken with no more plays than that). */
  box(at = Number.MAX_SAFE_INTEGER): LiveBox | null {
    let shot = null;
    for (const b of this.boxes) { if (b.at > at) break; shot = b; }
    if (!shot) return null;
    const mine = (side: "home" | "away") => {
      const ids = this.gd?.sides[side].byId;
      return Object.fromEntries(shot.defense.filter(([pid]) => ids?.has(pid)));
    };
    return {
      at: shot.at, home_box: shot.home_box, away_box: shot.away_box,
      home: this.season.boxRows(this.game.home_id, Object.fromEntries(shot.home), mine("home")),
      away: this.season.boxRows(this.game.away_id, Object.fromEntries(shot.away), mine("away")),
    };
  }

  /** Credit each snap played to the calls made on it. */
  private tally(): void {
    this.caller.observe(this.sim);
    for (; this.tallied < this.caller.history.length; this.tallied++) {
      const { pair: last, play: p, success } = this.caller.history[this.tallied];
      const userOff = last.side === this.userSide;
      const key = userOff ? last.off : last.def;
      const label = userOff ? OFF_CALLS.find((c) => c.id === key)!.label : DEF_CALLS.find((c) => c.id === key)!.label;
      const m = userOff ? this.stats.offense : this.stats.defense;
      const st = m.get(key) ?? { call: key, label, plays: 0, yards: 0, success: 0 };
      st.plays++; st.yards += p.yards; if (success) st.success++;
      m.set(key, st);
    }
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
      sideline: this.done || !this.gd ? [] : this.gd.sides[this.userSide].sideline(),
      adjustments: this.caller.adjustments().map((a) => ({ ...a, team_id: a.side === "home" ? this.game.home_id : this.game.away_id })),
      clock_control: {
        tempo: this.tempo, manual_timeouts: this.manualTimeouts, running: !this.done && this.sim.clockRunning,
        can_timeout: !!p && p.req.kind !== "timeout" && this.sim.clockRunning && g[this.userSide].timeouts > 0,
        plays: p ? this.clockPlays(p.req) : [],
      },
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
      case "twoPoint": return { ...base, suggestion: (this.caller.coordinator(req) as boolean | undefined) ?? req.suggestion, options: YES_NO("Go for two", "Kick the extra point") };
      case "onside": return { ...base, suggestion: req.suggestion, options: YES_NO("Onside kick", "Kick deep") };
      case "timeout": return { ...base, suggestion: false, options: YES_NO("Call timeout", "Let it run") };
      default: return { ...base, suggestion: req.suggestion as boolean, options: YES_NO("Kneel", "Run a play") };
    }
  }
}
