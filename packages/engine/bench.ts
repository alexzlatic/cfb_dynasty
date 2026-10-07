/** Speed gate: headless game under 20 ms, a full Saturday under 3 s, a full season under 2 minutes. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSim, Rng } from "./src/index.ts";
import { loadSeed } from "../core/src/index.ts";
import { LeagueManager } from "../server/src/index.ts";

const seed = loadSeed();
const ids = Object.keys(seed.ratings);
let t0 = performance.now();
const n = 2000;
for (let i = 0; i < n; i++) {
  const h = seed.ratings[ids[i % ids.length]].ratings, a = seed.ratings[ids[(i * 7 + 3) % ids.length]].ratings;
  new GameSim(h, a, { rng: new Rng(i), record: false }).play();
}
const perGame = (performance.now() - t0) / n;

const m = new LeagueManager(mkdtempSync(join(tmpdir(), "cfb-bench-")));
const lg = m.create({ name: "Bench", user_team_id: null, seed: 1 });
t0 = performance.now();
const reps = lg.apply({ type: "sim", payload: { kind: "end_of_season" } });
const season = (performance.now() - t0) / 1000;
const busiest = reps.reduce((a, r) => (r.played.length > a.played.length ? r : a));
const lg2 = m.create({ name: "Bench day", user_team_id: null, seed: 2 });
lg2.apply({ type: "sim", payload: { kind: "date", date: busiest.date } });
t0 = performance.now();
lg2.apply({ type: "sim", payload: { kind: "day" } });
const saturday = (performance.now() - t0) / 1000;
m.closeAll();

const rows = [
  ["headless game", `${perGame.toFixed(2)} ms`, perGame < 20],
  [`busiest day (${busiest.date}, ${busiest.played.length} games, recorded and saved)`, `${saturday.toFixed(2)} s`, saturday < 3],
  [`full season (${reps.length} days)`, `${season.toFixed(1)} s`, season < 120],
] as const;
for (const [k, v, ok] of rows) console.log(`${ok ? "pass" : "FAIL"}  ${k}: ${v}`);
if (rows.some((r) => !r[2])) process.exit(1);
