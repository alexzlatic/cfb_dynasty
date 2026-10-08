import { LEAGUE, type DecisionAnswer, type DecisionProvider, type DecisionRequest, type FourthDownCall, type GameSim, type PlayCall, type Rng, type SnapMod } from "@cfb/engine";

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

/**
 * Drives the calls for a game with play calling: answers the user's decisions (from a list or, in a
 * live game, one at a time) and lets the coordinators call the rest. Every scrimmage call draws two
 * numbers from its own stream whether or not anyone uses them, so the stream never depends on who called.
 */
export class Caller {
  /** The calls on the last scrimmage snap. */
  last: CallPair | null = null;
  constructor(readonly userSide: "home" | "away" | null, private rng: Rng) {}

  /** Whether this decision belongs to the user (their offense, their defense on the other team's snap, their kicks and tries). */
  isUserTurn(req: DecisionRequest): boolean {
    if (this.userSide == null || req.kind === "snap") return false;
    return req.kind === "playCall" || req.side === this.userSide;
  }

  /** The coordinators' calls for a request (drawn before anyone answers it). */
  prepare(req: DecisionRequest, game: GameSim): { off: OffCall; def: DefCall } | null {
    if (req.kind !== "playCall") return null;
    const u1 = this.rng.random(), u2 = this.rng.random();
    const s = req.situation;
    const lead = (s.offense_home ? s.away_score - s.home_score : s.home_score - s.away_score);
    const late = !s.overtime && (s.quarter === 4 || s.quarter === 2) && s.clock <= 120;
    const def = late && s.quarter === 4 && lead >= 9 ? pick(LATE_LEAD_MIX, u2) : pick(DEF_MIX, u2);
    void game;
    return { off: pick(OFF_MIX[req.suggestion], u1), def };
  }

  /** Answer a request with the user's call (null or undefined = the coordinator's) and set the snap's odds. */
  answer(req: DecisionRequest, game: GameSim, ai: { off: OffCall; def: DefCall } | null, user: UserCall | undefined): DecisionAnswer {
    const mine = this.isUserTurn(req) && user != null;
    if (req.kind !== "playCall") return mine ? (user as FourthDownCall | boolean) : undefined;
    const userOnOffense = req.side === this.userSide;
    const off = mine && userOnOffense && isOffCall(user) ? user : ai!.off;
    const def = mine && !userOnOffense && isDefCall(user) ? user : ai!.def;
    game.snapMod = snapMod(off, def);
    this.last = { side: req.side, off, def, offByUser: off === user && userOnOffense, defByUser: def === user && !userOnOffense };
    return OFF.get(off)!.kind;
  }

  /** A provider that replays a game's recorded user calls in order (missing ones go to the coordinator). */
  replay(calls: UserCall[]): DecisionProvider {
    let i = 0;
    return (req, game) => {
      if (req.kind === "snap") return undefined;
      const ai = this.prepare(req, game);
      const user = this.isUserTurn(req) ? calls[i++] : undefined;
      return this.answer(req, game, ai, user);
    };
  }
}
