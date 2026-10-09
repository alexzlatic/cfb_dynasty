import { Rng } from "@cfb/engine";
import type { ISODate } from "./dates.ts";
import { mixSeed } from "./hash.ts";
import type { Game, Poll, Team } from "./types.ts";

/**
 * Polls are ballots from a panel of simulated voters, not a sort of true strength.
 *
 * Every voter sees the same results but weighs them differently: how much they trust what a team
 * has shown (power), how much a win or a loss is worth and against whom, how far they lean on brand
 * names, how hard they react to last week, how sticky their own last ballot is, whether they favor
 * their own region, how much unbeaten teams and blowouts impress them, plus plain noise. Each voter
 * ranks 25 teams; points run 25 down to 1, as in the AP poll.
 *
 * The CFP committee is the same machine with a different panel: fewer, steadier members who weigh
 * schedule strength and quality wins more and brand and margin less.
 */
export interface Voter {
  noise: number; trust: number; win: number; loss: number; sos: number; brand: number; recency: number;
  inertia: number; unbeaten: number; margin: number; region: number; lat: number; lon: number;
  /** Beat writers: the team and conference they cover, and how far they lean toward each. */
  team_id?: number | null; conference?: string | null; homer?: number; conf_bias?: number;
}

export interface PanelSpec {
  size: number;
  noise: [number, number]; trust: [number, number]; win: [number, number]; loss: [number, number]; sos: [number, number];
  brand: [number, number]; recency: [number, number]; inertia: [number, number]; unbeaten: [number, number];
  margin: [number, number]; region: [number, number]; champ: number;
}

export const AP_PANEL: PanelSpec = {
  size: 62, noise: [2.0, 4.5], trust: [0.45, 0.75], win: [2.5, 3.5], loss: [-6, -3.5], sos: [0.06, 0.12],
  brand: [0.03, 0.09], recency: [0.12, 0.35], inertia: [0.35, 0.7], unbeaten: [1, 4], margin: [0.02, 0.08], region: [0, 2.5], champ: 2,
};

export const COMMITTEE_PANEL: PanelSpec = {
  size: 13, noise: [0.8, 1.8], trust: [0.5, 0.7], win: [2.8, 3.2], loss: [-5, -4], sos: [0.12, 0.18],
  brand: [0, 0.02], recency: [0.05, 0.12], inertia: [0.2, 0.4], unbeaten: [0.5, 1.5], margin: [0, 0.02], region: [0, 0], champ: 4,
};

/**
 * How ballots react to results, fit to real AP polls 2014-2025 (`npx tsx packages/core/scripts/poll-check.ts`):
 * how far a ranked team drops after a loss by its rank and the opponent's, and how often an unranked
 * team that beats a ranked one enters the next poll. Scales the voters' own weights, so every
 * voter keeps their style.
 */
const REACT = { loss: 0.45, low_loss: 1.5, bad_loss: -3.5, quality_win: 4, recency: 0.5 };

/**
 * Poll memory carried between polls. `b<voter>`: each voter's sticky opinion of every team (the part
 * of the score that isn't the resume); `last`: the last poll's top 25 by rank; `gh`/`ga`: the home
 * and away teams' ranks going into each game (99 unranked). Saves from before these keys held
 * `<voter>` keys, which are dropped.
 */
export type PanelMemory = Record<string, Record<number, number>>;

export function makePanel(spec: PanelSpec, seed: number, teams: Team[], biasScale = 1): Voter[] {
  const rng = new Rng(seed);
  const u = ([a, b]: [number, number]) => a + (b - a) * rng.random();
  const homes = teams.filter((t) => t.level === "fbs" && t.venue.lat != null);
  return Array.from({ length: spec.size }, () => {
    const home = homes[rng.int(homes.length)];
    return {
      noise: u(spec.noise), trust: u(spec.trust), win: u(spec.win), loss: u(spec.loss), sos: u(spec.sos),
      brand: u(spec.brand) * biasScale, recency: u(spec.recency) * biasScale, inertia: u(spec.inertia), unbeaten: u(spec.unbeaten) * biasScale,
      margin: u(spec.margin) * biasScale, region: u(spec.region) * biasScale, lat: home.venue.lat!, lon: home.venue.lon!,
    };
  });
}

const miles = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 7918 * Math.asin(Math.sqrt(x));
};

interface Resume { w: number; l: number; games: { id: number; home: boolean; opp: number; won: boolean; margin: number; date: ISODate; surprise: number }[] }

function resumes(games: Game[], power: Record<number, number>, preseason: Record<number, number>, hfa: number): Map<number, Resume> {
  const out = new Map<number, Resume>();
  for (const g of games) {
    if (g.status !== "final") continue;
    const m = g.home_score! - g.away_score!;
    const exp = (preseason[g.home_id] ?? 0) - (preseason[g.away_id] ?? 0) + (g.neutral ? 0 : hfa);
    for (const [id, opp, sign] of [[g.home_id, g.away_id, 1], [g.away_id, g.home_id, -1]] as const) {
      const r = out.get(id) ?? { w: 0, l: 0, games: [] };
      const won = sign * m > 0;
      if (won) r.w++; else r.l++;
      r.games.push({ id: g.id, home: sign === 1, opp, won, margin: sign * m, date: g.date, surprise: sign * (m - exp) });
      out.set(id, r);
    }
  }
  void power;
  return out;
}

export interface BallotContext {
  date: ISODate; type: Poll["type"]; teams: Team[]; games: Game[]; power: Record<number, number>; preseason: Record<number, number>;
  champs: Set<number>; hfa: number; seed: number; spec: PanelSpec; memory: PanelMemory; biasScale: number; noiseScale: number;
  /** Final poll: every voter puts the national champion first. */
  champion?: number | null;
  /** A fixed panel (the AP beat writers); otherwise one is drawn from `spec`. */
  voters?: Voter[];
}

/** Run one poll. Updates `memory` in place with each voter's new scores. */
export function runPoll(c: BallotContext): Poll & { ballots: number[][] } {
  const fbs = c.teams.filter((t) => t.level === "fbs");
  const voters = c.voters ?? makePanel(c.spec, mixSeed(c.seed, c.type, "panel"), c.teams, c.biasScale);
  const ballots: number[][] = [];
  const rng = new Rng(mixSeed(c.seed, c.type, c.date));
  const res = resumes(c.games, c.power, c.preseason, c.hfa);
  const points = new Map<number, number>(), firsts = new Map<number, number>();
  // Each game is judged by where both teams stood in this poll going into it ("No. 8 falls to
  // unranked Wisconsin"), fixed the first time a poll sees the game.
  const last = c.memory.last ?? {}, homeRank = (c.memory.gh ??= {}), awayRank = (c.memory.ga ??= {});
  for (const g of c.games) if (g.status === "final" && homeRank[g.id] == null) { homeRank[g.id] = last[g.home_id] ?? 99; awayRank[g.id] = last[g.away_id] ?? 99; }
  voters.forEach((v, vi) => {
    // A voter's opinion of a team (what they think of its talent, brand, their own leanings) is sticky
    // from week to week; results are not. Each poll re-weighs the whole resume at full strength, so a
    // loss lands on the ballot the week it happens rather than being averaged in over a month.
    const mem = (c.memory[`b${vi}`] ??= {});
    delete c.memory[vi];
    const scored = fbs.map((t) => {
      const r = res.get(t.id);
      let base = v.trust * (c.power[t.id] ?? 0) + v.brand * ((t.prestige ?? 50) - 50);
      if (c.champs.has(t.id)) base += c.spec.champ;
      if (v.team_id === t.id) base += (v.homer ?? 0) * c.biasScale;
      else if (v.conference && v.conference === t.conference) base += (v.conf_bias ?? 0) * c.biasScale;
      if (v.region && t.venue.lat != null && miles(v.lat, v.lon, t.venue.lat, t.venue.lon!) < 450) base += v.region;
      const last = r?.games[r.games.length - 1];
      if (last) base += REACT.recency * v.recency * Math.max(-21, Math.min(21, last.surprise));
      base += rng.gauss(0, v.noise * c.noiseScale);
      const prev = mem[t.id];
      if (prev != null) base = v.inertia * prev + (1 - v.inertia) * base;
      mem[t.id] = Math.round(base * 100) / 100;
      let s = base;
      if (r) {
        // Losses cost a team that was outside the top five more, and a loss to an unranked team costs
        // extra. Beating a ranked team is a quality win.
        for (const g of r.games) {
          const mine = g.home ? homeRank[g.id] : awayRank[g.id], theirs = g.home ? awayRank[g.id] : homeRank[g.id];
          const low = Math.max(0, Math.min(1, (Math.min(mine, 25) - 5) / 20)), ranked = theirs <= 25;
          s += v.sos * (c.power[g.opp] ?? -30) + v.margin * Math.max(-28, Math.min(28, g.margin));
          if (g.won) s += v.win + (ranked ? REACT.quality_win * v.win / 3 : 0);
          else s += v.loss * REACT.loss * (1 + REACT.low_loss * low) + (ranked ? 0 : REACT.bad_loss * low * v.loss / -4.6);
        }
        if (r.l === 0 && r.w >= 3) s += v.unbeaten;
      }
      if (c.champion === t.id) s += 1000;
      return { id: t.id, s };
    });
    scored.sort((a, b) => b.s - a.s || a.id - b.id);
    scored.slice(0, 25).forEach((x, i) => points.set(x.id, (points.get(x.id) ?? 0) + 25 - i));
    ballots.push(scored.slice(0, 25).map((x) => x.id));
    firsts.set(scored[0].id, (firsts.get(scored[0].id) ?? 0) + 1);
  });
  const ranks = fbs.map((t) => ({ team_id: t.id, points: points.get(t.id) ?? 0, first: firsts.get(t.id) ?? 0 }))
    .sort((a, b) => b.points - a.points || b.first - a.first || (c.power[b.team_id] ?? 0) - (c.power[a.team_id] ?? 0) || a.team_id - b.team_id);
  c.memory.last = Object.fromEntries(ranks.slice(0, 25).map((r, i) => [r.team_id, i + 1]));
  return { date: c.date, type: c.type, ranks, voters: voters.length, ballots };
}

/**
 * BCS standings: average of the AP share, the coaches' share and a computer component (a resume
 * rating with no margin of victory, as the BCS required), each scaled 0 to 1.
 */
export function bcsStandings(date: ISODate, ap: Poll, coaches: Poll, teams: Team[], games: Game[], power: Record<number, number>): Poll {
  const fbs = teams.filter((t) => t.level === "fbs");
  const res = resumes(games, power, power, 0);
  const comp = fbs.map((t) => {
    const r = res.get(t.id);
    const s = r ? r.games.reduce((a, g) => a + (g.won ? 1 : -1) * (1 + 0.04 * ((power[g.opp] ?? -30) + 30)), 0) : 0;
    return { id: t.id, s };
  }).sort((a, b) => b.s - a.s);
  const compRank = new Map(comp.map((x, i) => [x.id, i]));
  const maxAp = 25 * (ap.voters ?? 62), maxCo = 25 * (coaches.voters ?? 62);
  const share = (p: Poll, id: number) => (p.ranks.find((r) => r.team_id === id)?.points ?? 0);
  const ranks = fbs.map((t) => {
    const cr = compRank.get(t.id)!;
    const v = share(ap, t.id) / maxAp + share(coaches, t.id) / maxCo + Math.max(0, 25 - cr) / 25;
    return { team_id: t.id, points: Math.round((v / 3) * 10000) / 10000 };
  }).sort((a, b) => b.points - a.points || a.team_id - b.team_id);
  return { date, type: "bcs", ranks };
}
