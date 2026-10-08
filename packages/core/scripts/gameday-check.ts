/**
 * Checks game day against real football: snap shares by slot (defensive linemen rotate, quarterbacks
 * and linemen rarely), injuries per team-game, and scoring with substitutions vs without.
 *
 *   npx tsx packages/core/scripts/gameday-check.ts [games]
 */
import { GameSim, Rng } from "@cfb/engine";
import { GameDay, compileTeam, lineup, loadSeed, mixSeed, type Slot } from "../src/index.ts";

process.stdout.on("error", () => process.exit(0));
const N = Number(process.argv[2] ?? 2000);
/** Optional JSON game-day options, e.g. '{"injuries":0,"rotation":false}'. */
const OPTS = JSON.parse(process.argv[3] ?? "{}");
const seed = loadSeed();
const fbs = seed.teams.filter((t) => t.level === "fbs").map((t) => t.id);
const setup = (id: number) => {
  const tp = seed.players![id];
  return { team_id: id, base: seed.ratings[id].ratings, players: tp, depth: tp.depth, out: new Set<number>() };
};

const SLOTS: Slot[] = ["QB", "RB1", "WR_X", "WR_SLOT", "TE1", "LT", "C", "DE1", "DT1", "LB1", "CB1", "S1"];
const DEF = new Set<Slot>(["DE1", "DT1", "LB1", "CB1", "S1"]);
const share: Record<string, number[]> = {};
const fat: Record<string, [number, number]> = {};
let pts = 0, ptsBase = 0, inj = 0, multi = 0, season = 0, qbOut = 0, ms = 0, msBase = 0;
const rng = new Rng(7);
for (let i = 0; i < N; i++) {
  const h = fbs[Math.floor(rng.random() * fbs.length)];
  let a = fbs[Math.floor(rng.random() * fbs.length)];
  if (a === h) a = fbs[(fbs.indexOf(h) + 1) % fbs.length];
  const hs = setup(h), as = setup(a);
  let t0 = performance.now();
  const gd = new GameDay(hs, as, new Rng(mixSeed(1, i, "inj")), OPTS);
  const k = gd.kickoff();
  const g = new GameSim(k.home, k.away, { seed: i, record: false });
  g.play(gd.provider());
  ms += performance.now() - t0;
  const r = gd.result();
  for (const [g, [t, n]] of Object.entries(gd.fatigue)) { const a = (fat[g] ??= [0, 0]); a[0] += t; a[1] += n; }
  pts += g.home.score + g.away.score;
  t0 = performance.now();
  const compile = (s: ReturnType<typeof setup>) => compileTeam(s.base, lineup(s.depth, new Map(s.players.players.map((p) => [p.id, p]))), s.players.scheme, s.players.kicking);
  const b = new GameSim(compile(hs), compile(as), { seed: i, record: false }).play();
  msBase += performance.now() - t0;
  ptsBase += b.home.score + b.away.score;
  for (const s of [hs, as]) {
    const pl = r.plays[s.team_id];
    for (const slot of SLOTS) (share[slot] ??= []).push((r.snaps[s.depth[slot]![0]] ?? 0) / Math.max(1, DEF.has(slot) ? pl.defense : pl.offense));
  }
  for (const x of r.injuries) {
    inj++;
    if ((x.days ?? 0) >= 5) multi++;
    if ((x.days ?? 0) >= 90) season++;
    if (x.pos === "QB" && (x.days ?? 0) >= 5) qbOut++;
  }
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`${N} games`);
console.log("Starter snap share:", SLOTS.map((s) => `${s} ${(100 * avg(share[s])).toFixed(0)}%`).join(", "));
console.log(`Points per game ${(pts / N).toFixed(1)} with game day vs ${(ptsBase / N).toFixed(1)} without`);
const tg = 2 * N;
console.log(`Injuries per team-game ${(inj / tg).toFixed(2)}; out 5+ days ${(multi / tg).toFixed(2)}; season-ending ${(season / tg).toFixed(3)}`);
console.log(`Per 12-game season: ${(12 * multi / tg).toFixed(1)} players out a week or more, ${(12 * season / tg).toFixed(2)} season-ending, starting QB out a week+ ${(100 * (1 - Math.pow(1 - qbOut / tg, 12))).toFixed(0)}% of teams`);
console.log(`ms per game ${(ms / N).toFixed(2)} with game day vs ${(msBase / N).toFixed(2)}`);
console.log("Mean tiredness on the field (SD):", Object.entries(fat).map(([g, [t, n]]) => `${g} ${(t / n).toFixed(3)}`).join(", "));
