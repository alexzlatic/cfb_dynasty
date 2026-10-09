/**
 * Poll reaction check: how far the AP poll moves teams after losses, and how often an unranked team
 * that beats a ranked one enters the next poll, sim vs real AP history (2014-2025, no 2020).
 *
 * Sims regular seasons once and caches the games and power ratings at each poll date, then re-votes
 * every poll from scratch with the current panel code, so voter changes can be checked without re-simming.
 *
 *   npx tsx packages/core/scripts/poll-check.ts [seasons] [cache.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AP_PANEL, generateWriters, loadSeed, runPoll, Season, type Game, type PanelMemory, type Team } from "../src/index.ts";

const seasons = Number(process.argv[2] || 6);
const cachePath = process.argv[3];

/** Real AP Top 25, 2014-2019 and 2021-2025 regular seasons (CFBD /rankings and /games). */
const REAL = {
  loss: {
    "1-5": { ranked: [4.9, 0], unranked: [6.6, 0] }, "6-10": { ranked: [5.5, 0], unranked: [9.1, 4] },
    "11-15": { ranked: [5.9, 6], unranked: [11.3, 38] }, "16-25": { ranked: [6.8, 62], unranked: [8.8, 93] },
  } as Record<string, Record<string, [number, number]>>,
  win: { "1-5": -0.1, "6-10": -0.8, "11-15": -1.8, "16-25": -2.6 } as Record<string, number>,
  upset: { "1-5": [43, 19.7], "6-10": [42, 20.6], "11-15": [38, 20.6], "16-25": [27, 22.2] } as Record<string, number[]>,
};

interface Snap { date: string; power: Record<number, number>; champs: number[] }
interface Run { seed: number; games: Game[]; preseason: Record<number, number>; snaps: Snap[] }

const seedBundle = loadSeed();
function sim(n: number): Run {
  const s = Season.create(seedBundle, { seed: n, settings: { keep_pbp: "none" } as never });
  const snaps: Snap[] = [];
  while (!s.done && s.state.date < `${s.state.year}-12-01`) {
    const r = s.advanceDay();
    if (r.polls.some((p) => p.type === "ap")) snaps.push({ date: r.date ?? s.state.date, power: { ...s.state.power }, champs: Object.values(s.state.conf_champs) });
  }
  return { seed: n, games: s.state.games.filter((g) => g.status === "final"), preseason: s.state.preseason_power, snaps };
}

let runs: Run[] = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : [];
if (runs.length < seasons) {
  for (let i = runs.length; i < seasons; i++) { runs.push(sim(9100 + i)); console.error(`simmed ${i + 1}/${seasons}`); }
  if (cachePath) writeFileSync(cachePath, JSON.stringify(runs));
}
runs = runs.slice(0, seasons);

const teams: Team[] = [...seedBundle.teams].sort((a, b) => a.id - b.id);
const fbs = new Set(teams.filter((t) => t.level === "fbs").map((t) => t.id));
const bucket = (r: number) => (r <= 5 ? "1-5" : r <= 10 ? "6-10" : r <= 15 ? "11-15" : "16-25");
const out = new Map<string, number[][]>();
const add = (k: string, v: number[]) => out.set(k, [...(out.get(k) ?? []), v]);

for (const run of runs) {
  const writers = generateWriters(seedBundle.teams, seedBundle.rosters, run.seed >>> 0);
  const memory: PanelMemory = {};
  const polls = run.snaps.map((sn) => {
    const games = run.games.filter((g) => g.date < sn.date);
    const p = runPoll({ voters: writers.map((w) => w.voter), date: sn.date, type: "ap", teams, games, power: sn.power, preseason: run.preseason,
      champs: new Set(sn.champs), hfa: 2.5, seed: run.seed, spec: AP_PANEL, memory, biasScale: 1, noiseScale: 1 });
    return { date: sn.date, rank: new Map(p.ranks.slice(0, 25).map((r, i) => [r.team_id, i + 1])) };
  });
  for (let i = 0; i + 1 < polls.length; i++) {
    const pre = polls[i], post = polls[i + 1];
    const gs = run.games.filter((g) => g.date >= pre.date && g.date < post.date);
    const cnt = new Map<number, number>();
    for (const g of gs) for (const id of [g.home_id, g.away_id]) cnt.set(id, (cnt.get(id) ?? 0) + 1);
    for (const g of gs) for (const [me, op, ms, os] of [[g.home_id, g.away_id, g.home_score!, g.away_score!], [g.away_id, g.home_id, g.away_score!, g.home_score!]]) {
      if (!fbs.has(me) || cnt.get(me) !== 1) continue;
      const mr = pre.rank.get(me), orank = pre.rank.get(op), nr = post.rank.get(me) ?? 30;
      if (mr && ms < os) add(`loss ${bucket(mr)} ${orank ? "ranked" : "unranked"}`, [nr - mr, nr === 30 ? 1 : 0]);
      if (mr && ms > os) add(`win ${bucket(mr)}`, [nr - mr]);
      if (!mr && ms > os && orank && fbs.has(me)) add(`upset ${bucket(orank)}`, [nr < 30 ? 1 : 0, nr]);
    }
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const col = (k: string, j = 0) => (out.get(k) ?? []).map((v) => v[j]);
console.log(`${runs.length} simmed regular seasons vs real AP 2014-2025\n`);
console.log("Ranked team loses           n   avg drop sim/real   fell out sim/real");
for (const b of ["1-5", "6-10", "11-15", "16-25"]) for (const o of ["ranked", "unranked"]) {
  const k = `loss ${b} ${o}`, [rd, ro] = REAL.loss[b][o];
  console.log(`  No. ${b.padEnd(5)} to ${o.padEnd(8)} ${String(col(k).length).padStart(4)}   ${mean(col(k)).toFixed(1).padStart(5)} / ${rd.toFixed(1).padStart(4)}     ${(100 * mean(col(k, 1))).toFixed(0).padStart(3)}% / ${String(ro).padStart(2)}%`);
}
console.log("\nRanked team wins            n   avg move sim/real");
for (const b of ["1-5", "6-10", "11-15", "16-25"]) console.log(`  No. ${b.padEnd(17)} ${String(col(`win ${b}`).length).padStart(4)}   ${mean(col(`win ${b}`)).toFixed(1).padStart(5)} / ${REAL.win[b].toFixed(1).padStart(4)}`);
console.log("\nUnranked team beats a ranked one   n   enters poll sim/real   new rank sim/real");
for (const b of ["1-5", "6-10", "11-15", "16-25"]) {
  const k = `upset ${b}`, ranks = col(k, 1).filter((r) => r < 30);
  console.log(`  beats No. ${b.padEnd(17)} ${String(col(k).length).padStart(4)}   ${(100 * mean(col(k))).toFixed(0).padStart(4)}% / ${REAL.upset[b][0]}%       ${mean(ranks).toFixed(1).padStart(4)} / ${REAL.upset[b][1]}`);
}
