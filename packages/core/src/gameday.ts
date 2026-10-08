import { GameSim, Rng, type DecisionProvider, type TeamRatings } from "@cfb/engine";
import { compileTeam, lineup, withFatigue, type Group, type Lineup } from "./compiler.ts";
import { DEFENSE_SLOTS, OFFENSE_SLOTS, SPECIAL_SLOTS, playerName, z, type DepthChart, type Pos, type RatedPlayer, type Slot } from "./players.ts";
import type { TeamPlayers } from "./types.ts";

/**
 * Game day: who is on the field each snap. Players tire as they play and recover on the sideline;
 * a tired starter plays below his ratings until the coach sends in his backup. Players get hurt,
 * and the next healthy player on the depth chart takes the slot. Starters sit in blowouts.
 *
 * Every change recompiles that side's lineup and swaps it into the engine between snaps. Injuries
 * draw from their own stream, so the engine's own draws are untouched.
 */

/** Slots on the field each snap. Second backs, fourth receivers and second tight ends share touches but do not tire. */
export const OFFENSE_FIELD: Slot[] = ["QB", "RB1", "WR_X", "WR_Z", "WR_SLOT", "TE1", "LT", "LG", "C", "RG", "RT"];
export const DEFENSE_FIELD: Slot[] = DEFENSE_SLOTS;
const FIELD = [...OFFENSE_FIELD, ...DEFENSE_FIELD];
const POS_GROUP: Partial<Record<Pos, Group>> = { QB: "qb", RB: "skill", WR: "skill", TE: "skill", OL: "ol", DE: "dl", DT: "dl", LB: "lb", CB: "db", S: "db" };
const SLOT_GROUP: Partial<Record<Slot, Group>> = {
  QB: "qb", RB1: "skill", WR_X: "skill", WR_Z: "skill", WR_SLOT: "skill", TE1: "skill", LT: "ol", LG: "ol", C: "ol", RG: "ol", RT: "ol",
  DE1: "dl", DE2: "dl", DT1: "dl", DT2: "dl", LB1: "lb", LB2: "lb", CB1: "db", CB2: "db", NB: "db", S1: "db", S2: "db",
};

/** Energy a player loses per snap on the field (stamina 75), and gains per snap off it. */
const DRAIN: Record<Pos, number> = { QB: 0.004, RB: 0.03, WR: 0.02, TE: 0.02, OL: 0.008, DE: 0.075, DT: 0.085, LB: 0.03, CB: 0.022, S: 0.02, K: 0, P: 0, LS: 0 };
const RECOVER = 0.05;
/**
 * Backs, receivers and tight ends are not rotated for fatigue: their carry and target shares already split
 * the work the way real committees do, so they only play a little worse when tired.
 */
const SHARED: Partial<Record<Pos, true>> = { RB: true, WR: true, TE: true };
/** Snaps between substitution checks within a series. */
const ROTATE_EVERY = 3;
/** A tired starter comes out below this energy and goes back in above the second. */
export const SUB_OUT = 0.7;
const SUB_IN = 0.9;
/** At the point a coach subs, a player plays this many SDs below his ratings. */
const TIRED_SD = 0.3;
/**
 * How far below its ratings each group plays on an average snap: tiredness (from scripts/gameday-check.ts)
 * plus, for linemen and linebackers, the backups who rotate in. Team ratings are measured
 * from real games, tiredness included, so a group plays at its ratings when it is this tired, a little
 * better when fresh and worse when spent.
 */
export const TYPICAL_TIREDNESS: Record<Group, number> = { qb: 0.02, skill: 0.11, ol: 0.03, dl: 0.45, lb: 0.16, db: 0.1 };

/** Injury hazard per snap on the field (before the injury-proneness trait). The ball carrier's is several times higher. */
const HAZARD: Record<Pos, number> = { QB: 3.5e-4, RB: 9e-4, WR: 8e-4, TE: 8e-4, OL: 7e-4, DE: 9e-4, DT: 9e-4, LB: 1e-3, CB: 8e-4, S: 9e-4, K: 0, P: 0, LS: 0 };
const TOUCH = 4;

/** Severity bands: share of injuries, days out (0 = back next game), and what it is. */
const SEVERITY: { share: number; snaps?: [number, number]; days?: [number, number]; types: string[] }[] = [
  { share: 0.3, snaps: [2, 10], types: ["shaken up", "cramping", "stinger", "had the wind knocked out of him"] },
  { share: 0.2, days: [0, 0], types: ["ankle", "shoulder", "concussion evaluation", "knee", "hip pointer"] },
  { share: 0.2, days: [5, 10], types: ["ankle sprain", "hamstring strain", "shoulder sprain", "concussion", "bruised ribs"] },
  { share: 0.14, days: [11, 24], types: ["high ankle sprain", "hamstring strain", "knee sprain", "hand fracture", "turf toe"] },
  { share: 0.1, days: [25, 50], types: ["MCL sprain", "broken foot", "shoulder separation", "broken wrist", "meniscus tear"] },
  { share: 0.06, days: [90, 240], types: ["torn ACL", "torn Achilles", "broken leg", "torn labrum", "Lisfranc injury"] },
];

export interface InGameInjury {
  pid: number; team_id: number; name: string; pos: Pos; quarter: number; clock: number;
  type: string; /** Days out; 0 = misses only the rest of this game. Absent for a player who returns in the game. */ days?: number;
}

export interface SideSetup {
  team_id: number;
  base: TeamRatings;
  players: TeamPlayers;
  depth: DepthChart;
  /** Players unavailable before kickoff (injured). */
  out: Set<number>;
}

/** Starters sit: the leading team in a rout, the trailing team only once it is hopeless. `lead` < 0 when trailing. */
const BLOWOUT = (q: number, clock: number, lead: number) => lead > 0
  ? (q === 3 && lead >= 42) || (q === 4 && (lead >= 31 || (lead >= 24 && clock <= 360)))
  : q === 4 && (-lead >= 35 || (-lead >= 28 && clock <= 360));

class SideState {
  readonly byId: Map<number, RatedPlayer>;
  readonly byName = new Map<string, RatedPlayer>();
  readonly energy = new Map<number, number>();
  /** Per-player drain and recovery per snap, scaled by stamina. */
  private readonly rate = new Map<number, [drain: number, recover: number]>();
  readonly resting = new Set<number>();
  /** Out for the rest of the game, or (value > 0) for that many more snaps. */
  readonly hurt = new Map<number, number>();
  readonly snaps = new Map<number, number>();
  /** Team snaps on offense and defense. */
  plays = { offense: 0, defense: 0 };
  private compiled = new Map<string, TeamRatings>();
  field: RatedPlayer[] = [];
  offenseField: RatedPlayer[] = [];
  defenseField: RatedPlayer[] = [];
  key = "";
  benched = false;
  /** Something changed that can change the lineup (a sub, an injury, a new series, a quarter break). */
  dirty = false;
  sinceSub = 0;

  constructor(readonly s: SideSetup) {
    this.byId = new Map(s.players.players.map((p) => [p.id, p]));
    for (const p of s.players.players) {
      if (!this.byName.has(playerName(p))) this.byName.set(playerName(p), p);
      this.energy.set(p.id, 1);
      this.rate.set(p.id, [DRAIN[p.pos] * Math.exp(-0.25 * z(p.traits.stamina)), RECOVER * Math.exp(0.15 * z(p.traits.stamina))]);
    }
  }

  /** Starters at each field slot as the depth chart has them (first healthy player). */
  starters(): Set<number> {
    const l = lineup(this.s.depth, this.byId, this.unavailable(false));
    return new Set(FIELD.map((k) => l.slot[k]?.id).filter((x): x is number => x != null));
  }

  unavailable(withRest = true): Set<number> {
    const out = new Set(this.s.out);
    for (const id of this.hurt.keys()) out.add(id);
    if (withRest) for (const id of this.resting) out.add(id);
    return out;
  }

  /** This snap's lineup: injured and resting players out, starters out in a blowout. */
  lineup(): Lineup {
    const hurt = this.unavailable(false);
    const out = new Set(hurt);
    for (const id of this.resting) out.add(id);
    if (this.benched) for (const id of this.starters()) out.add(id);
    let l = lineup(this.s.depth, this.byId, out);
    // A slot with nobody fresh left goes to its least tired healthy player rather than an empty slot.
    let refill = false;
    for (const k of FIELD) {
      if (l.slot[k]) continue;
      const best = (this.s.depth[k] ?? []).filter((id) => !hurt.has(id)).sort((a, b) => this.energy.get(b)! - this.energy.get(a)!)[0];
      if (best != null) { out.delete(best); refill = true; }
    }
    if (refill) l = lineup(this.s.depth, this.byId, out);
    return l;
  }

  /** How many SDs below his ratings a player plays at his current energy. */
  tiredness(id: number): number {
    const e = this.energy.get(id) ?? 1;
    return Math.min(1.3, Math.max(0, (1 - e) / (1 - SUB_OUT))) * TIRED_SD;
  }

  /** The ratings for this snap, or null when nothing changed: personnel compiled, then each group's fatigue. */
  update(): TeamRatings | null {
    const l = this.lineup();
    const pick = (slots: Slot[]) => slots.map((k) => l.slot[k]).filter((p): p is RatedPlayer => !!p);
    this.offenseField = pick(OFFENSE_FIELD);
    this.defenseField = pick(DEFENSE_FIELD);
    this.field = [...this.offenseField, ...this.defenseField];
    const id = (k: Slot) => l.slot[k]?.id ?? 0;
    const offKey = [...OFFENSE_SLOTS, ...SPECIAL_SLOTS].map(id).join(","), defKey = DEFENSE_SLOTS.map(id).join(",");
    const sum: Partial<Record<Group, [number, number]>> = {};
    for (const k of FIELD) {
      const p = l.slot[k], g = SLOT_GROUP[k];
      if (!p || !g) continue;
      const acc = (sum[g] ??= [0, 0]);
      acc[0] += this.tiredness(p.id); acc[1]++;
    }
    const tired: Partial<Record<Group, number>> = {};
    for (const [g, [t, n]] of Object.entries(sum) as [Group, [number, number]][]) tired[g] = Math.round((t / n - TYPICAL_TIREDNESS[g]) * 100) / 100;
    const key = `${offKey}|${defKey}|${Object.values(tired).join(",")}`;
    if (key === this.key) return null;
    this.key = key;
    // Offense and defense compile apart, so a defensive rotation reuses the offense's compile and vice versa.
    const half = (k: string) => {
      let r = this.compiled.get(k);
      if (!r) { r = compileTeam(this.s.base, l, this.s.players.scheme, this.s.players.kicking); this.compiled.set(k, r); }
      return r;
    };
    const off = half(offKey), def = half("d" + defKey);
    return withFatigue({ ...off, defense: def.defense }, tired);
  }

  /** Players below full energy; only they and the players on the field change. */
  private winded = new Set<number>();

  tick(on: Set<number>): void {
    for (const id of this.winded) {
      if (on.has(id)) continue;
      const e = Math.min(1, this.energy.get(id)! + this.rate.get(id)![1]);
      this.energy.set(id, e);
      if (e >= 1) this.winded.delete(id);
    }
    for (const id of on) {
      const d = this.rate.get(id)![0];
      if (!d) continue;
      this.energy.set(id, Math.max(0, this.energy.get(id)! - d));
      this.winded.add(id);
    }
  }

  rest(bonus: number): void {
    for (const id of this.winded) {
      const e = Math.min(1, this.energy.get(id)! + bonus);
      this.energy.set(id, e);
      if (e >= 1) this.winded.delete(id);
    }
  }

  onField(offense: boolean): RatedPlayer[] { return offense ? this.offenseField : this.defenseField; }
}

export interface GameDayOptions {
  /** Scales every injury hazard: 1 = real football, 0 = no injuries. */
  injuries?: number;
  /** false: tired players stay in (and play tired). */
  rotation?: boolean;
  /** false: starters stay in blowouts. */
  blowouts?: boolean;
}

export interface GameDayResult { injuries: InGameInjury[]; snaps: Record<number, number>; plays: Record<number, { offense: number; defense: number }> }

/**
 * Runs one game with substitutions. `rng` is the injury stream; `injuryRate` scales every hazard
 * (0 turns injuries off).
 */
export class GameDay {
  readonly sides: { home: SideState; away: SideState };
  readonly injuries: InGameInjury[] = [];
  private last: { home: RatedPlayer[]; away: RatedPlayer[]; offense: "home" | "away" } | null = null;
  private lastQuarter = 1;
  /** Total tiredness (SD) and player-snaps by group, for calibration. */
  readonly fatigue: Partial<Record<Group, [number, number]>> = {};

  private injuryRate: number;

  constructor(home: SideSetup, away: SideSetup, private rng: Rng, private opts: GameDayOptions = {}) {
    this.sides = { home: new SideState(home), away: new SideState(away) };
    this.injuryRate = opts.injuries ?? 1;
  }

  /** Ratings to start the game with. */
  kickoff(): { home: TeamRatings; away: TeamRatings } {
    return { home: this.sides.home.update()!, away: this.sides.away.update()! };
  }

  /** Answers nothing; on every snap it settles the last snap (fatigue, injuries) and sets this snap's lineups. */
  provider(next?: DecisionProvider): DecisionProvider {
    return (req, game) => {
      if (req.kind === "snap") this.beforeSnap(game);
      return next?.(req, game);
    };
  }

  private beforeSnap(game: GameSim): void {
    const q = game.quarter;
    if (this.last) this.settle(game);
    // Rest between quarters, more at halftime.
    if (q !== this.lastQuarter) {
      const bonus = this.lastQuarter === 2 ? 0.5 : 0.15;
      for (const s of [this.sides.home, this.sides.away]) {
        s.rest(bonus);
        s.dirty = true;
      }
      this.lastQuarter = q;
    }
    const offense = game.offense === game.home ? "home" : "away";
    if (this.last && this.last.offense !== offense) this.sides.home.dirty = this.sides.away.dirty = true;
    const lead = game.home.score - game.away.score;
    for (const k of ["home", "away"] as const) {
      const s = this.sides[k];
      const blowout = this.opts.blowouts !== false && !game.overtime && BLOWOUT(q, game.clock, k === "home" ? lead : -lead);
      if (blowout !== s.benched) {
        s.benched = blowout;
        s.dirty = true;
        if (blowout) game.note("SUB", `${game[k].ratings.abbr} empties the bench.`);
      }
      // Coaches rotate tired players out and fresh ones back in, at a change of possession or every few snaps.
      if (this.opts.rotation === false) { if (s.dirty) { s.dirty = false; const r = s.update(); if (r) game.setRatings(k, r); } continue; }
      if (!s.dirty && ++s.sinceSub < ROTATE_EVERY) continue;
      s.sinceSub = 0;
      const tired = s.field.filter((p) => !SHARED[p.pos] && (s.energy.get(p.id) ?? 1) < SUB_OUT);
      if (tired.length) {
        const out = s.unavailable();
        for (const p of tired) if (hasBackup(s, p.id, out)) { s.resting.add(p.id); out.add(p.id); s.dirty = true; }
      }
      for (const id of s.resting) if ((s.energy.get(id) ?? 1) >= SUB_IN) { s.resting.delete(id); s.dirty = true; }
      if (!s.dirty) continue;
      s.dirty = false;
      const r = s.update();
      if (r) game.setRatings(k, r);
    }
    this.last = {
      offense,
      home: this.sides.home.onField(offense === "home"),
      away: this.sides.away.onField(offense === "away"),
    };
  }

  /** The last snap happened: tire the players on the field, rest the rest, roll for injuries. */
  private settle(game: GameSim): void {
    const last = this.last!;
    for (const k of ["home", "away"] as const) {
      const s = this.sides[k];
      const on = new Set(last[k].map((p) => p.id));
      s.tick(on);
      for (const p of last[k]) {
        s.snaps.set(p.id, (s.snaps.get(p.id) ?? 0) + 1);
        const g = POS_GROUP[p.pos];
        if (g) { const a = (this.fatigue[g] ??= [0, 0]); a[0] += s.tiredness(p.id); a[1]++; }
      }
      s.plays[last.offense === k ? "offense" : "defense"]++;
      for (const [id, left] of s.hurt) if (left > 0) { if (left === 1) { s.hurt.delete(id); s.dirty = true; } else s.hurt.set(id, left - 1); }
      if (!this.injuryRate) continue;
      const touched = game.lastTouch?.side === k ? s.byName.get(game.lastTouch.name)?.id : undefined;
      for (const p of last[k]) {
        const h = HAZARD[p.pos] * this.injuryRate * Math.exp(0.5 * (p.traits.injury - 50) / 15) * (p.id === touched ? TOUCH : 1);
        if (this.rng.random() < h) this.injure(game, k, p);
      }
    }
  }

  private injure(game: GameSim, k: "home" | "away", p: RatedPlayer): void {
    const s = this.sides[k];
    let u = this.rng.random();
    const band = SEVERITY.find((b) => (u -= b.share) < 0) ?? SEVERITY[SEVERITY.length - 1];
    const type = band.types[Math.floor(this.rng.random() * band.types.length)];
    const name = playerName(p);
    const inj: InGameInjury = { pid: p.id, team_id: s.s.team_id, name, pos: p.pos, quarter: game.quarter, clock: game.clock, type };
    if (band.snaps) {
      s.hurt.set(p.id, band.snaps[0] + Math.floor(this.rng.random() * (band.snaps[1] - band.snaps[0] + 1)));
      game.note("INJURY", `${name} (${game[k].ratings.abbr}) is shaken up on the play and comes off.`);
    } else {
      const [lo, hi] = band.days!;
      // Tough players heal faster.
      inj.days = hi === 0 ? 0 : Math.max(lo, Math.round((lo + this.rng.random() * (hi - lo)) * Math.exp(-0.15 * z(p.traits.toughness))));
      s.hurt.set(p.id, 0);
      game.note("INJURY", `${name} (${game[k].ratings.abbr}) is hurt (${type}) and will not return.`);
    }
    this.injuries.push(inj);
    s.resting.delete(p.id);
    s.dirty = true;
  }

  result(): GameDayResult {
    const snaps: Record<number, number> = {};
    for (const s of [this.sides.home, this.sides.away]) for (const [id, n] of s.snaps) snaps[id] = n;
    const plays = Object.fromEntries([this.sides.home, this.sides.away].map((s) => [s.s.team_id, s.plays]));
    return { injuries: this.injuries, snaps, plays };
  }
}

/** A player can rest only if some healthy teammate is listed behind him at a slot he plays. */
function hasBackup(s: SideState, id: number, out: Set<number>): boolean {
  return FIELD.some((k) => {
    const list = s.s.depth[k] ?? [];
    return list.includes(id) && list.some((x) => x !== id && !out.has(x));
  });
}
