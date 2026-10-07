/**
 * Results check gate: the league's Aug 24 strength, used as a point spread, against the real 2026
 * Weeks 1-6 scores (stored for comparison only, never fed to the sim). Pass mark: FBS-vs-FBS mean
 * absolute spread error in the backtest's range (13.6 on 2026 Weeks 0-5); FCS games are reported but
 * their ratings are tuned in M1. A check, not a tuning target.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_SEED_DIR, loadSeed } from "../src/index.ts";

const seed = loadSeed();
const real = new Map<number, { home_points: number; away_points: number }>(
  JSON.parse(readFileSync(DEFAULT_SEED_DIR + "real_results_2026.json", "utf8")).games.map((g: any) => [g.id, g]));
const level = new Map(seed.teams.map((t) => [t.id, t.level]));
let n = 0, abs = 0, sq = 0, right = 0, nFbs = 0, absFbs = 0;
for (const g of seed.schedule) {
  const r = real.get(g.id);
  if (!r || g.week > 6) continue;
  const pred = (seed.power[g.home_id] ?? 0) - (seed.power[g.away_id] ?? 0) + (g.neutral ? 0 : 2.5);
  const act = r.home_points - r.away_points;
  n++; abs += Math.abs(pred - act); sq += (pred - act) ** 2; if (Math.sign(pred) === Math.sign(act)) right++;
  if (level.get(g.home_id) === "fbs" && level.get(g.away_id) === "fbs") { nFbs++; absFbs += Math.abs(pred - act); }
}
const mae = abs / n;
console.log(`Weeks 1-6: ${n} games, spread MAE ${mae.toFixed(2)} (FBS vs FBS ${(absFbs / nFbs).toFixed(2)} on ${nFbs}), RMSE ${Math.sqrt(sq / n).toFixed(2)}, winners ${(100 * right / n).toFixed(1)}%`);
if (!(absFbs / nFbs < 14)) { console.log("FAIL: outside the backtest range"); process.exit(1); }
console.log("pass");
