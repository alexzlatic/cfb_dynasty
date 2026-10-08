import { LEAGUE, type DecisionAnswer, type DecisionProvider, type DecisionRequest, type FourthDownCall, type GameSim, type PlayCall, type PlayRecord, type Rng, type SnapMod } from "@cfb/engine";
import { DEFAULT_PLAN, PREP_UNIT, type GamePlan, type PrepEdge } from "./plan.ts";

/**
 * Play calls (M1 plan, "Play calling"). Each offensive call against each defensive call moves the
 * snap's odds by a bounded amount (an engine SnapMod). The coordinators' normal mix of calls averages
 * out to zero on every rate, so AI-vs-AI games with calls play like the calibrated engine.
 */
export type OffCall = "inside_run" | "outside_run" | "qb_run" | "screen" | "quick" | "intermediate" | "play_action" | "deep";
export type DefCall = "base" | "load_box" | "blitz" | "cover2" | "cover3" | "man" | "prevent";
/** A call the user made on one of their decisions; null hands that decision to the coordinator. */
export type UserCall = OffCall | DefCall | FourthDownCall | boolean | null;

type Cls = "run" | "short" | "medium" | "deep";
type Mod = Omit<SnapMod, "rushers" | "receivers">;
const FIELDS = ["comp", "ypcomp", "sack", "int", "scramble", "ypc", "stuff", "explosive"] as const;

export const OFF_CALLS: { id: OffCall; label: string; kind: PlayCall; cls: Cls }[] = [
  { id: "inside_run", label: "Inside run", kind: "run", cls: "run" },
  { id: "outside_run", label: "Outside run", kind: "run", cls: "run" },
  { id: "qb_run", label: "QB run", kind: "run", cls: "run" },
  { id: "screen", label: "Screen", kind: "pass", cls: "short" },
  { id: "quick", label: "Quick pass", kind: "pass", cls: "short" },
  { id: "intermediate", label: "Intermediate pass", kind: "pass", cls: "medium" },
  { id: "play_action", label: "Play-action", kind: "pass", cls: "medium" },
  { id: "deep", label: "Deep shot", kind: "pass", cls: "deep" },
];
export const DEF_CALLS: { id: DefCall; label: string }[] = [
  { id: "base", label: "Base" }, { id: "load_box", label: "Load the box" }, { id: "blitz", label: "Blitz" },
  { id: "cover2", label: "Cover 2" }, { id: "cover3", label: "Cover 3" }, { id: "man", label: "Man press" }, { id: "prevent", label: "Prevent" },
];
const OFF = new Map(OFF_CALLS.map((c) => [c.id, c]));
export const isOffCall = (x: unknown): x is OffCall => typeof x === "string" && OFF.has(x as OffCall);
export const isDefCall = (x: unknown): x is DefCall => DEF_CALLS.some((c) => c.id === x);

/** Each call against a base defense (log-odds for rates, log for yards), before centering. */
const OFF_RAW: Record<OffCall, Mod> = {
  inside_run: { ypc: -0.03, stuff: -0.15, explosive: -0.3 },
  outside_run: { ypc: 0.02, stuff: 0.2, explosive: 0.25 },
  qb_run: { ypc: 0.05, stuff: -0.1 },
  screen: { comp: 1.4, ypcomp: -0.45, sack: -1.2, int: -0.5, scramble: -1.5 },
  quick: { comp: 0.6, ypcomp: -0.3, sack: -0.7, int: -0.2, scramble: -0.7 },
  intermediate: { comp: -0.15, ypcomp: 0.1, sack: 0.15, int: 0.1 },
  play_action: { comp: 0.05, ypcomp: 0.2, sack: 0.3 },
  deep: { comp: -1.0, ypcomp: 0.6, sack: 0.45, int: 0.5, scramble: 0.3 },
};
/** Who can get the ball on a call. */
const OFF_BALL: Partial<Record<OffCall, Pick<SnapMod, "rushers" | "receivers">>> = {
  qb_run: { rushers: ["QB"] }, inside_run: { rushers: ["RB"] }, screen: { receivers: ["RB", "TE"] }, deep: { receivers: ["WR", "TE"] },
};
/** Each defensive call against each kind of play. */
const DEF_RAW: Record<DefCall, Partial<Record<Cls, Mod>>> = {
  base: {},
  load_box: { run: { ypc: -0.1, stuff: 0.3, explosive: 0.1 }, short: { comp: 0.15, ypcomp: 0.08 }, medium: { comp: 0.25, ypcomp: 0.1 }, deep: { comp: 0.3, ypcomp: 0.1 } },
  blitz: { run: { stuff: 0.3, explosive: 0.35 }, short: { sack: 0.4, ypcomp: 0.25, comp: 0.1 }, medium: { sack: 0.6, comp: -0.2, int: 0.15 }, deep: { sack: 0.8, comp: -0.15, ypcomp: 0.15 } },
  cover2: { run: { ypc: 0.06, stuff: -0.1 }, short: { comp: -0.1 }, medium: { comp: 0.15, ypcomp: 0.05 }, deep: { comp: -0.45, int: 0.2 } },
  cover3: { run: { ypc: 0.03 }, short: { comp: 0.1, ypcomp: -0.05 }, medium: { comp: -0.15, int: 0.15 }, deep: { comp: -0.3 } },
  man: { run: { ypc: 0.02, explosive: 0.15 }, short: { comp: -0.25, int: 0.1 }, medium: { comp: -0.15 }, deep: { comp: -0.1, ypcomp: 0.15 } },
  prevent: { run: { ypc: 0.12, stuff: -0.3 }, short: { comp: 0.4, ypcomp: 0.1, sack: -0.5 }, medium: { comp: 0.35, sack: -0.5 }, deep: { comp: -0.9, ypcomp: -0.2, sack: -0.5 } },
};
/** Man coverage turns its back on a running quarterback. */
const QB_RUN_VS_MAN: Mod = { ypc: 0.2 };

/** The coordinators' usual mix: run and pass calls given the engine's run/pass call, and the defense's. */
export const OFF_MIX: Record<PlayCall, [OffCall, number][]> = {
  run: [["inside_run", 0.55], ["outside_run", 0.33], ["qb_run", 0.12]],
  pass: [["screen", 0.12], ["quick", 0.3], ["intermediate", 0.28], ["play_action", 0.15], ["deep", 0.15]],
};
export const DEF_MIX: [DefCall, number][] = [["base", 0.38], ["load_box", 0.14], ["blitz", 0.2], ["cover2", 0.12], ["cover3", 0.12], ["man", 0.04]];
const LATE_LEAD_MIX: [DefCall, number][] = [["prevent", 0.6], ["cover2", 0.4]];

const add = (a: Mod, b: Mod | undefined, k = 1): Mod => {
  const out: Mod = { ...a };
  if (b) for (const f of FIELDS) if (b[f] != null) out[f] = (out[f] ?? 0) + k * b[f]!;
  return out;
};
const mean = (rows: [Mod | undefined, number][]): Mod => rows.reduce((m, [x, w]) => add(m, x, w), {} as Mod);

// Center so the usual mixes average to zero on every field: offense within run and within pass,
// defense within each kind of play (all under the mix of offensive calls of that kind).
const OFF_EFFECT = {} as Record<OffCall, Mod>;
for (const kind of ["run", "pass"] as const) {
  const m = mean(OFF_MIX[kind].map(([c, w]) => [OFF_RAW[c], w]));
  for (const [c] of OFF_MIX[kind]) OFF_EFFECT[c] = add(OFF_RAW[c], m, -1);
}
const DEF_EFFECT = {} as Record<DefCall, Record<Cls, Mod>>;
for (const d of DEF_CALLS) DEF_EFFECT[d.id] = {} as Record<Cls, Mod>;
for (const cls of ["run", "short", "medium", "deep"] as const) {
  const m = mean(DEF_MIX.map(([d, w]) => [DEF_RAW[d][cls], w]));
  for (const d of DEF_CALLS) DEF_EFFECT[d.id][cls] = add(DEF_RAW[d.id][cls] ?? {}, m, -1);
}

function pairMod(o: OffCall, d: DefCall): Mod {
  const m = add(OFF_EFFECT[o], DEF_EFFECT[d][OFF.get(o)!.cls]);
  return o === "qb_run" && d === "man" ? add(m, QB_RUN_VS_MAN) : m;
}

/**
 * Shifts on the log-odds and log scales average to zero but the outcomes they produce do not (a
 * screen's extra completions are worth less than a deep shot's lost ones), so one offset per kind of
 * play brings the usual mix's expected completion, sack, interception and scramble rates and yards back
 * to a league-average matchup's.
 */
const KIND_OFFSET: Record<PlayCall, Mod> = (() => {
  const lgt = (p: number) => Math.log(p / (1 - p)), sig = (x: number) => 1 / (1 + Math.exp(-x));
  const pairs = (kind: PlayCall) => OFF_MIX[kind].flatMap(([o, wo]) => DEF_MIX.map(([d, wd]) => ({ m: pairMod(o, d), w: wo * wd })));
  const solve = (p0: number, rows: { s: number; w: number }[]) => {
    let c = 0;
    for (let k = 0; k < 40; k++) {
      let m = 0, dm = 0;
      for (const { s, w } of rows) { const q = sig(lgt(p0) + s + c); m += w * q; dm += w * q * (1 - q); }
      c -= (m - p0) / dm;
    }
    return c;
  };
  const logMean = (rows: { s: number; w: number }[]) => -Math.log(rows.reduce((t, { s, w }) => t + w * Math.exp(s), 0));
  const P = pairs("pass"), R = pairs("run");
  const comp = solve(LEAGUE.comp_pct, P.map(({ m, w }) => ({ s: m.comp ?? 0, w })));
  const caught = P.map(({ m, w }) => ({ s: m.ypcomp ?? 0, w: w * sig(lgt(LEAGUE.comp_pct) + (m.comp ?? 0) + comp) / LEAGUE.comp_pct }));
  // Fit with scripts/calls-check.ts: who can get the ball on screens and deep shots (backs on screens
  // average fewer yards a catch than the team's usual targets) costs a few yards the rates above miss.
  const FIT = { ypcomp: 0.035, ypc: 0.014 };
  return {
    pass: {
      comp, ypcomp: logMean(caught) + FIT.ypcomp,
      sack: solve(LEAGUE.sack_rate, P.map(({ m, w }) => ({ s: m.sack ?? 0, w }))),
      int: solve(LEAGUE.int_rate, P.map(({ m, w }) => ({ s: m.int ?? 0, w }))),
      scramble: logMean(P.map(({ m, w }) => ({ s: m.scramble ?? 0, w }))),
    },
    run: {
      ypc: logMean(R.map(({ m, w }) => ({ s: m.ypc ?? 0, w }))) + FIT.ypc,
      stuff: solve(LEAGUE.rush_stuff, R.map(({ m, w }) => ({ s: m.stuff ?? 0, w }))),
      explosive: solve(LEAGUE.rush_explosive, R.map(({ m, w }) => ({ s: m.explosive ?? 0, w }))),
    },
  };
})();

/** The snap's odds for an offensive call against a defensive call. */
export function snapMod(o: OffCall, d: DefCall): SnapMod {
  const m = add(pairMod(o, d), KIND_OFFSET[OFF.get(o)!.kind]);
  const out: SnapMod = { ...OFF_BALL[o] };
  for (const f of FIELDS) if (m[f]) out[f] = Math.round(m[f]! * 1000) / 1000;
  return out;
}

const pick = <T,>(rows: [T, number][], u: number): T => {
  const tot = rows.reduce((s, [, w]) => s + w, 0);
  let x = u * tot;
  for (const [c, w] of rows) { x -= w; if (x <= 0) return c; }
  return rows[rows.length - 1][0];
};

export interface CallPair { side: "home" | "away"; off: OffCall; def: DefCall; offByUser: boolean; defByUser: boolean }

/** Did the snap keep the offense on schedule: 40% of the distance on 1st down, 60% on 2nd, all of it on 3rd and 4th. */
export const successful = (p: PlayRecord) => (p.down === 1 ? p.yards >= 0.4 * p.distance : p.down === 2 ? p.yards >= 0.6 * p.distance : p.yards >= p.distance);

/** How far the plan and the game so far move the coordinators' mix (log scale). */
const EMPHASIS = 0.7;
const LEAN = 0.07;
const LEARN = 3;
const LEARN_CAP = 0.6;
/** A call's success rate is shrunk toward the side's overall rate as if it had this many average snaps. */
const LEARN_PRIOR = 4;

/** What one side's coordinators have seen work this game. */
interface Learned {
  off: Map<OffCall, [n: number, ok: number]>;
  /** Their offense's run and pass snaps against this side's defense. */
  vsRun: [number, number];
  vsPass: [number, number];
}
const learned = (): Learned => ({ off: new Map(), vsRun: [0, 0], vsPass: [0, 0] });
const clamp = (x: number, c: number) => Math.max(-c, Math.min(c, x));

export interface CallerOptions {
  /** Each side's game plan (default: no plan, the coordinators' usual mix). */
  plans?: Partial<Record<"home" | "away", GamePlan>>;
  /** Each side's practice edge for this game. */
  prep?: Partial<Record<"home" | "away", PrepEdge>>;
}

/** Where a coordinator has moved off his usual mix, for the live screen. */
export interface Adjustment { side: "home" | "away"; call: string; label: string; more: boolean; plays: number; success: number }

/**
 * Drives the calls for a game with play calling: answers the user's decisions (from a list or, in a
 * live game, one at a time) and lets the coordinators call the rest. Every scrimmage call draws two
 * numbers from its own stream whether or not anyone uses them, so the stream never depends on who called.
 *
 * The coordinators call from their side's game plan and adjust, within bounds, to what has worked
 * this game: more of the calls that are moving the ball, and on defense, more run fits or more
 * coverage depending on which is hurting them.
 */
export class Caller {
  /** The calls on the last scrimmage snap. */
  last: CallPair | null = null;
  /** Every scrimmage snap with calls, and the play that came of it. */
  readonly history: { pair: CallPair; play: PlayRecord; success: boolean }[] = [];
  private learned = { home: learned(), away: learned() };
  private seen = 0;

  constructor(readonly userSide: "home" | "away" | null, private rng: Rng, private opts: CallerOptions = {}) {}

  private plan(side: "home" | "away"): GamePlan { return this.opts.plans?.[side] ?? DEFAULT_PLAN; }

  /** Whether this decision belongs to the user (their offense, their defense on the other team's snap, their kicks and tries). */
  isUserTurn(req: DecisionRequest): boolean {
    if (this.userSide == null || req.kind === "snap") return false;
    return req.kind === "playCall" || req.side === this.userSide;
  }

  /** Settle the last snap: who called what, how it went, and what each side's coordinators learn from it. */
  observe(game: GameSim): void {
    const last = this.last;
    if (!last || game.plays.length === this.seen) return;
    const p = game.plays.slice(this.seen).find((x) => x.play_type === "RUN" || x.play_type === "PASS");
    this.seen = game.plays.length;
    if (!p) return;
    this.last = null;
    const ok = successful(p);
    this.history.push({ pair: last, play: p, success: ok });
    const o = this.learned[last.side], d = this.learned[last.side === "home" ? "away" : "home"];
    const st = o.off.get(last.off) ?? [0, 0];
    st[0]++; st[1] += +ok;
    o.off.set(last.off, st);
    const v = OFF.get(last.off)!.kind === "run" ? d.vsRun : d.vsPass;
    v[0]++; v[1] += +ok;
  }

  /** Multipliers on the offense's usual mix from what is working (each call against the side's overall rate). */
  private offLearn(side: "home" | "away"): Map<OffCall, number> {
    const L = this.learned[side], out = new Map<OffCall, number>();
    let n = 0, k = 0;
    for (const [a, b] of L.off.values()) { n += a; k += b; }
    if (!n) return out;
    const all = (k + 2) / (n + 4);
    for (const [c, [a, b]] of L.off) {
      const rate = (b + LEARN_PRIOR * all) / (a + LEARN_PRIOR);
      out.set(c, Math.exp(clamp(LEARN * (rate - all), LEARN_CAP)));
    }
    return out;
  }

  /** Run-fit versus coverage tilt for a defense: positive when the other team's runs work better than its passes. */
  private defLearn(side: "home" | "away"): number {
    const { vsRun: [rn, rk], vsPass: [pn, pk] } = this.learned[side];
    const all = (rk + pk + 2) / (rn + pn + 4);
    const r = (rk + LEARN_PRIOR * all) / (rn + LEARN_PRIOR), p = (pk + LEARN_PRIOR * all) / (pn + LEARN_PRIOR);
    return clamp(LEARN * (r - p), LEARN_CAP);
  }

  /** The coordinators' calls for a request (drawn before anyone answers it). */
  prepare(req: DecisionRequest, game: GameSim): { off: OffCall; def: DefCall } | null {
    this.observe(game);
    if (req.kind !== "playCall") return null;
    let u1 = this.rng.random();
    const u2 = this.rng.random();
    const s = req.situation;
    const offSide = req.side, defSide = offSide === "home" ? "away" : "home";
    const op = this.plan(offSide), dp = this.plan(defSide);
    const lead = (s.offense_home ? s.away_score - s.home_score : s.home_score - s.away_score);
    const late = !s.overtime && (s.quarter === 4 || s.quarter === 2) && s.clock <= 120;
    // The plan's run/pass lean turns some of the engine's calls the other way, outside the end of a half.
    let kind = req.suggestion;
    const lean = LEAN * op.run_pass;
    if (lean && !late && !(s.quarter === 4 && s.clock <= 300) && kind === (lean > 0 ? "run" : "pass")) {
      const q = Math.abs(lean);
      if (u1 < q) { kind = lean > 0 ? "pass" : "run"; u1 = u1 / q; } else u1 = (u1 - q) / (1 - q);
    }
    const ol = this.offLearn(offSide);
    const offMix = OFF_MIX[kind].map(([c, w]) => [c, w * Math.exp(EMPHASIS * (op.emphasis[c] ?? 0)) * (ol.get(c) ?? 1)] as [OffCall, number]);
    let def: DefCall;
    if (late && s.quarter === 4 && lead >= 9) def = pick(LATE_LEAD_MIX, u2);
    else {
      const tilt = this.defLearn(defSide);
      def = pick(DEF_MIX.map(([d, w]) => {
        let m = 1;
        if (d === "blitz") m *= Math.exp(EMPHASIS * dp.blitz);
        if (d === "load_box") m *= Math.exp(EMPHASIS * dp.box + tilt);
        if (d === "cover2" || d === "cover3" || d === "man") m *= Math.exp(-tilt) * (dp.coverage === d ? 2.5 : 1);
        return [d, w * m] as [DefCall, number];
      }), u2);
    }
    return { off: pick(offMix, u1), def };
  }

  /** What the coordinator does with a decision that is not a play call (undefined = the engine's own call). */
  coordinator(req: DecisionRequest): DecisionAnswer {
    if (req.kind !== "twoPoint") return undefined;
    const phil = this.plan(req.side).two_point;
    if (phil === "standard" || req.situation.overtime) return undefined;
    const s = req.situation;
    const m = req.side === "home" ? s.home_score - s.away_score : s.away_score - s.home_score;
    // Conservative coaches chase two only late in the game; aggressive ones also go for it to get ahead of the next score.
    if (phil === "conservative") return req.suggestion && s.quarter === 4 && s.clock < 600;
    return req.suggestion || (s.quarter >= 3 && [-8, -4, -1, 2, 6].includes(m)) || (s.quarter === 4 && m === -9);
  }

  /** Answer a request with the user's call (null or undefined = the coordinator's) and set the snap's odds. */
  answer(req: DecisionRequest, game: GameSim, ai: { off: OffCall; def: DefCall } | null, user: UserCall | undefined): DecisionAnswer {
    const mine = this.isUserTurn(req) && user != null;
    if (req.kind !== "playCall") return mine ? (user as FourthDownCall | boolean) : this.coordinator(req);
    const userOnOffense = req.side === this.userSide;
    const off = mine && userOnOffense && isOffCall(user) ? user : ai!.off;
    const def = mine && !userOnOffense && isDefCall(user) ? user : ai!.def;
    game.snapMod = this.withPrep(snapMod(off, def), req);
    this.last = { side: req.side, off, def, offByUser: off === user && userOnOffense, defByUser: def === user && !userOnOffense };
    this.seen = game.plays.length;
    return OFF.get(off)!.kind;
  }

  /** Practice: the offense's edge minus the defense's, with the situational work on 3rd and 4th down and in the red zone. */
  private withPrep(m: SnapMod, req: DecisionRequest): SnapMod {
    const prep = this.opts.prep;
    if (!prep) return m;
    const o = prep[req.side], d = prep[req.side === "home" ? "away" : "home"];
    const s = req.situation, key = s.down >= 3 || s.yl <= 20;
    const k = (o?.offense ?? 0) - (d?.defense ?? 0) + (key ? 1.5 * ((o?.situations ?? 0) - (d?.situations ?? 0)) : 0);
    if (!k) return m;
    const out: SnapMod = { ...m };
    for (const f of FIELDS) if (PREP_UNIT[f]) out[f] = Math.round(((out[f] ?? 0) + k * PREP_UNIT[f]!) * 1000) / 1000;
    return out;
  }

  /** Where each side's coordinators have moved off their usual mix so far, biggest first. */
  adjustments(): Adjustment[] {
    const out: Adjustment[] = [];
    for (const side of ["home", "away"] as const) {
      const L = this.learned[side];
      for (const [c, mult] of this.offLearn(side)) {
        if (Math.abs(Math.log(mult)) < 0.15) continue;
        const [n, k] = L.off.get(c)!;
        out.push({ side, call: c, label: OFF.get(c)!.label, more: mult > 1, plays: n, success: k / n });
      }
      const t = this.defLearn(side);
      if (Math.abs(t) >= 0.15) {
        const [n, k] = t > 0 ? L.vsRun : L.vsPass;
        out.push({ side, call: t > 0 ? "load_box" : "coverage", label: t > 0 ? "Stacking the box against the run" : "Dropping more into coverage", more: true, plays: n, success: n ? k / n : 0 });
      }
    }
    return out.sort((a, b) => b.plays - a.plays);
  }

  /** A provider that replays a game's recorded user calls in order (missing ones go to the coordinator). `before(i)` runs before user decision i is answered. */
  replay(calls: UserCall[], before?: (i: number) => void): DecisionProvider {
    let i = 0;
    return (req, game) => {
      if (req.kind === "snap") return undefined;
      const ai = this.prepare(req, game);
      if (!this.isUserTurn(req)) return this.answer(req, game, ai, undefined);
      before?.(i);
      return this.answer(req, game, ai, calls[i++]);
    };
  }
}
