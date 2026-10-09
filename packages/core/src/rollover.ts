import { Rng, type TeamRatings } from "@cfb/engine";
import { autoDepth, compileTeam, lineup } from "./compiler.ts";
import { addDays, type ISODate } from "./dates.ts";
import { mixSeed } from "./hash.ts";
import { ATTRS, POSITIONS, fromZ, overall, z, type Pos, type RatedPlayer } from "./players.ts";
import type { Game, ScheduledGame, Team, TeamPlayers } from "./types.ts";
import { STARTERS } from "./valuation.ts";

/**
 * Season rollover (M3 step 2): after the season ends, every roster moves on a year. Seniors out of
 * eligibility leave, the best older players turn pro, everyone else develops (what scouts expected plus
 * the hidden development from the season just played), and each team fills its roster back up with
 * freshmen. Until real recruiting arrives (M3 step 3) the freshmen are generated to look like the
 * team's own recent classes, and until the draft (step 4) a simple rule sends players to the NFL.
 */

/**
 * Overall points a player gains in a year on average, by seasons already in college. From the 2026
 * rosters: each class rates about 2 points above the one before it at every level (P4, Group of Five, FCS).
 */
export const YEAR_GAIN = [3, 2, 3, 2, 1.5];

/**
 * How far above his overall a player tops out, by seasons already in college: what the usual years he
 * has left would add plus a quarter more of upside (scaled ±30% for his own pace), the unfilled part of
 * a high recruiting grade, and a little noise. A true freshman has about 13.5 points left (as a signee
 * arriving at college does), a senior 3.5 and a fifth-year 1, so young players nearly always have room
 * and a good share of older ones are already at their ceiling.
 */
export function ceilingRoom(years: number, composite: number | null, rng: Rng): number {
  const rem = YEAR_GAIN.slice(clamp(Math.floor(years), 0, 4), 4).reduce((a, b) => a + b, 0);
  const rz = composite != null ? (composite - 0.8684) / 0.0341 : -1;
  return rem * (1.25 + 0.3 * rng.gauss(0, 1)) + 2 * Math.max(0, rz) * rem / 10 + 1 + 2 * rng.gauss(0, 1);
}
/** A seeded player's potential from his own (final) overall, so team anchoring and stats can't eat his room. */
export function seedPotential(p: { id: number; ovr: number; years: number; composite: number | null }, season: number): number {
  return Math.round(clamp(p.ovr + ceilingRoom(p.years, p.composite, new Rng(mixSeed(season, "potential", p.id))), 20, 99));
}

/**
 * How fast a program develops players, around 1: better weight rooms, practice and medical facilities
 * (grades 1 to 5) develop more. A program with no facilities on record (FCS) counts as grade 2.
 */
export function devRate(f: Partial<Record<string, number>> | undefined): number {
  const g = f ? ["weight_room", "practice", "medical"].map((k) => f[k] ?? 2) : [2, 2, 2];
  return Math.round((1 + 0.08 * (g.reduce((a, b) => a + b, 0) / g.length - 3.2)) * 1000) / 1000;
}
/** Most players a roster can carry (the House settlement). */
export const ROSTER_LIMIT = 105;
/** Below this many players a team adds freshmen beyond its usual size. */
const ROSTER_FLOOR = 80;
/**
 * Chance a player who has played four seasons stays for a fifth (a redshirt year he hasn't used): the
 * better he is against his own roster, the likelier (real fifth-year players rate well above seniors).
 */
const fifthYear = (ovr: number, median: number) => clamp(0.25 + 0.06 * (ovr - median), 0.05, 0.85);

export interface Departure { pid: number; team_id: number; name: string; pos: Pos; ovr: number; reason: "graduated" | "nfl" | "released" | "transfer" | "left"; potential?: number; years?: number; /** Where a transfer went. */ to?: number }

/** The fewest players a roster carries at each position. */
const MIN_AT: Record<Pos, number> = { QB: 3, RB: 3, WR: 6, TE: 3, OL: 10, DE: 4, DT: 4, LB: 5, CB: 5, S: 4, K: 1, P: 1, LS: 1 };

/**
 * How a team's freshmen rate when they arrive: each position's average and spread across the country
 * (in rating SDs), and how far a team's own classes run above or below it. Measured once, from the
 * opening rosters, and kept, so generated classes don't drift.
 */
export interface FreshModel { pos: Record<string, { m: number; sd: number }>; team: Record<number, number> }

export function freshModel(players: Record<string, TeamPlayers>): FreshModel {
  const fr = Object.entries(players).flatMap(([tid, t]) => t.players.filter((p) => p.years < 1).map((p) => ({ tid: Number(tid), pos: p.pos, z: z(p.ovr) })));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const m: Record<string, number> = {};
  for (const ps of POSITIONS) { const xs = fr.filter((p) => p.pos === ps).map((p) => p.z); m[ps] = xs.length ? mean(xs) : -1.5; }
  const raw = new Map<number, number[]>();
  for (const p of fr) { const d = raw.get(p.tid); if (d) d.push(p.z - m[p.pos]); else raw.set(p.tid, [p.z - m[p.pos]]); }
  const team: FreshModel["team"] = {};
  // A team's level, shrunk toward the national average when it has few freshmen to go on.
  for (const tid of Object.keys(players).map(Number)) { const d = raw.get(tid) ?? []; team[tid] = r3(d.reduce((a, b) => a + b, 0) / (d.length + 5)); }
  // The spread within a team's class (its level taken out), so new classes vary as much as real ones do.
  const pos: FreshModel["pos"] = {};
  for (const ps of POSITIONS) {
    const xs = fr.filter((p) => p.pos === ps).map((p) => p.z - m[ps] - mean(raw.get(p.tid) ?? [0]));
    const sd = xs.length > 1 ? Math.sqrt(mean(xs.map((x) => x * x))) : 0.5;
    pos[ps] = { m: r3(m[ps]), sd: r3(Math.max(0.2, sd)) };
  }
  return { pos, team };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Class label from seasons already in college. */
export const classOf = (years: number) => (years < 1 ? "FR" : years < 2 ? "SO" : years < 3 ? "JR" : "SR");

const SIZE: Record<Pos, [number, number]> = {
  QB: [74, 215], RB: [70, 205], WR: [72, 190], TE: [76, 245], OL: [77, 305], DE: [76, 255], DT: [75, 295],
  LB: [73, 230], CB: [71, 185], S: [72, 200], K: [72, 190], P: [74, 205], LS: [73, 230],
};

/** Stars from a recruiting composite (the national services' cutoffs). */
export const starsFor = (c: number | null) => (c == null ? null : c >= 0.9834 ? 5 : c >= 0.89 ? 4 : c >= 0.797 ? 3 : 2);

export interface RosterTurn {
  players: Record<string, TeamPlayers>;
  left: Departure[];
  added: RatedPlayer[];
  next_player_id: number;
}

/**
 * Move every roster on a year. `growth` is each player's development surprise over the season just
 * played (overall points, from hidden.ts); `gp` his games played (playing time makes him a known quantity).
 */
export function rollRosters(o: {
  seed: number; year: number; teams: Team[]; players: Record<string, TeamPlayers>; model: FreshModel; next_player_id: number;
  growth: (teamId: number) => Map<number, number>; gp: Record<number, number>;
  /** Each program's development rate (devRate); 1 when absent. */
  rate?: (teamId: number) => number;
  /** Players who declared early for the NFL draft (absent: the best few leave, as before the draft). */
  declared?: Set<number>;
  /** Each team's signing class, rated as college freshmen (recruiting.ts); generated freshmen fill only what's left. */
  incoming?: Record<number, RatedPlayer[]>;
  /** Transfers from the portal (player id to his new school), and portal entrants who found no school (they leave). */
  transfers?: Map<number, number>;
  gone?: Set<number>;
  /** Transfers that cost a season (a second transfer under the Protect College Sports Act). */
  lostSeason?: Set<number>;
  /** The Act's five seasons in five years: fourth-year players stay for a fifth unless they turn pro or are done. */
  fiveYears?: boolean;
  /** The league's rating scale (starterMedians of its first season); absent: no re-centering. */
  anchor?: Partial<Record<Pos, number>>;
}): RosterTurn {
  const { seed, year, model } = o;
  let nextId = o.next_player_id;
  const out: Record<string, TeamPlayers> = {}, left: Departure[] = [], added: RatedPlayer[] = [];
  // Names for new players come from the country's rosters, first and last drawn separately.
  const all = Object.values(o.players).flatMap((t) => t.players);
  const firsts = [...new Set(all.map((p) => p.first).filter(Boolean))].sort();
  const lasts = [...new Set(all.map((p) => p.last).filter(Boolean))].sort();
  // First every player's year: who leaves, who moves, everyone else develops (each team's own draws, in id order).
  const kept = new Map<number, RatedPlayer[]>(), rngs = new Map<number, Rng>(), arrivals = new Map<number, RatedPlayer[]>();
  const teams = [...o.teams].sort((a, b) => a.id - b.id);
  for (const t of teams) {
    const tp = o.players[t.id];
    if (!tp) continue;
    const rng = new Rng(mixSeed(seed, year, t.id, "rollover"));
    rngs.set(t.id, rng);
    const growth = o.growth(t.id);
    const keep: RatedPlayer[] = [];
    const ovrs = tp.players.map((p) => p.ovr).sort((a, b) => a - b), median = ovrs[Math.floor(ovrs.length / 2)] ?? 60;
    for (const p of [...tp.players].sort((a, b) => a.id - b.id)) {
      const done = p.years + 1;
      const u = rng.random(), v = rng.random();
      const go = (reason: Departure["reason"], to?: number) => left.push({ pid: p.id, team_id: t.id, name: `${p.first} ${p.last}`.trim(), pos: p.pos, ovr: p.ovr, reason, potential: p.hidden.potential, years: p.years, ...(to != null ? { to } : {}) });
      if (done >= 5) { go(p.ovr >= 80 ? "nfl" : "graduated"); continue; }
      // Early entrants: the ones who declared in January (draft.ts), or in older leagues the best few.
      if (done >= 3 && (o.declared ? o.declared.has(p.id) : u < clamp((p.ovr - 81) / 8, 0, 0.85))) { go("nfl"); continue; }
      if (o.gone?.has(p.id)) { go("left"); continue; }
      const to = o.transfers?.get(p.id);
      if (to != null && to !== t.id && o.players[to]) {
        // A transfer develops over the year he just played, then joins his new school (a second one under the Act costs him a season).
        const d = develop(p, done + (o.lostSeason?.has(p.id) ? 1 : 0), growth.get(p.id) ?? 0, o.gp[p.id] ?? 0, o.rate?.(t.id) ?? 1, rng);
        go("transfer", to);
        if (d.years < 5) { const g = arrivals.get(to) ?? []; g.push({ ...d, team_id: to }); arrivals.set(to, g); }
        continue;
      }
      const stays = to != null ? 1 : o.fiveYears ? clamp(0.6 + 0.06 * (p.ovr - median), 0.3, 0.95) : fifthYear(p.ovr, median);
      if (done >= 4 && v >= stays) { go(p.ovr >= 80 ? "nfl" : "graduated"); continue; }
      keep.push(develop(p, done, growth.get(p.id) ?? 0, o.gp[p.id] ?? 0, o.rate?.(t.id) ?? 1, rng));
    }
    kept.set(t.id, keep);
  }
  for (const t of teams) {
    const tp = o.players[t.id];
    if (!tp) continue;
    const rng = rngs.get(t.id)!;
    const keep = [...kept.get(t.id)!, ...(arrivals.get(t.id) ?? [])];
    // Back to the team's usual size, never over the roster limit: the least-rated players at positions
    // with more than their share are released, then freshmen fill the positions furthest below theirs.
    const before = tp.players.length;
    const target = clamp(Math.max(before, ROSTER_FLOOR), 0, ROSTER_LIMIT);
    const want = new Map<Pos, number>(), have = new Map<Pos, number>();
    for (const p of tp.players) want.set(p.pos, (want.get(p.pos) ?? 0) + target / before);
    for (const p of keep) have.set(p.pos, (have.get(p.pos) ?? 0) + 1);
    // The signing class comes first; generated players fill only what's left (stand-ins for transfers until the portal).
    const fresh: RatedPlayer[] = [...(o.incoming?.[t.id] ?? [])];
    for (const p of fresh) have.set(p.pos, (have.get(p.pos) ?? 0) + 1);
    // With recruiting on, the fillers are walk-ons and stand-ins, not a second signing class.
    const add = (ps: Pos) => { have.set(ps, (have.get(ps) ?? 0) + 1); fresh.push(freshman(nextId++, t, ps, model, rng, firsts, lasts, o.incoming != null)); };
    // Every position at least its minimum first.
    for (const ps of POSITIONS) while ((have.get(ps) ?? 0) < MIN_AT[ps]) add(ps);
    while (keep.length + fresh.length > target) {
      // The position furthest over its share (keeping its minimum), and its least-rated returning player.
      let pos: Pos | null = null, over = -Infinity;
      for (const ps of POSITIONS) {
        const n = have.get(ps) ?? 0, o = n - (want.get(ps) ?? 0);
        if (n > MIN_AT[ps] && keep.some((p) => p.pos === ps) && o > over + 1e-9) { over = o; pos = ps; }
      }
      if (!pos) break;
      let cut = -1;
      keep.forEach((p, i) => { if (p.pos === pos && (cut < 0 || p.ovr < keep[cut].ovr || (p.ovr === keep[cut].ovr && p.id > keep[cut].id))) cut = i; });
      const [p] = keep.splice(cut, 1);
      have.set(p.pos, have.get(p.pos)! - 1);
      left.push({ pid: p.id, team_id: t.id, name: `${p.first} ${p.last}`.trim(), pos: p.pos, ovr: p.ovr, reason: "released" });
    }
    while (keep.length + fresh.length < target) {
      // The position furthest below its share of the roster.
      let best: Pos = "WR", gap = -Infinity;
      for (const ps of POSITIONS) {
        const g = (want.get(ps) ?? 0) - (have.get(ps) ?? 0);
        if (g > gap + 1e-9) { gap = g; best = ps; }
      }
      add(best);
    }
    const players = [...keep, ...fresh];
    added.push(...fresh);
    out[t.id] = { scheme: tp.scheme, kicking: tp.kicking, depth: {}, players };
  }
  // Ratings are relative (75 is the median FBS starter at the position), so a year of development,
  // recruiting and walk-ons can't drift the scale: returning players move by whatever keeps each
  // position's median FBS starter where it was in the league's first season.
  if (o.anchor) {
    const now = starterMedians(teams, out), shift = new Map<Pos, number>();
    for (const ps of POSITIONS) if (o.anchor[ps] != null && now[ps] != null) shift.set(ps, o.anchor[ps]! - now[ps]!);
    const fresh = new Set(added.map((p) => p.id));
    for (const tp of Object.values(out)) tp.players = tp.players.map((p) => (fresh.has(p.id) || !shift.get(p.pos) ? p : rescale(p, shift.get(p.pos)!)));
  }
  for (const tp of Object.values(out)) tp.depth = autoDepth(tp.players);
  return { players: out, left, added, next_player_id: nextId };
}

/** Each position's median FBS starter (the best STARTERS[pos] at each FBS school): the rating scale's anchor. */
export function starterMedians(teams: Team[], players: Record<string, TeamPlayers>): Partial<Record<Pos, number>> {
  const by = new Map<Pos, number[]>();
  for (const t of teams) {
    if (t.level !== "fbs" || !players[t.id]) continue;
    for (const ps of POSITIONS) {
      const xs = players[t.id].players.filter((p) => p.pos === ps).map((p) => p.ovr).sort((a, b) => b - a).slice(0, STARTERS[ps]);
      const g = by.get(ps); if (g) g.push(...xs); else by.set(ps, xs);
    }
  }
  const out: Partial<Record<Pos, number>> = {};
  for (const [ps, xs] of by) if (xs.length) out[ps] = xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return out;
}

/** A player moved up or down the scale by d points (his ceiling with him). */
function rescale(p: RatedPlayer, d: number): RatedPlayer {
  const attrs: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.attrs)) attrs[k] = clamp(v + d, 20, 99);
  return { ...p, attrs, ovr: overall(p.pos, attrs), hidden: { ...p.hidden, potential: clamp(p.hidden.potential + d, 20, 99) } };
}

/** A returning player one year on: what he was expected to gain, plus his hidden development, up to about his potential. */
function develop(p: RatedPlayer, years: number, surprise: number, gp: number, rate: number, rng: Rng): RatedPlayer {
  let gain = rate * YEAR_GAIN[clamp(Math.floor(p.years), 0, YEAR_GAIN.length - 1)] + surprise;
  // Past his potential, growth comes slowly.
  const room = p.hidden.potential - p.ovr;
  if (gain > 0 && gain > room) gain = Math.max(0, room) + 0.3 * (gain - Math.max(0, room));
  const attrs: Record<string, number> = {};
  for (const k of ATTRS[p.pos]) attrs[k] = clamp(Math.round(p.attrs[k] + gain + rng.gauss(0, 1)), 20, 99);
  // Playing time makes him a known quantity (and counts as experience on the depth chart).
  const played = gp >= 3;
  return {
    ...p, years, class: classOf(years), attrs, ovr: overall(p.pos, attrs), tend: { ...p.tend },
    basis: played || p.basis === "stats" ? "stats" : p.basis, sample: p.sample + gp * (p.pos === "QB" ? 30 : 8),
  };
}

/**
 * A generated freshman at a position, rated like the team's own recent classes. A walk-on (a league with
 * recruiting, where the signing class came first) is an unranked player below a typical freshman at his
 * position wherever he goes; now and then one turns out.
 */
function freshman(id: number, t: Team, pos: Pos, model: FreshModel, rng: Rng, firsts: string[], lasts: string[], walkOn = false): RatedPlayer {
  const pm = model.pos[pos] ?? { m: -1.5, sd: 0.5 };
  const zz = walkOn ? pm.m - 0.6 + 0.8 * pm.sd * rng.gauss(0, 1) : pm.m + (model.team[t.id] ?? 0) + pm.sd * rng.gauss(0, 1);
  const attrs: Record<string, number> = {};
  for (const k of ATTRS[pos]) attrs[k] = fromZ(zz + 0.47 * rng.gauss(0, 1));
  // His recruiting grade, from how he rates against freshmen at his position (about 0.45 SD a composite SD).
  const rz = (zz - pm.m) / 0.45;
  const c = 0.8684 + 0.0341 * rz;
  const composite = !walkOn && c >= 0.75 ? Math.round(Math.min(1, c) * 10000) / 10000 : null;
  const pick = (xs: string[]) => xs[Math.floor(rng.random() * xs.length)] ?? "";
  const [h, w] = SIZE[pos];
  const lat = t.venue?.lat != null ? Math.round((t.venue.lat + 1.5 * rng.gauss(0, 1)) * 100) / 100 : null;
  const lon = t.venue?.lon != null ? Math.round((t.venue.lon + 1.5 * rng.gauss(0, 1)) * 100) / 100 : null;
  return {
    id, team_id: t.id, first: pick(firsts), last: pick(lasts), pos, listed: pos, class: "FR", years: 0,
    jersey: null, height: Math.round(h + 1.5 * rng.gauss(0, 1)), weight: Math.round(w + 0.06 * w * rng.gauss(0, 1)),
    home: { city: null, state: t.venue?.state ?? null, lat, lon },
    stars: starsFor(composite), composite, natl_rank: null, attrs,
    traits: {
      stamina: fromZ(rng.gauss(pos === "DT" ? -0.5 : pos === "QB" || pos === "OL" ? 0.3 : 0, 0.8)),
      injury: Math.round(clamp(50 + 15 * rng.gauss(0, 1), 1, 99)),
      toughness: fromZ(rng.gauss(0, 0.8)),
      discipline: pos === "OL" ? attrs.discipline : fromZ(rng.gauss(0, 0.8)),
    },
    // Where he tops out: young players have the most room (as the seed's ratings do).
    hidden: { potential: fromZ(zz + (walkOn ? 1.2 + 0.6 * rng.gauss(0, 1) : 1.4 + 0.25 * Math.max(0, rz) + 0.35 * rng.gauss(0, 1) + 0.3)), work_ethic: fromZ(rng.gauss(0, 1)) },
    tend: pos === "QB" ? { scramble: Math.round(clamp(0.08 + 0.03 * rng.gauss(0, 1), 0.03, 0.25) * 1000) / 1000 } : {},
    ovr: overall(pos, attrs), basis: "prior", sample: 0,
  };
}

// ---- next season's schedule --------------------------------------------------------------------
/**
 * Next season's regular season from this one's: the same matchups (conference rotations and series
 * continue), with home and away swapped as home-and-home series do, a year later on the same weekday.
 * Neutral-site games stay where they were. Returns the new start date too.
 */
export function nextSchedule(games: Game[], teams: Team[], start: ISODate, firstId: number): { start: ISODate; schedule: ScheduledGame[] } {
  // 364 days keeps the weekday; a week more when that would open the season before August 22.
  const y = Number(start.slice(0, 4)) + 1;
  const shift = addDays(start, 364) < `${y}-08-22` ? 371 : 364;
  const venue = new Map(teams.map((t) => [t.id, t.venue]));
  let id = firstId;
  const schedule = games.filter((g) => g.kind === "regular").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id)).map((g): ScheduledGame => {
    const [home, away] = g.neutral ? [g.home_id, g.away_id] : [g.away_id, g.home_id];
    const v = venue.get(home);
    return {
      id: id++, week: g.week, date: addDays(g.date, shift), kickoff_et: g.kickoff_et, home_id: home, away_id: away, neutral: g.neutral,
      conference_game: g.conference_game, venue_id: g.neutral ? null : v?.id ?? null, venue: g.neutral ? g.venue : v?.name ?? null, notes: g.label,
    };
  });
  return { start: addDays(start, shift), schedule };
}

// ---- preseason power ---------------------------------------------------------------------------
const KEYS = ["rush_ypc", "rush_explosive", "rush_stuff", "comp_pct", "yds_per_comp", "sack_rate", "int_rate", "fumble_lost_rate", "third_down_bonus"] as const;
const tf = (k: string, v: number) => (k === "rush_ypc" || k === "yds_per_comp" ? Math.log(v) : k === "third_down_bonus" ? v : Math.log(v / (1 - v)));
/**
 * Neutral-site margin against an average team from a team's compiled ratings: a ridge fit to the 2026
 * seed's engine-measured power (R² 0.996, 1.0 point RMSE; scripts/power.ts measures it with 400 games a
 * team, too slow for every offseason). Inputs: offense and defense rates, kicking, pace.
 */
const PM = {
  mu: [0, 1.49612, -2.41301, -1.30374, 0.13114, 2.37765, -2.66186, -3.4563, -4.89809, 0, 1.64056, -1.87103, -1.84867, 0.75814, 2.52824, -2.9643, -4.00577, -4.89559, 0, -0.49568, 41.95703, 68.10998],
  sd: [1, 0.11995, 0.34093, 0.32847, 0.35001, 0.10554, 0.37923, 0.31505, 0.12712, 1, 0.13862, 0.358, 0.35416, 0.32388, 0.13736, 0.31534, 0.3522, 0.13438, 1, 0.59715, 1.72243, 2.3257],
  w: [-13.6797, 2.4251, -0.7495, -0.6994, 2.8328, 1.4294, -1.3538, -0.9414, -0.2413, 0, -2.7538, 0.3259, -0.2913, -3.2848, -2.5865, 0.7114, 0.8751, 0.1746, 0, -0.0322, 0.2164, -0.0007],
};
export function powerModel(r: TeamRatings): number {
  const x = [1, ...KEYS.map((k) => tf(k, r.offense[k])), ...KEYS.map((k) => tf(k, r.defense[k])), r.fg_skill, r.punt_gross, r.plays_per_game];
  return x.reduce((a, v, j) => a + (j ? (v - PM.mu[j]) / PM.sd[j] : 1) * PM.w[j], 0);
}

/** A team's compiled strength with its opening depth chart. */
export function compiled(base: TeamRatings, tp: TeamPlayers): TeamRatings {
  return compileTeam(base, lineup(tp.depth, new Map(tp.players.map((p) => [p.id, p]))), tp.scheme, tp.kicking);
}

/**
 * Next preseason's power: last preseason's, moved by how much the model says the roster changed. (The
 * model's error for a team is mostly the same every year, so the change carries less of it than a fresh fit.)
 */
export function nextPower(prev: number, base: TeamRatings, before: TeamPlayers, after: TeamPlayers): number {
  return Math.round((prev + powerModel(compiled(base, after)) - powerModel(compiled(base, before))) * 10) / 10;
}
