import { LEAGUE, type PlayerShare, type TeamRatings, type UnitRates } from "@cfb/engine";
import { ATTRS, DEFENSE_SLOTS, OFFENSE_SLOTS, SLOT_POS, SPECIAL_SLOTS, overall, playerName, z, type DepthChart, type Pos, type RatedPlayer, type Slot } from "./players.ts";
import { STAND_IN } from "./schemes.ts";

/**
 * The ratings compiler: the players in a team's depth chart become the engine's unit rates.
 *
 * Every rate is the FBS rate moved in log-odds (log scale for yards) by the z-scores of the players who
 * affect it: logit(rate) = logit(FBS) + sum(beta * z). Offense and defense compile separately and the
 * engine's matchup blend combines them, as it does today. With every player at 75 the result is the FBS
 * rate exactly. A team's `scheme` offsets carry what its players don't explain (coaching, scheme, the
 * part of the team's measured strength the importer could not place on a player).
 */

export { DEFENSE_SLOTS, OFFENSE_SLOTS, SLOT_LABELS, SLOT_POS, SPECIAL_SLOTS, type DepthChart, type Slot } from "./players.ts";

/** Rates the compiler sets, on the engine's scale. "log" rates are yards (multiplicative); the rest are probabilities. */
export const RATES = ["comp_pct", "yds_per_comp", "sack_rate", "int_rate", "rush_stuff", "rush_explosive", "rush_ypc", "fumble_lost_rate"] as const;
export type Rate = typeof RATES[number];
const LOG_RATES = new Set<Rate>(["yds_per_comp", "rush_ypc"]);

/** A term: coefficient times the z of a unit input (see `units`). */
type Terms = [string, number][];

/** Offense: positive z raises the rate. Coefficients are per 1 SD, from the design plan's starting table. */
export const OFFENSE_TERMS: Record<Rate, Terms> = {
  comp_pct: [["qb_short", 0.17], ["qb_deep", 0.07], ["recv_route", 0.15], ["recv_hands", 0.1], ["pass_pro", 0.05]],
  yds_per_comp: [["qb_arm", 0.035], ["qb_deep", 0.03], ["recv_speed", 0.04], ["recv_rac", 0.03]],
  sack_rate: [["pass_pro", -0.25], ["qb_pocket", -0.15]],
  int_rate: [["qb_decisions", -0.25], ["recv_contested", -0.04]],
  rush_stuff: [["run_block", -0.2], ["rb_vision", -0.1], ["rb_power", -0.05]],
  rush_explosive: [["rb_speed", 0.2], ["rb_elusive", 0.12], ["run_block", 0.06]],
  rush_ypc: [["rb_vision", 0.04], ["rb_power", 0.03], ["run_block", 0.04], ["rb_speed", 0.02]],
  fumble_lost_rate: [["ball_security", -0.3]],
};

/** Defense: positive z is a better defense, so terms are the change to the rate the defense allows. */
export const DEFENSE_TERMS: Record<Rate, Terms> = {
  comp_pct: [["coverage", -0.2], ["pass_rush", -0.04]],
  yds_per_comp: [["coverage", -0.03], ["range", -0.03], ["tackling", -0.02]],
  sack_rate: [["pass_rush", 0.25], ["coverage", 0.04]],
  int_rate: [["ball_skills", 0.15], ["pass_rush", 0.04]],
  rush_stuff: [["run_def", 0.2], ["lb_run_fit", 0.08]],
  rush_explosive: [["range", -0.15], ["lb_speed", -0.1], ["tackling", -0.05]],
  rush_ypc: [["run_def", -0.05], ["tackling", -0.02]],
  fumble_lost_rate: [["tackling", 0.1]],
};

export type SchemeOffsets = { offense: Partial<Record<Rate, number>>; defense: Partial<Record<Rate, number>> };

const logit = (p: number) => Math.log(p / (1 - p));
const invLogit = (x: number) => 1 / (1 + Math.exp(-x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** Soft minimum (tau > 0) or maximum (tau < 0) of z-scores. */
const soft = (xs: number[], tau: number) => (xs.length ? -tau * Math.log(mean(xs.map((x) => Math.exp(-x / tau)))) : 0);

/** Default role shares by slot: targets for receivers and backs, carries for runners. */
const TARGET_SHARE: Partial<Record<Slot, number>> = { WR_X: 0.2, WR_Z: 0.17, WR_SLOT: 0.15, WR4: 0.06, TE1: 0.12, TE2: 0.04, RB1: 0.08, RB2: 0.04 };
const CARRY_SHARE: Partial<Record<Slot, number>> = { RB1: 0.31, RB2: 0.27, QB: 0.15, WR_SLOT: 0.03 };

export interface Lineup { slot: Partial<Record<Slot, RatedPlayer>> }

export function lineup(depth: DepthChart, byId: Map<number, RatedPlayer>, out: Set<number> = new Set()): Lineup {
  const slot: Partial<Record<Slot, RatedPlayer>> = {};
  const used = new Set<number>();
  for (const s of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS, ...SPECIAL_SLOTS]) {
    const id = (depth[s] ?? []).find((i) => !out.has(i) && !used.has(i) && byId.has(i));
    if (id != null) { slot[s] = byId.get(id)!; if (s !== "LS" && s !== "K" && s !== "P") used.add(id); }
  }
  return { slot };
}

/** What playing a slot through stand-in attributes costs (SDs): a linebacker at end is not quite an end. */
const STAND_IN_COST = 0.3;

/** A player's z on an attribute. Out of position (no such attribute) or an empty slot plays far below a starter. */
const at = (p: RatedPlayer | undefined, a: string) => (!p ? -2.5 : p.attrs[a] != null ? z(p.attrs[a]) : -2);

/** Backs and tight ends have no rating for some receiving skills; the closest one stands in. */
const RECV_STAND_IN: Partial<Record<Pos, Record<string, string>>> = {
  RB: { route: "hands", contested: "power", rac: "elusive" },
  TE: { contested: "hands", rac: "speed" },
};
const recvAttr = (p: RatedPlayer | undefined, a: string) => (p && RECV_STAND_IN[p.pos]?.[a]) || a;

/** The unit inputs the terms refer to, as z-scores. */
export function units(l: Lineup): Record<string, number> {
  const s = l.slot;
  // Defenders read through stand-ins for their slot (a linebacker rushing from an end slot uses his blitz rating).
  const d = (k: Slot) => ({ p: s[k], k });
  const atD = (x: { p: RatedPlayer | undefined; k: Slot }, a: string) => {
    const p = x.p;
    if (!p || p.attrs[a] != null) return at(p, a);
    const alt = STAND_IN[SLOT_POS[x.k][0]]?.[p.pos]?.[a];
    return alt != null && p.attrs[alt] != null ? z(p.attrs[alt]) - STAND_IN_COST : -2;
  };
  const qb = s.QB;
  const recv: [Slot, number][] = (Object.entries(TARGET_SHARE) as [Slot, number][]).filter(([k]) => s[k]);
  const tw = recv.reduce((a, [, w]) => a + w, 0) || 1;
  const rv = (a: string) => recv.reduce((acc, [k, w]) => acc + w * at(s[k], recvAttr(s[k], a)), 0) / tw;
  const ol = (["LT", "LG", "C", "RG", "RT"] as Slot[]).map((k) => s[k]);
  const te = s.TE1;
  const runners: [Slot, number][] = (Object.entries(CARRY_SHARE) as [Slot, number][]).filter(([k]) => s[k]);
  const rw = runners.reduce((a, [, w]) => a + w, 0) || 1;
  const touch = runners.reduce((a, [k, w]) => a + w * at(s[k], s[k]?.pos === "WR" ? "hands" : "security"), 0) / rw;
  const rb = s.RB1;
  const dl = (["DE1", "DE2", "DT1", "DT2"] as Slot[]).map(d);
  // A linebacker in the nickel slot (a 4-3's SAM) plays in the box as well as in coverage.
  const lbs = (["LB1", "LB2", ...(s.NB?.pos === "LB" ? ["NB"] : [])] as Slot[]).map((k) => s[k]);
  const cbs = (["CB1", "CB2", "NB"] as Slot[]).map(d);
  const sfs = (["S1", "S2"] as Slot[]).map((k) => s[k]);
  const cover = (x: { p: RatedPlayer | undefined; k: Slot }) => (x.p?.pos === "S" ? at(x.p, "zone") : (atD(x, "man") + atD(x, "zone")) / 2);
  return {
    qb_short: at(qb, "acc_short"), qb_deep: at(qb, "acc_deep"), qb_arm: at(qb, "arm"), qb_decisions: at(qb, "decisions"), qb_pocket: at(qb, "pocket"),
    recv_route: rv("route"), recv_hands: rv("hands"), recv_speed: rv("speed"), recv_rac: rv("rac"), recv_contested: rv("contested"),
    pass_pro: 0.85 * soft(ol.map((p) => at(p, "pass_block")), 1.2) + 0.1 * at(te, "pass_block") + 0.05 * at(rb, "pass_block"),
    run_block: 0.8 * soft(ol.map((p) => at(p, "run_block")), 1.5) + 0.2 * at(te, "run_block"),
    rb_vision: at(rb, "vision"), rb_power: at(rb, "power"), rb_speed: at(rb, "speed"), rb_elusive: at(rb, "elusive"),
    ball_security: 0.7 * touch + 0.3 * at(qb, "security"),
    pass_rush: 0.8 * soft(dl.map((x) => atD(x, "pass_rush")), -1.2) + 0.2 * mean(lbs.map((p) => at(p, "blitz"))),
    run_def: mean(dl.map((x) => 0.65 * atD(x, "run_def") + 0.35 * atD(x, "shed"))),
    lb_run_fit: mean(lbs.map((p) => at(p, "run_fit"))), lb_speed: mean(lbs.map((p) => at(p, "speed"))),
    coverage: 0.62 * mean(cbs.map(cover)) + 0.25 * mean(sfs.map((p) => cover({ p, k: "S1" }))) + 0.13 * mean(lbs.map((p) => at(p, "coverage"))),
    ball_skills: mean([...cbs, ...sfs.map((p) => ({ p, k: "S1" as Slot }))].map((x) => atD(x, "ball"))),
    range: mean(sfs.map((p) => at(p, "range"))),
    tackling: mean([...lbs, ...sfs, ...cbs.filter((x) => x.p?.pos !== "LB").map((x) => x.p)].map((p) => at(p, "tackle"))),
  };
}

function apply(base: number, rate: Rate, shift: number): number {
  return LOG_RATES.has(rate) ? base * Math.exp(shift) : invLogit(logit(base) + shift);
}

/** Linear predictor of each rate (before adding to the FBS base). */
export function shifts(u: Record<string, number>, terms: Record<Rate, Terms>): Record<Rate, number> {
  const out = {} as Record<Rate, number>;
  for (const r of RATES) out[r] = terms[r].reduce((a, [k, c]) => a + c * (u[k] ?? 0), 0);
  return out;
}

export function unitRates(sh: Record<Rate, number>, offsets: Partial<Record<Rate, number>> = {}): UnitRates {
  const out: UnitRates = { ...LEAGUE };
  for (const r of RATES) out[r] = apply(LEAGUE[r], r, sh[r] + (offsets[r] ?? 0));
  return out;
}

/** The offset that makes a compiled rate equal a target rate (log-odds or log). */
export function residual(rate: Rate, target: number, compiled: number): number {
  return LOG_RATES.has(rate) ? Math.log(target / compiled) : logit(target) - logit(compiled);
}

/** Position groups for fatigue: a tired group plays every unit input it feeds this many SDs lower. */
export type Group = "qb" | "skill" | "ol" | "dl" | "lb" | "db";
const INPUT_GROUPS: Record<string, [Group, number][]> = {
  qb_short: [["qb", 1]], qb_deep: [["qb", 1]], qb_arm: [["qb", 1]], qb_decisions: [["qb", 1]], qb_pocket: [["qb", 1]],
  recv_route: [["skill", 1]], recv_hands: [["skill", 1]], recv_speed: [["skill", 1]], recv_rac: [["skill", 1]], recv_contested: [["skill", 1]],
  pass_pro: [["ol", 0.85], ["skill", 0.15]], run_block: [["ol", 0.8], ["skill", 0.2]],
  rb_vision: [["skill", 1]], rb_power: [["skill", 1]], rb_speed: [["skill", 1]], rb_elusive: [["skill", 1]],
  ball_security: [["skill", 0.7], ["qb", 0.3]],
  pass_rush: [["dl", 0.8], ["lb", 0.2]], run_def: [["dl", 1]], lb_run_fit: [["lb", 1]], lb_speed: [["lb", 1]],
  coverage: [["db", 0.87], ["lb", 0.13]], ball_skills: [["db", 1]], range: [["db", 1]], tackling: [["lb", 2 / 7], ["db", 5 / 7]],
};

/**
 * A team's rates with some position groups tired (`tired` in SDs below their ratings). The compiler is
 * linear in z, so lowering every player in a group by t lowers each unit input by t times its group weight.
 */
export function withFatigue(r: TeamRatings, tired: Partial<Record<Group, number>>): TeamRatings {
  let any = false;
  for (const g in tired) if (tired[g as Group]) { any = true; break; }
  if (!any) return r;
  const move = (rates: UnitRates, per: Record<Rate, [Group, number][]>): UnitRates => {
    const out = { ...rates };
    for (const k of RATES) {
      let sh = 0;
      for (const [g, c] of per[k]) sh -= c * (tired[g] ?? 0);
      out[k] = apply(rates[k], k, sh);
    }
    return out;
  };
  return { ...r, offense: move(r.offense, GROUP_TERMS.offense), defense: move(r.defense, GROUP_TERMS.defense) };
}

/** Each rate's coefficient on each group's fatigue, folded once from the terms and the input groups. */
const GROUP_TERMS = (() => {
  const fold = (terms: Record<Rate, Terms>) => {
    const out = {} as Record<Rate, [Group, number][]>;
    for (const r of RATES) {
      const acc = new Map<Group, number>();
      for (const [input, c] of terms[r]) for (const [g, w] of INPUT_GROUPS[input]) acc.set(g, (acc.get(g) ?? 0) + c * w);
      out[r] = [...acc];
    }
    return out;
  };
  return { offense: fold(OFFENSE_TERMS), defense: fold(DEFENSE_TERMS) };
})();

function shares(l: Lineup, table: Partial<Record<Slot, number>>, key: "carry" | "target", tilt: (p: RatedPlayer) => number, k: number,
  mults: (p: RatedPlayer) => { catch_mult: number; ypc_mult: number }): PlayerShare[] {
  const rows = (Object.entries(table) as [Slot, number][]).filter(([s]) => l.slot[s]).map(([s, w]) => {
    const p = l.slot[s]!;
    const t = p.tend[key];
    return { p, w: (t != null ? 0.6 * w + 0.4 * t : w) * Math.exp(k * tilt(p)) };
  });
  return rows.map(({ p, w }) => ({ name: playerName(p), pos: p.pos, share: Math.round(w * 1000) / 10, ...mults(p) }));
}

/**
 * Compile a team: `base` supplies everything players don't set (pace, pass lean, penalties, coaching
 * aggressiveness, returns); the lineup sets the unit rates, names, shares, scrambles and kicking.
 */
export function compileTeam(base: TeamRatings, l: Lineup, scheme: SchemeOffsets, kicking: { fg_skill: number; punt_gross: number }): TeamRatings {
  const u = units(l);
  const off = unitRates(shifts(u, OFFENSE_TERMS), scheme.offense);
  const def = unitRates(shifts(u, DEFENSE_TERMS), scheme.defense);
  off.third_down_bonus = base.offense.third_down_bonus;
  def.third_down_bonus = base.defense.third_down_bonus;
  const s = l.slot, qb = s.QB;
  const recvTilt = (p: RatedPlayer) => (at(p, "route") + at(p, "hands") + at(p, "speed")) / 3;
  const runTilt = (p: RatedPlayer) => (p.pos === "QB" ? at(p, "speed") : (at(p, "vision") + at(p, "speed") + at(p, "elusive")) / 3);
  const k = s.K, p = s.P;
  return {
    ...base,
    offense: off, defense: def,
    qb: qb ? playerName(qb) : base.qb,
    kicker: k ? playerName(k) : base.kicker,
    punter: p ? playerName(p) : base.punter,
    scramble_rate: qb?.tend.scramble ?? 0,
    scramble_scale: qb ? Math.max(2.5, 4.85 + 1.2 * at(qb, "speed")) : 0,
    fg_skill: kicking.fg_skill + kickerSkill(k),
    punt_gross: kicking.punt_gross + punterSkill(p),
    rushers: shares(l, CARRY_SHARE, "carry", runTilt, 0.1, (x) => ({
      catch_mult: 1, ypc_mult: Math.exp(x.pos === "QB" ? 0.05 * at(x, "speed") : 0.05 * at(x, "vision") + 0.03 * at(x, "power") + 0.04 * at(x, "speed")),
    })),
    receivers: shares(l, TARGET_SHARE, "target", recvTilt, 0.24, (x) => ({
      catch_mult: Math.exp(0.05 * at(x, "hands") + 0.04 * at(x, "route")),
      ypc_mult: Math.exp(0.06 * at(x, "speed") + 0.04 * at(x, "rac") + (x.pos === "WR" ? 0.08 : x.pos === "TE" ? -0.05 : -0.3)),
    })),
  };
}

/** Yards a kicker moves the field-goal make curve, and a punter adds to gross punts; a stand-in is poor. */
export const kickerSkill = (k: RatedPlayer | undefined) => (k?.pos === "K" ? 1.6 * (0.6 * at(k, "k_acc") + 0.4 * at(k, "k_power")) : -2);
export const punterSkill = (p: RatedPlayer | undefined) => (p?.pos === "P" ? 1.8 * at(p, "p_power") + 0.6 * at(p, "hang") : -4);

/** Best available depth chart from ratings: each slot ordered by overall at its positions. */
export function autoDepth(players: RatedPlayer[], out: Set<number> = new Set()): DepthChart {
  const pool = players.filter((p) => !out.has(p.id));
  // Coaches lean on players who have done it: playing experience breaks near-ties, most of all at QB.
  const key = (p: RatedPlayer) => p.ovr + (p.pos === "QB" ? 4 : 1.5) * Math.min(1, p.sample / (p.pos === "QB" ? 300 : 60));
  const byPos = (ps: Pos[]) => pool.filter((p) => ps.includes(p.pos)).sort((a, b) => key(b) - key(a) || a.id - b.id);
  const d: DepthChart = {};
  const take = (slots: Slot[], ranked: RatedPlayer[], deep: number) => {
    // Starters go to slots in order; each slot's backups are the next best not starting elsewhere.
    const starters = ranked.slice(0, slots.length);
    const bench = ranked.slice(slots.length);
    slots.forEach((s, i) => { d[s] = [starters[i], ...bench.slice(0, deep - 1)].filter(Boolean).map((p) => p!.id); });
  };
  take(["QB"], byPos(["QB"]), 3);
  take(["RB1", "RB2"], byPos(["RB"]), 3);
  take(["WR_X", "WR_Z", "WR_SLOT", "WR4"], byPos(["WR"]), 3);
  take(["TE1", "TE2"], byPos(["TE"]), 2);
  // Line: the five best; the two best pass blockers play tackle.
  const ol = byPos(["OL"]);
  const five = ol.slice(0, 5).sort((a, b) => (b.attrs.pass_block ?? 0) - (a.attrs.pass_block ?? 0));
  const order = [five[0], five[2], five[4], five[3], five[1]];
  (["LT", "LG", "C", "RG", "RT"] as Slot[]).forEach((s, i) => { d[s] = [order[i], ...ol.slice(5, 7)].filter(Boolean).map((p) => p!.id); });
  const ends = byPos(["DE"]), tackles = byPos(["DT"]);
  take(["DE1", "DE2"], ends.length >= 2 ? ends : [...ends, ...tackles], 3);
  take(["DT1", "DT2"], tackles.length >= 2 ? tackles.filter((p) => !(d.DE1?.[0] === p.id || d.DE2?.[0] === p.id)) : [...tackles, ...ends.slice(2)], 3);
  take(["LB1", "LB2"], byPos(["LB"]), 3);
  take(["CB1", "CB2", "NB"], byPos(["CB"]), 3);
  if (!d.NB?.length) d.NB = byPos(["S"]).slice(2, 4).map((p) => p.id);
  take(["S1", "S2"], byPos(["S"]), 3);
  take(["K"], byPos(["K"]).length ? byPos(["K"]) : byPos(["P"]), 2);
  take(["P"], byPos(["P"]).length ? byPos(["P"]) : byPos(["K"]), 2);
  take(["LS"], byPos(["LS"]), 2);
  return d;
}

export { ATTRS, overall };
